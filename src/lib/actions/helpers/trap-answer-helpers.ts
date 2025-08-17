
/**
 * @fileoverview Helper functions for the "Trap Answer" game logic (pure).
 * Preserves public API. Safer canonical mapping to displayed options,
 * stable grouping, and hardened trick stats.
 */
import type { Game, Player, TrapQuestion } from '@/types';
import { safeCompareStrings, getSimilaritySignature } from '../helpers';

const SIMILARITY_THRESHOLD_GROUP = 0.95 as const;
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

  const correctSig = getSimilaritySignature(question.answer);
  
  // Group identical trap answers (after normalization)
  const answerGroups = new Map<string, { text: string; authors: Set<string> }>();
  for (const [authorId, answerText] of Object.entries(playerAnswers)) {
    if (!answerText) continue;
    
    // Reject answers too similar to the correct one
    if (safeCompareStrings(answerText, question.answer) >= SIMILARITY_BLOCK_AGAINST_CORRECT) {
        continue;
    }
    
    const sig = getSimilaritySignature(answerText);
    if (!sig) continue;
    
    if (answerGroups.has(sig)) {
      answerGroups.get(sig)!.authors.add(authorId);
    } else {
      answerGroups.set(sig, { text: answerText.trim(), authors: new Set([authorId]) });
    }
  }

  // Scoring
  for (const [guesserId, guess] of Object.entries(playerGuesses)) {
    if (guess === TIMEOUT_TOKEN || !guess) {
      if(guess === TIMEOUT_TOKEN) timedOutGuesserIds.push(guesserId);
      continue;
    }

    const guessSig = getSimilaritySignature(guess);
    const isCorrect = guessSig === correctSig;

    if (isCorrect) {
      ensureBucket(roundScores, guesserId);
      roundScores[guesserId].points += 2;
      roundScores[guesserId].breakdown.push({ reason: 'إجابة صحيحة', points: 2 });
      continue;
    }

    const group = answerGroups.get(guessSig);
    if (!group) continue;
    
    const authors = Array.from(group.authors);
    const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';

    if (group.authors.has(guesserId)) {
        ensureBucket(roundScores, guesserId);
        roundScores[guesserId].points -= 1;
        roundScores[guesserId].breakdown.push({ reason: 'صوّت لنفسه', points: -1 });
    }

    for (const authorId of authors) {
      ensureBucket(roundScores, authorId);
      roundScores[authorId].points += 1;
      roundScores[authorId].breakdown.push({ reason: `خدع ${guesserName}`, points: 1 });

      if (!newTrickStats.trickedOthers[authorId]) newTrickStats.trickedOthers[authorId] = [];
      if (!newTrickStats.trickedOthers[authorId].includes(guesserId)) {
        newTrickStats.trickedOthers[authorId].push(guesserId);
      }
    }
    
    if (!group.authors.has(guesserId)) {
      const oneAuthor = pickOneAuthorStable(authors);
      if (oneAuthor) {
        if (!newTrickStats.trickedBy[guesserId]) newTrickStats.trickedBy[guesserId] = [];
        if (!newTrickStats.trickedBy[guesserId].includes(oneAuthor)) {
          newTrickStats.trickedBy[guesserId].push(oneAuthor);
        }
      }
    }
  }

  // Build results list for display
  const resultsByAnswer: ResultsByAnswer = [];
  const addedSigs = new Set<string>();

  // Add correct answer
  resultsByAnswer.push({
    text: question.answer,
    isCorrect: true,
    authorIds: [],
    guesserIds: Object.entries(playerGuesses).filter(([_, g]) => getSimilaritySignature(g ?? '') === correctSig).map(([pid]) => pid),
  });
  addedSigs.add(correctSig);

  // Add trap answers
  for (const [sig, group] of answerGroups.entries()) {
    if(addedSigs.has(sig)) continue;
    resultsByAnswer.push({
        text: group.text,
        isCorrect: false,
        authorIds: Array.from(group.authors),
        guesserIds: Object.entries(playerGuesses).filter(([_,g]) => getSimilaritySignature(g ?? '') === sig).map(([pid]) => pid)
    });
    addedSigs.add(sig);
  }
  
  // Add any remaining shuffled dummy answers that weren't submitted
  for (const option of shuffledAnswers) {
      const sig = getSimilaritySignature(option);
      if(!addedSigs.has(sig)) {
          resultsByAnswer.push({
              text: option,
              isCorrect: false,
              authorIds: [],
              guesserIds: Object.entries(playerGuesses).filter(([_, g]) => getSimilaritySignature(g ?? '') === sig).map(([pid]) => pid)
          })
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

