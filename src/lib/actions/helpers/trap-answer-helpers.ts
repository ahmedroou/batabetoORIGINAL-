

/**
 * @fileoverview This file contains helper functions specific to the "Trap Answer" game logic.
 * These are pure functions, designed to be easily testable and separate from server-side effects.
 */

import type { Game, Player, TrapQuestion } from '@/types';
import { safeCompareStrings } from '../helpers';

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Calculates the scores for a completed round of the Trap Answer game.
 * This is a pure function, making it easy to test the scoring logic independently.
 * @param {Player[]} activePlayers - An array of the active players in the game.
 * @param {TrapQuestion} question - The question for the round.
 * @param {Record<string, string | null>} playerAnswers - A map of player IDs to their submitted trap answers.
 * @param {Record<string, string | null>} playerGuesses - A map of player IDs to their chosen guess.
 * @param {string[]} awayPlayerIdsInRound - An array of IDs for players who were away during the round.
 * @param {string[]} shuffledAnswers - The actual list of answers shown to players for guessing.
 * @returns {object} An object containing the calculated scores, the results breakdown, and trick stats.
 */
export function calculateTrapAnswerScores(
    activePlayers: Player[],
    question: TrapQuestion,
    playerAnswers: Record<string, string | null>,
    playerGuesses: Record<string, string | null>,
    awayPlayerIdsInRound: string[],
    shuffledAnswers: string[]
) {
    const roundScores: Game['trapAnswerState']['lastRoundResults']['scores'] = activePlayers.reduce((acc, p) => ({ ...acc, [p.id]: { points: 0, breakdown: [] } }), {});
    const newTrickStats: Game['trapAnswerState']['trickStats'] = { trickedBy: {}, trickedOthers: {} };
    const timedOutGuesserIds: string[] = [];

    // Group similar answers together
    const answerGroups: { text: string; authors: string[] }[] = [];
    Object.entries(playerAnswers).forEach(([authorId, answerText]) => {
        if (answerText === null || answerText.trim() === '') return;
        const similarGroup = answerGroups.find(g => safeCompareStrings(g.text, answerText) > SIMILARITY_THRESHOLD);
        if (similarGroup) {
            similarGroup.authors.push(authorId);
        } else {
            answerGroups.push({ text: answerText, authors: [authorId] });
        }
    });

    // Calculate scores based on guesses
    Object.entries(playerGuesses).forEach(([guesserId, chosenAnswer]) => {
        if (chosenAnswer === '__TIMEOUT__') {
            timedOutGuesserIds.push(guesserId);
            return;
        }
        if (chosenAnswer === null) return;

        // Correct answer guess
        if (safeCompareStrings(chosenAnswer, question.answer) > SIMILARITY_THRESHOLD) {
            roundScores[guesserId].points += 2;
            roundScores[guesserId].breakdown.push({ reason: "إجابة صحيحة", points: 2 });
        } else { // Guessed a trap answer
            const chosenGroup = answerGroups.find(g => safeCompareStrings(g.text, chosenAnswer) > SIMILARITY_THRESHOLD);

            if (chosenGroup) {
                // Check for self-vote: now a penalty
                if (chosenGroup.authors.includes(guesserId)) {
                    roundScores[guesserId].points -= 1;
                    roundScores[guesserId].breakdown.push({ reason: "صوّت لنفسه", points: -1 });
                }

                // Award points to authors of the trap
                chosenGroup.authors.forEach(authorId => {
                    if (authorId !== guesserId) {
                        const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';
                        roundScores[authorId].points += 1;
                        roundScores[authorId].breakdown.push({ reason: `خدع ${guesserName}`, points: 1 });
                        
                        // Update trick stats
                        if (!newTrickStats.trickedOthers[authorId]) newTrickStats.trickedOthers[authorId] = [];
                        if(!newTrickStats.trickedOthers[authorId].includes(guesserId)) {
                             newTrickStats.trickedOthers[authorId].push(guesserId);
                        }
                    }
                });

                // Record who the guesser was tricked by
                if (!chosenGroup.authors.includes(guesserId)) {
                    if (!newTrickStats.trickedBy[guesserId]) newTrickStats.trickedBy[guesserId] = [];
                     if(!newTrickStats.trickedBy[guesserId].includes(chosenGroup.authors[0])) { // Just add one author to avoid multiple entries for the same trick
                        newTrickStats.trickedBy[guesserId].push(...chosenGroup.authors);
                     }
                }
            }
        }
    });
    
    // Build the full results list to show all options that were actually displayed.
    const allOptionsDisplayed = new Set<string>(shuffledAnswers);
    
    const resultsByAnswer: Game['trapAnswerState']['lastRoundResults']['answers'] = [];

    allOptionsDisplayed.forEach(optionText => {
        const isCorrect = safeCompareStrings(optionText, question.answer) > SIMILARITY_THRESHOLD;
        const group = answerGroups.find(g => safeCompareStrings(g.text, optionText) > SIMILARITY_THRESHOLD);
        // Ensure we don't include timed out players in the list of guessers for an answer
        const guesserIds = Object.keys(playerGuesses).filter(pid => playerGuesses[pid] !== '__TIMEOUT__' && safeCompareStrings(playerGuesses[pid]!, optionText) > SIMILARITY_THRESHOLD);

        resultsByAnswer.push({
            text: optionText,
            isCorrect,
            authorIds: isCorrect ? null : group ? group.authors : [],
            guesserIds
        });
    });

    return { roundScores, resultsByAnswer, newTrickStats, timedOutGuesserIds, awayPlayerIdsDuringRound: awayPlayerIdsInRound };
}
