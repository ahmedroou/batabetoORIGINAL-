
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, collection, getDocs, Timestamp, query, orderBy, limit, deleteField } from 'firebase/firestore';
import type { Game, WordWarCard } from '@/types';

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


export async function startGame(gameId: string, hostId: string) {
    await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId);
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.gameState !== 'lobby') return;
        if (game.players.length < 4 || game.players.length % 2 !== 0) {
            throw new Error("تتطلب اللعبة عددًا زوجيًا من اللاعبين (4 على الأقل).");
        }
        
        // --- Distribute players into teams ---
        const shuffledPlayers = [...game.players].sort(() => Math.random() - 0.5);
        const midPoint = Math.ceil(shuffledPlayers.length / 2);
        const teamRedPlayers = shuffledPlayers.slice(0, midPoint);
        const teamBluePlayers = shuffledPlayers.slice(midPoint);

        const updatedPlayers = game.players.map(p => {
            if (teamRedPlayers.some(rp => rp.id === p.id)) return { ...p, team: 'red' as const };
            if (teamBluePlayers.some(bp => bp.id === p.id)) return { ...p, team: 'blue' as const };
            return p;
        });

        // --- Assign guides fairly ---
        const previousRedGuide = game.wordWarState?.previousGuides?.red;
        const previousBlueGuide = game.wordWarState?.previousGuides?.blue;
        
        const potentialRedGuides = teamRedPlayers.filter(p => p.id !== previousRedGuide);
        const potentialBlueGuides = teamBluePlayers.filter(p => p.id !== previousBlueGuide);

        const redGuideId = (potentialRedGuides.length > 0 ? potentialRedGuides[0] : teamRedPlayers[0]).id;
        const blueGuideId = (potentialBlueGuides.length > 0 ? potentialBlueGuides[0] : teamBluePlayers[0]).id;
        
        // --- Create cards ---
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
        
        const turnTime = game.wordWarState?.settings?.turnTime || 30;

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'guide_turn',
            'wordWarState.cards': cards,
            'wordWarState.turn': 'red',
            'wordWarState.guides': { red: redGuideId, blue: blueGuideId },
            'wordWarState.previousGuides': { red: redGuideId, blue: blueGuideId },
            'wordWarState.currentHint': deleteField(),
            'wordWarState.guessesLeft': 0,
            'wordWarState.turnResult': deleteField(),
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}

export async function submitHint(gameId: string, playerId: string, word: string, count: number) {
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
        
        const turnTime = game.wordWarState?.settings?.turnTime || 30;

        transaction.update(gameRef, {
            gameState: 'guesser_turn',
            'wordWarState.currentHint': { word, count },
            'wordWarState.guessesLeft': count,
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
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
        if (card.revealed) return; // Can't reveal already revealed card

        cards[cardIndex].revealed = true;

        let nextTurn = wwState.turn;
        let guessesLeft = wwState.guessesLeft! - 1;
        let winner: Game['gameResult'] | null = null;
        
        const endCurrentTurn = () => {
            const turnTime = game.wordWarState?.settings?.turnTime || 30;
            transaction.update(gameRef, {
                'wordWarState.cards': cards,
                gameState: 'guide_turn',
                'wordWarState.turn': wwState.turn === 'red' ? 'blue' : 'red',
                'wordWarState.guessesLeft': 0,
                'wordWarState.currentHint': deleteField(),
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
        const turnTime = game.wordWarState?.settings?.turnTime || 30;

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTurn,
            'wordWarState.guessesLeft': 0,
            'wordWarState.currentHint': deleteField(),
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
        
        const player = game.players.find(p => p.id === playerId);
        if(!player || player.team !== wwState.turn) return;


        const nextTurn = wwState.turn === 'red' ? 'blue' : 'red';
        const turnTime = game.wordWarState?.settings?.turnTime || 30;

        transaction.update(gameRef, {
            gameState: 'guide_turn',
            'wordWarState.turn': nextTurn,
            'wordWarState.guessesLeft': 0,
            'wordWarState.currentHint': deleteField(),
            'wordWarState.timerEndsAt': Timestamp.fromMillis(Date.now() + turnTime * 1000),
        });
    });
}
