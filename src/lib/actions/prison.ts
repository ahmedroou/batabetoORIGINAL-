
/**
 * @fileoverview Actions specific to the "The Prison" game.
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
} from 'firebase/firestore';
import type { Game, Player, PrisonQuestion } from '@/types';

function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function startPrisonGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        if (game.hostId !== hostId) throw new Error("Only the host can start the game.");
        if (game.players.length < 3) throw new Error("The game requires at least 3 players.");

        const activePlayers = game.players.filter(p => p.status === 'alive');
        
        // Assign roles
        const shuffledPlayers = shuffle([...activePlayers]);
        const judge = shuffledPlayers[0];
        const contestants = shuffledPlayers.slice(1);

        const updatedPlayers = game.players.map(p => {
            if (p.id === judge.id) {
                return { ...p, role: 'judge' };
            }
            return { ...p, role: 'contestant' };
        });
        
        // Get first question
        const q = query(collection(db, "prison_questions"));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            throw new Error(`لا توجد أسئلة للعبة السجن. يرجى رفع المزيد من الأسئلة من صفحة الأدمن.`);
        }
        const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PrisonQuestion, 'id'> }));
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

        transaction.update(gameRef, {
            players: updatedPlayers,
            gameState: 'round1_answering',
            round: 1,
            playerScores: {}, // This will store rounds outside prison
            prisonState: {
                settings: game.prisonState?.settings || { biddingTime: 30, answeringTime: 45, rounds: 10 },
                judgeId: judge.id,
                currentQuestion: randomQuestion,
                prisonLog: [],
                roundsSinceLastWin: contestants.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
                bids: {},
                withdrawnBidders: [],
            },
        });
    });
}
