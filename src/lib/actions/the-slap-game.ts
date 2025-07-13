
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game } from '@/types';

function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function startTheSlapGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found.');
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error('Only the host can start the game.');
        if (game.players.length < 2) throw new Error('The game requires at least 2 players.');

        const activePlayers = game.players.filter(p => p.status === 'alive');
        const playerIds = activePlayers.map(p => p.id);
        const shuffledPlayerIds = shuffle([...playerIds]);
        
        const descriptionPairs: Record<string, string> = {};
        for (let i = 0; i < shuffledPlayerIds.length; i++) {
            descriptionPairs[shuffledPlayerIds[i]] = shuffledPlayerIds[(i + 1) % shuffledPlayerIds.length];
        }

        const firstDescriberId = shuffledPlayerIds[0];

        transaction.update(gameRef, {
            gameState: 'slap-describing',
            round: 1,
            slapState: {
                descriptionPairs,
                turnOrder: shuffledPlayerIds,
                currentTurnIndex: 0,
                currentDescriberId: firstDescriberId,
                currentDescribedId: descriptionPairs[firstDescriberId],
                guesses: {},
            },
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
        });
    });
}

export async function submitDescription(gameId: string, playerId: string, description: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found.');
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'slap-describing') throw new Error('Not in describing phase.');
        if (game.slapState?.currentDescriberId !== playerId) throw new Error('It is not your turn to describe.');
        if (game.slapState?.description) throw new Error('Description has already been submitted for this turn.');

        transaction.update(gameRef, {
            'slapState.description': description,
            gameState: 'slap-guessing',
        });
    });
}

export async function submitGuesses(gameId: string, playerId: string, describedIdGuess: string, describerIdGuess: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found.');
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'slap-guessing') throw new Error('Not in guessing phase.');
        if (game.slapState?.guesses?.[playerId]) throw new Error('You have already submitted your guesses.');

        const currentGuesses = game.slapState?.guesses || {};
        const newGuesses = {
            ...currentGuesses,
            [playerId]: { describedId: describedIdGuess, describerId: describerIdGuess },
        };
        
        transaction.update(gameRef, { 'slapState.guesses': newGuesses });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newGuesses).length === activePlayers.length) {
            // All players have guessed, calculate results
            const { currentDescriberId, currentDescribedId } = game.slapState!;
            const scores = { ...(game.playerScores || {}) };
            const lastRoundPoints: Record<string, number> = {};

            const describedPlayerGuessedSelf = newGuesses[currentDescribedId]?.describedId === currentDescribedId;
            const describedPlayerGuessedDescriber = newGuesses[currentDescribedId]?.describerId === currentDescriberId;
            
            // Initialize points for this round
            activePlayers.forEach(p => lastRoundPoints[p.id] = 0);

            if (!describedPlayerGuessedSelf) {
                // Described did not guess themselves, describer gets slapped
                scores[currentDescriberId] = (scores[currentDescriberId] || 0) - 2;
                lastRoundPoints[currentDescriberId] = -2;
            } else {
                 // Described guessed themselves correctly
                scores[currentDescribedId] = (scores[currentDescribedId] || 0) + 1;
                lastRoundPoints[currentDescribedId] = 1;
                 
                 if (describedPlayerGuessedDescriber) {
                    // Described also guessed the describer correctly
                    scores[currentDescribedId] = (scores[currentDescribedId] || 0) + 1;
                    lastRoundPoints[currentDescribedId] = (lastRoundPoints[currentDescribedId] || 0) + 1;
                    
                    // Describer gets points only if Described guesses both correctly
                    scores[currentDescriberId] = (scores[currentDescriberId] || 0) + 2;
                    lastRoundPoints[currentDescriberId] = 2;
                }
            }
            
            // Score other players
            activePlayers.forEach(p => {
                if (p.id === currentDescriberId || p.id === currentDescribedId) return;

                const playerGuess = newGuesses[p.id];
                if (playerGuess?.describedId === currentDescribedId && playerGuess?.describerId === currentDescriberId) {
                     // Other player guessed both correctly
                    scores[p.id] = (scores[p.id] || 0) + 2;
                    lastRoundPoints[p.id] = 2;
                    
                    // Describer loses a point for being found out by others
                    if(describedPlayerGuessedSelf) { // Only penalize if the described knew themselves
                      scores[currentDescriberId] = (scores[currentDescriberId] || 0) - 1;
                      lastRoundPoints[currentDescriberId] = (lastRoundPoints[currentDescriberId] || 0) - 1;
                    }
                }
            });

            transaction.update(gameRef, {
                gameState: 'slap-results',
                playerScores: scores,
                'slapState.lastRoundPoints': lastRoundPoints,
            });
        }
    });
}


