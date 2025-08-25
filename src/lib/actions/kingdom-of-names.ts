
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import type { Game, Player } from '@/types';
import { shuffle, safeCompareStrings } from './helpers';
import { CATEGORIES, LETTERS } from '@/data/kingdom-of-names';
import { distributeEndOfGameAwards } from './admin/users';

const GAME_DEFAULTS = {
    rounds: 7,
    roundTime: 60,
    votingTime: 45,
    resultsTime: 20,
};

const ensure: (condition: any, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(message);
};

const tsFromNowS = (seconds: number) => Timestamp.fromMillis(Date.now() + seconds * 1000);

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        ensure(snap.exists(), "اللعبة غير موجودة.");
        const game = snap.data() as Game;
        ensure(game.hostId === hostId, "فقط المضيف يمكنه بدء اللعبة.");
        ensure(game.players.length >= 2, "اللعبة تحتاج لاعبين اثنين على الأقل.");

        const turnOrder = shuffle(game.players.map(p => p.id));
        const settings = game.kingdomOfNamesState?.settings || GAME_DEFAULTS;

        tx.update(gameRef, {
            gameState: 'playing',
            'kingdomOfNamesState.phase': 'playing',
            'kingdomOfNamesState.currentRound': 1,
            'kingdomOfNamesState.turnOrder': turnOrder,
            'kingdomOfNamesState.letter': LETTERS[Math.floor(Math.random() * LETTERS.length)],
            'kingdomOfNamesState.categories': shuffle([...CATEGORIES]).slice(0, 6),
            'kingdomOfNamesState.timerEndsAt': tsFromNowS(settings.roundTime),
        });
    });
}

export async function submitAnswers(gameId: string, playerId: string, answers: Record<string, string>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        ensure(snap.exists(), "اللعبة غير موجودة.");
        const game = snap.data() as Game;
        const state = game.kingdomOfNamesState!;
        
        ensure(state.phase === 'playing', "ليست مرحلة اللعب.");

        const playerAnswers = { ...(state.playerAnswers || {}), [playerId]: answers };
        const activePlayers = game.players.filter(p => p.status !== 'left');
        const allSubmitted = activePlayers.every(p => playerAnswers[p.id]);

        tx.update(gameRef, {
            [`kingdomOfNamesState.playerAnswers`]: playerAnswers,
        });

        // If this is the first player to submit, end the timer for others.
        if (Object.keys(playerAnswers).length === 1) {
            tx.update(gameRef, { 'kingdomOfNamesState.timerEndsAt': tsFromNowS(5) });
        }
    });
}

export async function submitVotes(gameId: string, playerId: string, votes: Record<string, 'correct' | 'incorrect'>) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        ensure(snap.exists(), "اللعبة غير موجودة.");
        const game = snap.data() as Game;
        const state = game.kingdomOfNamesState!;
        
        ensure(state.phase === 'voting', "ليست مرحلة التصويت.");

        const playerVotes = { ...(state.votes || {}), [playerId]: votes };
        const activePlayers = game.players.filter(p => p.status !== 'left');
        const allVoted = activePlayers.every(p => playerVotes[p.id]);

        tx.update(gameRef, {
            [`kingdomOfNamesState.votes`]: playerVotes,
        });

        if (allVoted) {
            const results = calculateResults(game, playerVotes);
            tx.update(gameRef, {
                'kingdomOfNamesState.phase': 'results',
                'kingdomOfNamesState.results': results,
                'kingdomOfNamesState.timerEndsAt': tsFromNowS(state.settings.resultsTime),
                playerScores: results.newPlayerScores,
            });
        }
    });
}

