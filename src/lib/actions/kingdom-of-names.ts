
'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, type Transaction } from 'firebase/firestore';
import type { Game, Player, KingdomOfNamesState } from '@/types';
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

// Helper to get active players
const getActivePlayers = (game: Game) => game.players.filter(p => p.status !== 'left');

export async function startGame(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        ensure(snap.exists(), "اللعبة غير موجودة.");
        const game = snap.data() as Game;
        ensure(game.hostId === hostId, "فقط المضيف يمكنه بدء اللعبة.");
        ensure(game.players.length >= 2, "اللعبة تحتاج لاعبين اثنين على الأقل.");

        const turnOrder = shuffle(game.players.map(p => p.id));
        const settings = { ...GAME_DEFAULTS, ...game.kingdomOfNamesState?.settings };

        tx.update(gameRef, {
            gameState: 'playing',
            'kingdomOfNamesState.phase': 'playing',
            'kingdomOfNamesState.currentRound': 1,
            'kingdomOfNamesState.turnOrder': turnOrder,
            'kingdomOfNamesState.letter': LETTERS[Math.floor(Math.random() * LETTERS.length)],
            'kingdomOfNamesState.categories': shuffle([...CATEGORIES]).slice(0, 6),
            'kingdomOfNamesState.playerAnswers': {},
            'kingdomOfNamesState.votes': {},
            'kingdomOfNamesState.results': {},
            'kingdomOfNamesState.timerEndsAt': tsFromNowS(settings.roundTime),
            playerScores: game.players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
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

        // First, record the current player's answers.
        const playerAnswers = { ...(state.playerAnswers || {}), [playerId]: answers };
        
        const categoriesForRound = state.categories || [];
        const didPlayerFinishAll = categoriesForRound.every(cat => answers[cat] && answers[cat].trim() !== '');

        const activePlayers = getActivePlayers(game);
        
        // The "Pen Up" logic: The first player to submit a FULL sheet ends the round for everyone.
        const isFirstToSubmit = !Object.keys(state.playerAnswers || {}).length;

        if (didPlayerFinishAll) {
            // This player has finished. End the round for everyone.
            // We lock in everyone else's current answers.
            const allFinalAnswers = { ...playerAnswers };
            activePlayers.forEach(p => {
                if (!allFinalAnswers[p.id]) {
                    // If a player hasn't submitted anything, their answers are what's in progress (likely empty)
                    allFinalAnswers[p.id] = state.playerProgress?.[p.id]?.answers || {};
                }
            });

            tx.update(gameRef, {
                'kingdomOfNamesState.playerAnswers': allFinalAnswers,
                'kingdomOfNamesState.phase': 'voting',
                'kingdomOfNamesState.timerEndsAt': tsFromNowS(state.settings.votingTime),
            });

        } else {
            // This player has not finished all fields, just save their progress.
            // This case also handles players who submit after the first finisher (their answers are already locked in).
            tx.update(gameRef, {
                [`kingdomOfNamesState.playerAnswers.${playerId}`]: answers,
            });
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
        const activePlayers = getActivePlayers(game);
        const allVoted = activePlayers.every(p => playerVotes[p.id]);

        tx.update(gameRef, {
            [`kingdomOfNamesState.votes`]: playerVotes,
        });

        if (allVoted) {
            const results = calculateResults(game, playerVotes);
            const newPlayerScores = { ...(game.playerScores || {}) };
            Object.entries(results.scores).forEach(([pId, scoreData]) => {
                newPlayerScores[pId] = (newPlayerScores[pId] || 0) + scoreData.points;
            });
            tx.update(gameRef, {
                'kingdomOfNamesState.phase': 'results',
                'kingdomOfNamesState.results': results,
                'kingdomOfNamesState.timerEndsAt': tsFromNowS(state.settings.resultsTime),
                playerScores: newPlayerScores,
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
            const winnerId = Object.keys(game.playerScores || {}).reduce((a, b) => ((game.playerScores![a] || 0) > (game.playerScores![b] || 0) ? a : b), '');
            tx.update(gameRef, { 
                gameState: 'final_results',
                'kingdomOfNamesState.phase': 'final_results',
                 gameResult: { winner: winnerId, message: "انتهت اللعبة! هذا هو الترتيب النهائي." }
            });
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
    
    const results: { scores: Record<string, { points: number, breakdown: { reason: string, points: number }[] }>, answers: { category: string; answer: string; points: number; reason: string }[] } = { scores: {}, answers: [] };
    game.players.forEach(p => results.scores[p.id] = { points: 0, breakdown: [] });
    
    const validAnswersByCategory: Record<string, {playerId: string, answer: string}[]> = {};
    const answerScores: Record<string, { points: number, reason: string }> = {};

    // 1. Filter valid answers
    for (const playerId in submissions) {
        for (const category in submissions[playerId]) {
            const answer = submissions[playerId][category]!;
            
            // Auto-disqualify if it doesn't start with the correct letter
            if (!answer || !answer.trim().startsWith(letter)) {
                answerScores[`${playerId}-${category}`] = { points: 0, reason: "حرف خاطئ أو إجابة فارغة" };
                continue;
            }

            // Check votes
            let incorrectVotes = 0;
            for (const voterId in votes) {
                if (voterId === playerId) continue; // Don't count self-votes for rejection
                if (votes[voterId]?.[`${playerId}-${category}`] === 'incorrect') {
                    incorrectVotes++;
                }
            }
             if (votes[playerId]?.[`${playerId}-${category}`] === 'incorrect') {
                incorrectVotes = 2; // Self-rejection is an instant disqualification
            }
            
            if (incorrectVotes < 2) {
                if (!validAnswersByCategory[category]) validAnswersByCategory[category] = [];
                validAnswersByCategory[category].push({ playerId, answer });
            } else {
                 answerScores[`${playerId}-${category}`] = { points: 0, reason: "رفض اللاعبون" };
            }
        }
    }
    
    // 2. Calculate points based on uniqueness
    for(const category in validAnswersByCategory) {
        const answersList = validAnswersByCategory[category]!;
        const answerCounts: Record<string, string[]> = {};

        for (const { playerId, answer } of answersList) {
            const normalizedAnswer = normalizeForComparison(answer);
            if (!answerCounts[normalizedAnswer]) {
                answerCounts[normalizedAnswer] = [];
            }
            answerCounts[normalizedAnswer].push(playerId);
        }

        for (const normalizedAnswer in answerCounts) {
            const playersWithThisAnswer = answerCounts[normalizedAnswer]!;
            const originalAnswerText = answersList.find(a => normalizeForComparison(a.answer) === normalizedAnswer)!.answer;
            const isUnique = playersWithThisAnswer.length === 1;
            const points = isUnique ? 10 : 5;
            const reason = isUnique ? "إجابة فريدة" : "إجابة مكررة";
            
            for (const playerId of playersWithThisAnswer) {
                 answerScores[`${playerId}-${category}`] = { points, reason };
            }
        }
    }

    // 3. Aggregate scores
    for (const key in answerScores) {
        const [playerId, category] = key.split('-');
        const { points, reason } = answerScores[key]!;
        const answerText = submissions[playerId!]?.[category!] || '';

        if(results.scores[playerId!]) {
            results.scores[playerId!]!.points += points;
            results.scores[playerId!]!.breakdown.push({ reason, points });
        }
        results.answers.push({ category: category!, answer: answerText, points, reason });
    }

    return results;
}

function normalizeForComparison(text: string) {
    return text.trim().toLowerCase();
}
