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
    if (snapshot.docs.length < 25) {
        throw new Error("لا توجد كلمات كافية في قاعدة البيانات. تحتاج إلى 25 كلمة على الأقل.");
    }
    
    const allWords = snapshot.docs.map(doc => doc.data().text as string);
    const shuffledWords = shuffle(allWords).slice(0, 25);
    
    // 9 Red, 8 Blue, 7 Neutral, 1 Assassin
    const redCount = 9;
    const blueCount = 8;
    const neutralCount = 7;
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

export async function startWordWarGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 4) throw new Error("The game requires at least 4 players.");
        if (game.players.some(p => !p.team)) throw new Error("All players must be assigned to a team.");
        
        const cards = await generateCards();
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        const redTeam = game.players.filter(p => p.team === 'red');
        const blueTeam = game.players.filter(p => p.team === 'blue');
        
        if (redTeam.length === 0 || blueTeam.length === 0) throw new Error("Each team must have at least one player.");

        const shuffledRedTeam = shuffle(redTeam);
        const shuffledBlueTeam = shuffle(blueTeam);
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
            'wordWarState.guessesLeft': count, // Strictly the count number. A bonus guess can be added on the frontend display.
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}

export async function revealCard(gameId: string, playerId: string, cardIndex: number) {
    let gameDataForLeagueUpdate: Game | null = null;
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;

        const card = game.wordWarState.cards[cardIndex];
        if (card.revealed) return; // Card already revealed.
        
        const currentTeam = game.wordWarState.turn;
        const guessesLeft = game.wordWarState.guessesLeft!;

        let updates: any = {
             [`wordWarState.cards.${cardIndex}.revealed`]: true,
        };

        const checkWinCondition = (cards: WordWarCard[]) => {
            const redLeft = cards.filter(c => c.color === 'red' && !c.revealed).length;
            const blueLeft = cards.filter(c => c.color === 'blue' && !c.revealed).length;
            if (redLeft === 0) return { winner: 'red', message: 'كشف الفريق الأحمر جميع كلماته!' };
            if (blueLeft === 0) return { winner: 'blue', message: 'كشف الفريق الأزرق جميع كلماته!' };
            return null;
        }

        let winner: Game['gameResult'] | null = null;

        if (card.color === 'assassin') {
             winner = { winner: currentTeam === 'red' ? 'blue' : 'red', message: 'تم كشف القاتل!' };
        } else {
             if (card.color === wwState.turn) { // Correct guess
                updates['wordWarState.guessesLeft'] = guessesLeft - 1;
                winner = checkWinCondition([...game.wordWarState.cards.slice(0, cardIndex), { ...card, revealed: true }, ...game.wordWarState.cards.slice(cardIndex + 1)]);
             } else { // Wrong guess (opponent or neutral)
                 winner = checkWinCondition([...game.wordWarState.cards.slice(0, cardIndex), { ...card, revealed: true }, ...game.wordWarState.cards.slice(cardIndex + 1)]);
                 if (!winner) {
                     updates.gameState = 'guide_turn';
                     updates['wordWarState.turn'] = currentTeam === 'red' ? 'blue' : 'red';
                     updates['wordWarState.currentHint'] = null;
                     updates['wordWarState.guessesLeft'] = 0;
                     updates['wordWarState.suspicions'] = {};
                 }
             }

             if (guessesLeft <= 1 && card.color === wwState.turn && !winner) {
                 updates.gameState = 'guide_turn';
                 updates['wordWarState.turn'] = currentTeam === 'red' ? 'blue' : 'red';
                 updates['wordWarState.currentHint'] = null;
                 updates['wordWarState.guessesLeft'] = 0;
                 updates['wordWarState.suspicions'] = {};
             }
        }
        
        if (winner) {
            updates.gameState = 'board_reveal';
            updates.gameResult = winner;
            gameDataForLeagueUpdate = { ...game, ...updates };
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

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTeam,
            'wordWarState.currentHint': null,
            'wordWarState.guessesLeft': 0,
            'wordWarState.suspicions': {},
            'wordWarState.timerEndsAt': deleteField(),
        });
    });
}

export async function handleTimeout(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) return;
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) return; // Only the host can trigger the timeout.
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

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTeam,
            'wordWarState.currentHint': null,
            'wordWarState.guessesLeft': 0,
            'wordWarState.suspicions': {},
            'wordWarState.timerEndsAt': deleteField(),
        });
    });
}

export async function toggleSuspicion(gameId: string, playerId: string, cardIndex: number) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;
        
        const player = game.players.find(p => p.id === playerId);
        if (!player?.team) throw new Error("Player not assigned to a team.");

        const suspicions = game.wordWarState.suspicions || {};
        const cardSuspicions = suspicions[cardIndex] || [];
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
                [`wordWarState.suspicions.${cardIndex}`]: deleteField()
            });
        } else {
            transaction.update(gameRef, {
                [`wordWarState.suspicions.${cardIndex}`]: newCardSuspicions
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
