
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, updateDoc } from 'firebase/firestore';
import type { Game, ChallengeResult, Player } from '@/types';
import { GENIUS_CHALLENGES } from '@/data/genius-challenges';
import { generateGeniusChallenge } from '@/ai/flows/generate-genius-challenge';

export async function startKingOfGeniusGame(gameId: string) {
    const gameRef = doc(db, "games", gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("لم يتم العثور على اللعبة.");
        
        // Authorization is handled by Firestore security rules, which check
        // if request.auth.uid matches the game's hostId.

        transaction.update(gameRef, { gameState: 'instructions' });
    });
}

export async function progressToTeamSelection(gameId: string) {
    const gameRef = doc(db, "games", gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("Game not found.");
        const game = gameDoc.data() as Game;

        // Authorization is handled by security rules.
        if (game.gameState !== 'instructions') {
            return;
        }

        transaction.update(gameRef, { gameState: 'team_selection' });
    });
}

export async function selectTeam(gameId: string, playerId: string, team: 'A' | 'B') {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("لم يتم العثور على اللعبة.");
        const currentGame = gameDoc.data() as Game;

        const activePlayers = currentGame.players.filter(p => p.status === 'alive');
        const teamAPlayers = activePlayers.filter(p => p.team === 'A');
        const teamBPlayers = activePlayers.filter(p => p.team === 'B');
        const maxTeamSize = 3;

        if (team === 'A' && teamAPlayers.length >= maxTeamSize && !teamAPlayers.some(p => p.id === playerId)) {
            throw new Error("الفريق الأزرق ممتلئ.");
        }
        if (team === 'B' && teamBPlayers.length >= maxTeamSize && !teamBPlayers.some(p => p.id === playerId)) {
            throw new Error("الفريق الوردي ممتلئ.");
        }

        const playerIndex = currentGame.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) throw new Error("اللاعب غير موجود.");
        
        const updatedPlayers = [...currentGame.players];
        updatedPlayers[playerIndex].team = team;
        transaction.update(gameRef, { players: updatedPlayers });
    });
}

export async function startGame(gameId: string) {
    const gameRef = doc(db, 'games', gameId);

    // Authorization is handled by security rules. This transaction will fail
    // if the user is not the host.

    // First, generate the challenge data outside the transaction to avoid network calls inside.
    const shuffledChallenges = [...GENIUS_CHALLENGES].sort(() => 0.5 - Math.random());
    const challengeOrder = shuffledChallenges.map(c => c.id);
    const firstChallengeId = challengeOrder[0];
    const { puzzle } = await generateGeniusChallenge({ challengeId: firstChallengeId });

    // Then, run the transaction to update the game state.
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("اللعبة غير موجودة.");
        const dbGame = gameDoc.data() as Game;

        const activePlayers = dbGame.players.filter(p => p.status === 'alive');
        if (activePlayers.some(p => !p.team)) throw new Error("يجب على جميع اللاعبين اختيار فريق أولاً.");

        const teamA = activePlayers.filter(p => p.team === 'A');
        const teamB = activePlayers.filter(p => p.team === 'B');
        if (teamA.length !== teamB.length) throw new Error("يجب أن تكون الفرق متوازنة.");
        if (teamA.length === 0) throw new Error("لا يمكن بدء اللعبة بفرق فارغة.");

        transaction.update(gameRef, {
            gameState: 'challenge_intro',
            challengeOrder,
            currentChallengeIndex: 0,
            teamScores: { A: 0, B: 0 },
            challengeState: { puzzle, results: [] },
        });
    });
}

export async function submitChallengeResult(gameId: string, playerId: string, result: Omit<ChallengeResult, 'playerId' | 'team'>) {
    const gameRef = doc(db, 'games', gameId);

    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) {
            throw new Error("اللعبة غير موجودة.");
        }
        let game = gameDoc.data() as Game;

        if (game.gameState !== 'challenge_active') {
            return;
        }

        const player = game.players.find(p => p.id === playerId);
        if (!player?.team) {
            return;
        }

        let currentResults = game.challengeState?.results || [];
        if (currentResults.some(r => r.playerId === playerId)) {
            return;
        }
        
        const newResult: ChallengeResult = { playerId, team: player.team, ...result };
        
        const updatedResults = [...currentResults, newResult];

        const updateData: any = {
            'challengeState.results': updatedResults,
        };

        const activePlayersCount = game.players.filter(p => p.status === 'alive').length;

        if (updatedResults.length >= activePlayersCount) {
            const sortedCorrectResults = updatedResults
                .filter(r => r.isCorrect)
                .sort((a, b) => a.time - b.time);
            
            const pointsMap = [10, 5, 3, 1];
            const newScores = { ...(game.teamScores || { A: 0, B: 0 }) };
            
            sortedCorrectResults.forEach((res, index) => {
                const points = pointsMap[index] || 0;
                if (points > 0) {
                    newScores[res.team] = (newScores[res.team] || 0) + points;
                }
            });

            updateData.teamScores = newScores;
            updateData.gameState = 'challenge_results';
        }
        
        transaction.update(gameRef, updateData);
    });
}

export async function nextChallenge(gameId: string) {
    const gameRef = doc(db, 'games', gameId);

    // Authorization is handled by security rules. This will fail if not the host.

    // Read game data first
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists()) throw new Error("اللعبة غير موجودة.");
    const game = gameSnap.data() as Game;
    
    const nextIndex = (game.currentChallengeIndex ?? 0) + 1;

    if (nextIndex >= (game.challengeOrder?.length || 0)) {
        let winner: Game['gameResult']['winner'] = 'تعادل';
        let message = "انتهت المواجهة بالتعادل!";
        const teamAScore = game.teamScores?.A || 0;
        const teamBScore = game.teamScores?.B || 0;

        if (teamAScore > teamBScore) {
            winner = 'الفريق الأزرق';
            message = "الفريق الأزرق يسحق الفريق الوردي!";
        } else if (teamBScore > teamAScore) {
            winner = 'الفريق الوردي';
            message = "الفريق الوردي يتغلب على الفريق الأزرق!";
        }

        await updateDoc(gameRef, { 
            gameState: 'final_results',
            gameResult: { winner, message }
        });

    } else {
        const nextChallengeId = game.challengeOrder?.[nextIndex];
        if (!nextChallengeId) throw new Error("التحدي غير موجود في القائمة.");
        const { puzzle } = await generateGeniusChallenge({ challengeId: nextChallengeId });

        await updateDoc(gameRef, {
            currentChallengeIndex: nextIndex,
            gameState: 'challenge_intro',
            challengeState: { puzzle, results: [] },
        });
    }
}