export async function nextSlapRound(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
     await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found.');
        const game = gameDoc.data() as Game;
        if (game.hostId !== hostId) throw new Error('Only the host can proceed.');

        const { turnOrder, currentTurnIndex, descriptionPairs } = game.slapState!;
        const isAfterVotingResults = game.gameState === 'slap-voting-results';
        
        let nextTurnIndex = currentTurnIndex;

        // If we are coming from voting results, we start the next description cycle
        if(isAfterVotingResults) {
            nextTurnIndex = 0; // Reset for the new cycle
        } else {
            nextTurnIndex = currentTurnIndex + 1;
        }

        if (nextTurnIndex >= turnOrder.length) {
            // End of a full description cycle, now move to voting
             transaction.update(gameRef, {
                gameState: 'slap-voting',
                'slapState.votes': {},
                'slapState.dumbestPlayerId': null,
            });
            return;
        }

        const nextDescriberId = turnOrder[nextTurnIndex];
        const nextDescribedId = descriptionPairs[nextDescriberId];

        transaction.update(gameRef, {
            gameState: 'slap-describing',
            round: game.round ? game.round + 1 : 2,
            'slapState.currentTurnIndex': nextTurnIndex,
            'slapState.currentDescriberId': nextDescriberId,
            'slapState.currentDescribedId': nextDescribedId,
            'slapState.description': null,
            'slapState.guesses': {},
            'slapState.lastRoundPoints': {},
        });
    });
}

export async function submitSlapVote(gameId: string, voterId: string, votedForId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found.');
        const game = gameDoc.data() as Game;

        if (game.gameState !== 'slap-voting') throw new Error('Not in voting phase.');
        if (game.slapState?.votes?.[voterId]) throw new Error('You have already voted.');

        const currentVotes = game.slapState?.votes || {};
        const newVotes = { ...currentVotes, [voterId]: votedForId };
        
        transaction.update(gameRef, { 'slapState.votes': newVotes });

        const activePlayers = game.players.filter(p => p.status === 'alive');
        if (Object.keys(newVotes).length >= activePlayers.length) {
            // Tally votes
            const voteCounts: Record<string, number> = {};
            Object.values(newVotes).forEach(vote => {
                voteCounts[vote] = (voteCounts[vote] || 0) + 1;
            });

            let maxVotes = 0;
            let dumbestPlayerIds: string[] = [];
            for (const playerId in voteCounts) {
                if (voteCounts[playerId] > maxVotes) {
                    maxVotes = voteCounts[playerId];
                    dumbestPlayerIds = [playerId];
                } else if (voteCounts[playerId] === maxVotes) {
                    dumbestPlayerIds.push(playerId);
                }
            }
            
            // If there's no tie, set the dumbest player
            const dumbestPlayerId = dumbestPlayerIds.length === 1 ? dumbestPlayerIds[0] : null;

            transaction.update(gameRef, {
                'slapState.dumbestPlayerId': dumbestPlayerId,
                gameState: 'slap-voting-results',
            });
        }
    });
}
