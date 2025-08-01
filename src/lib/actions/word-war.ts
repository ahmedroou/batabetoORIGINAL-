

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, collection, getDocs, Timestamp, query, orderBy, limit, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import type { Game, WordWarCard, Player } from '@/types';

async function getWords(count: number): Promise<string[]> {
    const wordsCol = collection(db, 'word_war_words');
    const snapshot = await getDocs(wordsCol);
    if (snapshot.empty) throw new Error("لا توجد كلمات في قاعدة البيانات للعبة حرب الكلمات.");

    const allWords = snapshot.docs.map(doc => doc.data().text as string);
    
    // Shuffle all words
    for (let i = allWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allWords[i], allWords[j]] = [allWords[j], allWords[i]];
    }

    return allWords.slice(0, count);
}

export async function selectTeam(gameId: string, playerId: string, team: 'red' | 'blue') {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found.');
        const game = gameDoc.data() as Game;
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error('Player not found.');

        const updatedPlayers = [...game.players];
        updatedPlayers[playerIndex].team = team;
        
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function randomizeTeams(gameId: string, hostId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error("Only the host can randomize teams.");

        const playersToAssign = game.players.filter(p => p.status !== 'left');
        const shuffledPlayers = [...playersToAssign].sort(() => Math.random() - 0.5);
        const midPoint = Math.ceil(shuffledPlayers.length / 2);

        const updatedPlayers = game.players.map(p => {
            const indexInShuffled = shuffledPlayers.findIndex(sp => sp.id === p.id);
            if (indexInShuffled === -1) return p; // Keep status for left players
            const team = indexInShuffled < midPoint ? 'red' : 'blue';
            return { ...p, team };
        });

        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function startGame(gameId: string, hostId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return;
        
        const activePlayers = game.players.filter(p => p.status !== 'left');
        if (activePlayers.length < 4) throw new Error("يجب وجود 4 لاعبين على الأقل لبدء اللعبة.");
        if (activePlayers.some(p => !p.team)) throw new Error("يجب على جميع اللاعبين اختيار فريق.");

        const teamRedPlayers = activePlayers.filter(p => p.team === 'red');
        const teamBluePlayers = activePlayers.filter(p => p.team === 'blue');
        if (teamRedPlayers.length !== teamBluePlayers.length) throw new Error("يجب أن تكون الفرق متوازنة.");
        
        const previousRedGuide = game.wordWarState?.previousGuides?.red;
        const previousBlueGuide = game.wordWarState?.previousGuides?.blue;
        
        const potentialRedGuides = teamRedPlayers.filter(p => p.id !== previousRedGuide);
        const potentialBlueGuides = teamBluePlayers.filter(p => p.id !== previousBlueGuide);

        const redGuideId = (potentialRedGuides.length > 0 ? potentialRedGuides[0] : teamRedPlayers[0]).id;
        const blueGuideId = (potentialBlueGuides.length > 0 ? potentialBlueGuides[0] : teamBluePlayers[0]).id;
        
        const words = await getWords(40);
        const colors: WordWarCard['color'][] = [
            ...Array(15).fill('red'),
            ...Array(15).fill('blue'),
            ...Array(9).fill('neutral'),
            'assassin'
        ];
        const shuffledColors = colors.sort(() => Math.random() - 0.5);
        const cards: WordWarCard[] = words.map((text, index) => ({
            text,
            color: shuffledColors[index],
            revealed: false,
        }));
        
        const PREP_TIME = 15;

        transaction.update(gameRef, {
            gameState: 'preparation',
            'wordWarState.cards': cards,
            'wordWarState.turn': 'red',
            'wordWarState.guides': { red: redGuideId, blue: blueGuideId },
            'wordWarState.previousGuides': { red: redGuideId, blue: blueGuideId },
            'wordWarState.currentHint': deleteField(),
            'wordWarState.guessesLeft': 0,
            'wordWarState.turnResult': deleteField(),
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + PREP_TIME * 1000),
            'wordWarState.suspicions': {},
        });
    });
}

export async function prepareGameStart(gameId: string, hostId: string) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the turn.");
        if (game.gameState !== 'preparation') return;

        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}

export async function submitHint(gameId: string, playerId: string, word: string, count: number) {
    if (word.length > 8) throw new Error("التلميح يجب ألا يتجاوز 8 أحرف.");
    if (/\s/.test(word)) throw new Error("التلميح لا يجب أن يحتوي على مسافات.");

    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guide_turn') return;
        
        const wwState = game.wordWarState!;
        const currentTurnTeam = wwState.turn;
        if (wwState.guides[currentTurnTeam] !== playerId) {
            throw new Error("ليس دورك لتقديم تلميح.");
        }
        
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        transaction.update(gameRef, {
            gameState: 'guesser_turn',
            'wordWarState.currentHint': { word, count },
            'wordWarState.guessesLeft': count,
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
            'wordWarState.suspicions': {}, // Clear suspicions at the start of the guesser's turn
        });
    });
}


