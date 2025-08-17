

/**
 * @fileoverview Helper functions for the "Trap Answer" game logic (pure).
 * Preserves public API. Safer canonical mapping to displayed options,
 * stable grouping, and hardened trick stats.
 */
import type { Game, Player, TrapQuestion } from '@/types';
import { safeCompareStrings } from '../helpers';

const SIMILARITY_THRESHOLD_GROUP = 1.0 as const; // Only 100% matches
const SIMILARITY_BLOCK_AGAINST_CORRECT = 0.70 as const;
const TIMEOUT_TOKEN = '__TIMEOUT__' as const;

type RoundScores = Game['trapAnswerState']['lastRoundResults']['scores'];
type ResultsByAnswer = Game['trapAnswerState']['lastRoundResults']['answers'];
type TrickStats = NonNullable<Game['trapAnswerState']['trickStats']>;

/** Ensure a score bucket exists. */
function ensureBucket(scores: RoundScores, playerId: string) {
  if (!scores[playerId]) scores[playerId] = { points: 0, breakdown: [] };
}

/** Choose a deterministic single author for trickedBy (first sorted). */
function pickOneAuthorStable(authorIds: string[]): string | null {
  if (!authorIds?.length) return null;
  return [...authorIds].sort((a, b) => a.localeCompare(b))[0] || null;
}

// Normalize text for strict comparison (used as map keys)
const normalizeForStrictKey = (s: string) => (s || '').trim().replace(/\s+/g, ' ');


export function calculateTrapAnswerScores(
  activePlayers: Player[],
  question: TrapQuestion,
  playerAnswers: Record<string, string | null>,
  playerGuesses: Record<string, string | null>,
  awayPlayerIdsInRound: string[],
  shuffledAnswers: string[]
) {
  const roundScores: RoundScores = activePlayers.reduce((acc, p) => {
    acc[p.id] = { points: 0, breakdown: [] };
    return acc;
  }, {} as RoundScores);

  const newTrickStats: TrickStats = { trickedBy: {}, trickedOthers: {} };
  const timedOutGuesserIds: string[] = [];

  // Group identical trap answers (100% match)
  const answerGroups = new Map<string, { text: string; authors: Set<string> }>();
  for (const [authorId, answerText] of Object.entries(playerAnswers)) {
    if (!answerText) continue;

    const normalizedText = normalizeForStrictKey(answerText);
    if (!normalizedText) continue;

    // Reject answers too similar to the correct one
    if (safeCompareStrings(normalizedText, question.answer) >= SIMILARITY_BLOCK_AGAINST_CORRECT) {
        continue;
    }
    
    if (answerGroups.has(normalizedText)) {
      answerGroups.get(normalizedText)!.authors.add(authorId);
    } else {
      answerGroups.set(normalizedText, { text: answerText.trim(), authors: new Set([authorId]) });
    }
  }

  // Scoring
  for (const [guesserId, guess] of Object.entries(playerGuesses)) {
    if (guess === TIMEOUT_TOKEN || !guess) {
      if(guess === TIMEOUT_TOKEN) timedOutGuesserIds.push(guesserId);
      continue;
    }

    const normalizedGuess = normalizeForStrictKey(guess);
    const isCorrect = normalizeForStrictKey(question.answer) === normalizedGuess;

    if (isCorrect) {
      ensureBucket(roundScores, guesserId);
      roundScores[guesserId].points += 2;
      roundScores[guesserId].breakdown.push({ reason: 'إجابة صحيحة', points: 2 });
      continue;
    }

    const group = answerGroups.get(normalizedGuess);
    if (!group) continue;
    
    const authors = Array.from(group.authors);
    const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';

    // Apply self-vote penalty
    if (group.authors.has(guesserId)) {
        ensureBucket(roundScores, guesserId);
        roundScores[guesserId].points -= 1;
        roundScores[guesserId].breakdown.push({ reason: 'صوّت لنفسه', points: -1 });
    }
    
    // Award points to trickers
    for (const authorId of authors) {
      // *** FIX: Do not give a trick point to a player for tricking themselves ***
      if (authorId === guesserId) {
        continue;
      }
      
      ensureBucket(roundScores, authorId);
      roundScores[authorId].points += 1;
      roundScores[authorId].breakdown.push({ reason: `خدع ${guesserName}`, points: 1 });

      if (!newTrickStats.trickedOthers[authorId]) newTrickStats.trickedOthers[authorId] = [];
      if (!newTrickStats.trickedOthers[authorId].includes(guesserId)) {
        newTrickStats.trickedOthers[authorId].push(guesserId);
      }
    }
    
    // Log who was tricked by whom
    if (!group.authors.has(guesserId)) {
      // A player can be tricked by multiple authors if they submitted the same trap.
      authors.forEach(authorId => {
        if (!newTrickStats.trickedBy[guesserId]) newTrickStats.trickedBy[guesserId] = [];
        if (!newTrickStats.trickedBy[guesserId].includes(authorId)) {
          newTrickStats.trickedBy[guesserId].push(authorId);
        }
      });
    }
  }

  // Build results list for display
  const resultsByAnswer: ResultsByAnswer = [];
  const addedAnswers = new Set<string>();

  // Add correct answer
  const normalizedCorrect = normalizeForStrictKey(question.answer);
  resultsByAnswer.push({
    text: question.answer,
    isCorrect: true,
    authorIds: [],
    guesserIds: Object.entries(playerGuesses).filter(([_, g]) => normalizeForStrictKey(g ?? '') === normalizedCorrect).map(([pid]) => pid),
  });
  addedAnswers.add(normalizedCorrect);

  // Add trap answers
  for (const group of answerGroups.values()) {
    const normalizedText = normalizeForStrictKey(group.text);
    if(addedAnswers.has(normalizedText)) continue;
    resultsByAnswer.push({
        text: group.text,
        isCorrect: false,
        authorIds: Array.from(group.authors),
        guesserIds: Object.entries(playerGuesses).filter(([_,g]) => normalizeForStrictKey(g ?? '') === normalizedText).map(([pid]) => pid)
    });
    addedAnswers.add(normalizedText);
  }
  
  // Add any remaining shuffled dummy answers that weren't submitted and weren't guessed
  for (const option of shuffledAnswers) {
      const normalizedOption = normalizeForStrictKey(option);
      if(!addedAnswers.has(normalizedOption)) {
          resultsByAnswer.push({
              text: option,
              isCorrect: false,
              authorIds: [],
              guesserIds: Object.entries(playerGuesses).filter(([_, g]) => normalizeForStrictKey(g ?? '') === normalizedOption).map(([pid]) => pid)
          })
          addedAnswers.add(normalizedOption);
      }
  }
  
  return {
    roundScores,
    resultsByAnswer,
    newTrickStats,
    timedOutGuesserIds,
    awayPlayerIdsDuringRound: awayPlayerIdsInRound,
  };
}
