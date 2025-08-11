

/**
 * @fileoverview Actions specific to the "Word War" game.
 */

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    collection,
    query,
    where,
    getDocs,
    Timestamp,
    getDoc,
    FieldValue,
    increment,
    writeBatch,
    setDoc,
    deleteField,
    arrayUnion,
    updateDoc,
    arrayRemove,
} from 'firebase/firestore';
import type { Game, Player, UserProfile, League, WordWarCard } from '@/types';
import { shuffle } from './helpers';
import { updateLeagueScoresForGameEnd } from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';

const generateCards = async (): Promise<WordWarCard[]> => {
    const wordsCol = collection(db, 'word_war_words');
    const snapshot = await getDocs(wordsCol);
    const WORD_COUNT = 40;
    if (snapshot.docs.length < WORD_COUNT) {
        throw new Error(`لا توجد كلمات كافية في قاعدة البيانات. تحتاج إلى ${WORD_COUNT} كلمة على الأقل.`);
    }
    
    const allWords = snapshot.docs.map(doc => doc.data().text as string);
    const shuffledWords = shuffle(allWords).slice(0, WORD_COUNT);
    
    // 15 Red, 14 Blue, 10 Neutral, 1 Assassin
    const redCount = 15;
    const blueCount = 14;
    const neutralCount = 10;
    const assassinCount = 1;

    const colors: WordWarCard['color'][] = [
        ...Array(redCount).fill('red'),
        ...Array(blueCount).fill('blue'),
        ...Array(neutralCount).fill('neutral'),
        ...Array(assassinCount).fill('assassin'),
    ];
    
    const shuffledColors = shuffle(colors);

    const cards: WordWarCard[] = shuffledWords.map((word, index) => ({
        text: word,
        color: shuffledColors[index],
        revealed: false,
    }));
    
    return shuffle(cards);
};

export async function updateGameSettings(gameId: string, hostId: string, settings: Game['wordWarState']['settings']) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'wordWarState.settings': settings });
    });
}

export async function randomizeTeams(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can randomize teams.");
        if (game.gameState !== 'lobby') throw new Error("Can only randomize teams in the lobby.");

        const shuffledPlayers = shuffle(game.players);
        const half = Math.ceil(shuffledPlayers.length / 2);
        
        const updatedPlayers = game.players.map(p => {
             const indexInShuffled = shuffledPlayers.findIndex(sp => sp.id === p.id);
             if (indexInShuffled === -1) return p;
             const team = indexInShuffled < half ? 'red' : 'blue';
             return { ...p, team };
        });

        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function selectTeam(gameId: string, playerId: string, team: 'red' | 'blue') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player) throw new Error("Player not found in game.");

        transaction.update(gameRef, {
            players: game.players.map(p => p.id === playerId ? { ...p, team: team } : p)
        });
    });
}

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        
        const activePlayers = game.players.filter(p => p.status !== 'left');
        if (activePlayers.some(p => !p.team)) throw new Error("All players must be assigned to a team.");
        
        const teamRedPlayers = game.players.filter(p => p.team === 'red');
        const teamBluePlayers = game.players.filter(p => p.team === 'blue');
        
        if (teamRedPlayers.length < 2 || teamBluePlayers.length < 2) {
            throw new Error("يجب أن يكون لدى كل فريق لاعبان على الأقل لبدء اللعبة.");
        }

        const cards = await generateCards();
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        const shuffledRedTeam = shuffle(teamRedPlayers);
        const shuffledBlueTeam = shuffle(teamBluePlayers);
        const redGuideId = shuffledRedTeam[0].id;
        const blueGuideId = shuffledBlueTeam[0].id;
        
        transaction.update(gameRef, {
            gameState: 'preparation',
            'wordWarState.cards': cards,
            'wordWarState.turn': 'red',
            'wordWarState.guides': { red: redGuideId, blue: blueGuideId },
            'wordWarState.currentHint': null,
            'wordWarState.guessesLeft': 0,
            'wordWarState.suspicions': {},
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + 15 * 1000),
        });
    });
}

export async function setGuide(gameId: string, hostId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change guides.");
        if (game.gameState !== 'lobby') throw new Error("Guides can only be changed in the lobby.");
        
        const player = game.players.find(p => p.id === playerId);
        if (!player || !player.team) throw new Error("Player not found or not in a team.");
        
        const currentGuides = game.wordWarState?.guides || { red: '', blue: '' };
        
        transaction.update(gameRef, {
            [`wordWarState.guides.${player.team}`]: playerId
        });
    });
}