export async function revealCard(gameId: string, playerId: string, cardIndex: number) {
     await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;
        
        const wwState = game.wordWarState!;
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.team !== wwState.turn) {
            throw new Error("ليس دور فريقك للتخمين.");
        }
        if (wwState.guides[player.team] === playerId) {
            throw new Error("لا يمكن للمرشد التخمين.");
        }
        
        const cards = [...wwState.cards];
        const card = cards[cardIndex];
        if (card.revealed) return;

        cards[cardIndex].revealed = true;

        let guessesLeft = wwState.guessesLeft! - 1;
        let winner: Game['gameResult'] | null = null;
        
        const endCurrentTurn = () => {
            const turnTime = game.wordWarState?.settings?.turnTime || 60;
            transaction.update(gameRef, {
                'wordWarState.cards': cards,
                gameState: 'guide_turn',
                'wordWarState.turn': wwState.turn === 'red' ? 'blue' : 'red',
                'wordWarState.guessesLeft': 0,
                'wordWarState.currentHint': deleteField(),
                'wordWarState.suspicions': {},
                'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
            });
        };

        if (card.color === 'assassin') {
            const losingTeam = wwState.turn;
            const winningTeam = losingTeam === 'red' ? 'blue' : 'red';
            winner = { winner: winningTeam, message: `كشف الفريق ${losingTeam === 'red' ? 'الأحمر' : 'الأزرق'} الكلمة السوداء!` };
        } else if (card.color === 'neutral') {
            endCurrentTurn();
            return;
        } else if (card.color !== wwState.turn) {
            endCurrentTurn();
        } else { // Correct guess
            const redCardsLeft = cards.filter(c => c.color === 'red' && !c.revealed).length;
            const blueCardsLeft = cards.filter(c => c.color === 'blue' && !c.revealed).length;
            if (redCardsLeft === 0) {
                winner = { winner: 'red', message: 'كشف الفريق الأحمر جميع كلماته بنجاح!' };
            } else if (blueCardsLeft === 0) {
                winner = { winner: 'blue', message: 'كشف الفريق الأزرق جميع كلماته بنجاح!' };
            }
        }
        
        if (winner) {
            transaction.update(gameRef, {
                'wordWarState.cards': cards,
                gameState: 'final_results',
                gameResult: winner,
                'wordWarState.suspicions': {},
                'wordWarState.timerEndsAt': deleteField(),
            });
            return;
        }

        if (guessesLeft === 0 && card.color === wwState.turn) {
            endCurrentTurn();
        } else {
             transaction.update(gameRef, {
                'wordWarState.cards': cards,
                'wordWarState.guessesLeft': guessesLeft,
                'wordWarState.suspicions': {},
            });
        }
    });
}

export async function endTurn(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'guesser_turn') return;
        
        const wwState = game.wordWarState!;
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.team !== wwState.turn || wwState.guides[player.team] === playerId) {
            throw new Error("لا يمكنك إنهاء الدور.");
        }
        
        const nextTurn = wwState.turn === 'red' ? 'blue' : 'red';
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTurn,
            'wordWarState.guessesLeft': 0,
            'wordWarState.currentHint': deleteField(),
            'wordWarState.suspicions': {},
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}

export async function handleTimeout(gameId: string, playerId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        const wwState = game.wordWarState;
        if (!wwState?.timerEndsAt || Date.now() < wwState.timerEndsAt.toMillis()) {
            return;
        }
        
        if (game.gameState === 'preparation') {
            const turnTime = game.wordWarState?.settings?.turnTime || 60;
            transaction.update(gameRef, {
                gameState: 'guide_turn',
                'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
            });
            return;
        }

        const player = game.players.find(p => p.id === playerId);
        if(!player || player.team !== wwState.turn) return;

        const nextTurn = wwState.turn === 'red' ? 'blue' : 'red';
        const turnTime = game.wordWarState?.settings?.turnTime || 60;

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTurn,
            'wordWarState.guessesLeft': 0,
            'wordWarState.currentHint': deleteField(),
            'wordWarState.suspicions': {},
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
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

        const wwState = game.wordWarState!;
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.team !== wwState.turn || wwState.guides[player.team] === playerId) {
            throw new Error("لا يمكنك تحديد بطاقة.");
        }

        const currentSuspicions = wwState.suspicions?.[playerId] || [];
        const isSuspected = currentSuspicions.includes(cardIndex);
        
        transaction.update(gameRef, {
            [`wordWarState.suspicions.${playerId}`]: isSuspected
                ? arrayRemove(cardIndex)
                : arrayUnion(cardIndex)
        });
    });
}


export async function updateGameSettings(gameId: string, hostId: string, settings: Game['wordWarState']['settings']) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can change settings.");
        if (game.gameState !== 'lobby') throw new Error("Settings can only be changed in the lobby.");

        transaction.update(gameRef, { 'wordWarState.settings': settings });
    });
}