export async function nextRound(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    let isGameOver = false;

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        ensure(snap.exists(), "اللعبة غير موجودة.");
        const game = snap.data() as Game;
        ensure(game.hostId === hostId, "فقط المضيف يمكنه بدء الجولة التالية.");
        
        const state = game.kingdomOfNamesState!;
        const nextRoundNum = (state.currentRound || 0) + 1;

        if (nextRoundNum > state.settings.rounds) {
            isGameOver = true;
            tx.update(gameRef, { gameState: 'final_results' });
        } else {
            tx.update(gameRef, {
                'kingdomOfNamesState.phase': 'playing',
                'kingdomOfNamesState.currentRound': nextRoundNum,
                'kingdomOfNamesState.letter': LETTERS[Math.floor(Math.random() * LETTERS.length)],
                'kingdomOfNamesState.categories': shuffle([...CATEGORIES]).slice(0, 6),
                'kingdomOfNamesState.playerAnswers': {},
                'kingdomOfNamesState.votes': {},
                'kingdomOfNamesState.results': {},
                'kingdomOfNamesState.timerEndsAt': tsFromNowS(state.settings.roundTime),
            });
        }
    });

    if (isGameOver) {
        await distributeEndOfGameAwards(gameId);
    }
}

function calculateResults(game: Game, votes: Record<string, Record<string, 'correct' | 'incorrect'>>) {
    const state = game.kingdomOfNamesState!;
    const submissions = state.playerAnswers || {};
    const letter = state.letter!;
    const newPlayerScores = { ...(game.playerScores || {}) };

    const answerScores: Record<string, { points: number; reason: string; category: string, answer: string }> = {};

    // 1. Automatic disqualification and initial scoring
    const validSubmissions: Record<string, Record<string, string>> = {};
    for (const playerId in submissions) {
        validSubmissions[playerId] = {};
        for (const category in submissions[playerId]) {
            const answer = submissions[playerId][category]!;
            if (answer.trim().startsWith(letter)) {
                validSubmissions[playerId][category] = answer;
            }
        }
    }

    // 2. Voting disqualification
    for (const playerId in validSubmissions) {
        for (const category in validSubmissions[playerId]) {
            const answer = validSubmissions[playerId][category]!;
            let incorrectVotes = 0;
            for (const voterId in votes) {
                if (voterId === playerId) { // Self-vote
                    if(votes[voterId]?.[`${playerId}-${category}`] === 'incorrect') {
                        incorrectVotes = 2; // Instant disqualification
                        break;
                    }
                } else if (votes[voterId]?.[`${playerId}-${category}`] === 'incorrect') {
                    incorrectVotes++;
                }
            }
            if (incorrectVotes >= 2) {
                delete validSubmissions[playerId][category];
            }
        }
    }

    // 3. Calculate points based on uniqueness
    const answerCounts: Record<string, { players: string[]; category: string }> = {};
    for (const playerId in validSubmissions) {
        for (const category in validSubmissions[playerId]) {
            const answer = validSubmissions[playerId][category]!;
            const normalizedAnswer = safeCompareStrings(answer, answer) === 1 ? answer.toLowerCase() : answer; // Simple normalization for now
            if (!answerCounts[normalizedAnswer]) {
                answerCounts[normalizedAnswer] = { players: [], category };
            }
            answerCounts[normalizedAnswer].players.push(playerId);
        }
    }

    for (const answer in answerCounts) {
        const { players, category } = answerCounts[answer]!;
        const points = players.length === 1 ? 10 : 5;
        const reason = players.length === 1 ? "إجابة فريدة" : "إجابة مكررة";
        for (const playerId of players) {
            newPlayerScores[playerId] = (newPlayerScores[playerId] || 0) + points;
            answerScores[`${playerId}-${category}`] = { points, reason, category, answer };
        }
    }

    return {
        scores: Object.entries(answerScores).reduce((acc, [key, val]) => {
            const [playerId] = key.split('-');
            if (!acc[playerId]) acc[playerId] = { points: 0, breakdown: [] };
            acc[playerId].points += val.points;
            acc[playerId].breakdown.push({ reason: val.reason, points: val.points });
            return acc;
        }, {} as any),
        answers: Object.values(answerScores),
        newPlayerScores,
    };
}