export async function submitHint(gameId: string, playerId: string, word: string, count: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guide_turn') return;
        if (game.wordWarState.guides[game.wordWarState.turn] !== playerId) throw new Error("ليس دورك كمرشد.");
        
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        transaction.update(gameRef, {
            gameState: 'guesser_turn',
            'wordWarState.currentHint': { word, count },
            'wordWarState.guessesLeft': count,
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}

export async function revealCard(gameId: string, playerId: string, cardText: string) {
    let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        const wwState = game.wordWarState;

        if (!wwState || game.gameState !== 'guesser_turn') return;

        const cards = [...wwState.cards];
        const cardIndex = cards.findIndex(c => c.text === cardText);
        if (cardIndex === -1) throw new Error("Card not found.");
        
        const card = cards[cardIndex];
        if (card.revealed) return;

        const newCard = { ...card, revealed: true };
        const newCards = [...cards.slice(0, cardIndex), newCard, ...cards.slice(cardIndex + 1)];
        
        let updates: any = {
             'wordWarState.cards': newCards,
        };

        const guessesLeft = wwState.guessesLeft! - 1;

        const checkWinCondition = (currentCards: WordWarCard[]) => {
            const redLeft = currentCards.filter(c => c.color === 'red' && !c.revealed).length;
            const blueLeft = currentCards.filter(c => c.color === 'blue' && !c.revealed).length;
            if (redLeft === 0) return { winner: 'red', message: 'كشف الفريق الأحمر جميع كلماته!' };
            if (blueLeft === 0) return { winner: 'blue', message: 'كشف الفريق الأزرق جميع كلماته!' };
            return null;
        }

        let winner: Game['gameResult'] | null = null;
        let turnShouldEnd = false;

        if (card.color === 'assassin') {
             winner = { winner: wwState.turn === 'red' ? 'blue' : 'red', message: 'تم كشف القاتل!' };
        } else if (card.color === 'neutral') {
            turnShouldEnd = true;
        } else if (card.color !== wwState.turn) {
            turnShouldEnd = true;
        }

        // Check for win AFTER revealing the current card but BEFORE ending the turn
        const winCheckResult = checkWinCondition(newCards);
        if (winCheckResult) {
            winner = winCheckResult;
        }
        
        if (winner) {
            updates.gameState = 'board_reveal';
            updates.gameResult = winner;
            updates['wordWarState.timerEndsAt'] = deleteField();
            gameDataForLeagueUpdate = { ...game, ...updates, gameResult: winner }; // Capture state for league update
            transaction.update(gameRef, updates);
            return;
        } 
        
        if (turnShouldEnd || guessesLeft <= 0) {
            const turnTime = game.wordWarState?.settings?.turnTime || 60;
            updates.gameState = 'guide_turn';
            updates['wordWarState.turn'] = wwState.turn === 'red' ? 'blue' : 'red';
            updates['wordWarState.currentHint'] = null;
            updates['wordWarState.guessesLeft'] = 0;
            updates['wordWarState.suspicions'] = {};
            updates['wordWarState.timerEndsAt'] = Timestamp.fromMillis(Date.now() + turnTime * 1000);
        } else {
            updates['wordWarState.guessesLeft'] = guessesLeft;
        }

        transaction.update(gameRef, updates);
    });

    if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}

export async function endTurn(gameId: string, playerId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;

        const currentTeam = game.wordWarState.turn;
        const nextTeam = currentTeam === 'red' ? 'blue' : 'red';
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTeam,
            'wordWarState.currentHint': null,
            'wordWarState.guessesLeft': 0,
            'wordWarState.suspicions': {},
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}

export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (!game.wordWarState?.timerEndsAt || Date.now() < game.wordWarState.timerEndsAt.toMillis()) {
            return; // Timer hasn't expired server-side.
        }
        
        if (game.gameState === 'preparation') {
             transaction.update(gameRef, {
                 gameState: 'guide_turn',
                  'wordWarState.timerEndsAt': deleteField(),
            });
            return;
        }

        const currentTeam = game.wordWarState.turn;
        const nextTeam = currentTeam === 'red' ? 'blue' : 'red';
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTeam,
            'wordWarState.currentHint': null,
            'wordWarState.guessesLeft': 0,
            'wordWarState.suspicions': {},
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}

export async function toggleSuspicion(gameId: string, playerId: string, cardText: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player?.team) throw new Error("Player not assigned to a team.");

        const suspicions = game.wordWarState.suspicions || {};
        const cardSuspicions = suspicions[cardText] || [];
        const isSuspectedByMe = cardSuspicions.includes(playerId);

        let newCardSuspicions;
        if (isSuspectedByMe) {
            newCardSuspicions = cardSuspicions.filter(id => id !== playerId);
        } else {
            newCardSuspicions = [...cardSuspicions, playerId];
        }

        if (newCardSuspicions.length === 0) {
            // If the array is empty, remove the key from the map
            transaction.update(gameRef, {
                [`wordWarState.suspicions.${cardText}`]: deleteField()
            });
        } else {
            transaction.update(gameRef, {
                [`wordWarState.suspicions.${cardText}`]: newCardSuspicions
            });
        }
    });
}

export async function proceedToFinalResults(gameId: string, hostId: string) {
    let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can proceed.");
        if (game.gameState !== 'board_reveal') return;

        gameDataForLeagueUpdate = game;

        transaction.update(gameRef, {
            gameState: 'final_results',
        });
    });
     if (gameDataForLeagueUpdate) {
        await updateLeagueScoresForGameEnd(gameDataForLeagueUpdate);
    }
}
