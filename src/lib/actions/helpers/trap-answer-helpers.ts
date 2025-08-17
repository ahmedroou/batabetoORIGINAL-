/**
 * @fileoverview Helper functions for the "Trap Answer" game logic (pure).
 * Preserves public API. Safer canonical mapping to displayed options,
 * stable grouping, and hardened trick stats.
 */
import type { Game, Player, TrapQuestion } from '@/types';
import { safeCompareStrings, getSimilaritySignature } from '../helpers';

const SIMILARITY_THRESHOLD = 0.95 as const; // Increased for more accurate grouping
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

/** Build canonical option map from displayed answers: signature → displayed text */
function buildCanonicalOptionsMap(options: string[]) {
  const map = new Map<string, string>();
  for (const opt of options) {
    const sig = getSimilaritySignature(opt);
    if (sig) map.set(sig, opt);
  }
  return map;
}

/** Find group index by similarity threshold. */
function findSimilarGroup(
  groups: { text: string; authors: Set<string> }[],
  text: string
): { index: number; score: number } {
    if (!text) return { index: -1, score: 0 };
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < groups.length; i++) {
        const score = safeCompareStrings(groups[i].text, text);
        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }
    return { index: bestIndex, score: bestScore };
}


export function calculateTrapAnswerScores(
  activePlayers: Player[],
  question: TrapQuestion,
  playerAnswers: Record<string, string | null>,
  playerGuesses: Record<string, string | null>,
  awayPlayerIdsInRound: string[],
  shuffledAnswers: string[]
) {
  // Initialize round scores for active players only
  const roundScores: RoundScores = activePlayers.reduce((acc, p) => {
    acc[p.id] = { points: 0, breakdown: [] };
    return acc;
  }, {} as RoundScores);

  const newTrickStats: TrickStats = { trickedBy: {}, trickedOthers: {} };
  const timedOutGuesserIds: string[] = [];
  
  const canonicalMap = buildCanonicalOptionsMap(shuffledAnswers);
  const correctSig = getSimilaritySignature(question.answer);
  const correctDisplayedOpt =
    [...canonicalMap.entries()].find(
      ([sig, txt]) => safeCompareStrings(txt, question.answer) > SIMILARITY_THRESHOLD || sig === correctSig
    )?.[1] ?? question.answer;

  // Group similar trap answers
  const answerGroups: { text: string; authors: Set<string> }[] = [];
  for (const [authorId, answerText] of Object.entries(playerAnswers)) {
    if (answerText === null) continue;
    const trimmed = answerText.trim();
    if (!trimmed) continue;
    
    // Check against correct answer first
    if (safeCompareStrings(trimmed, question.answer) > 0.70) continue;

    const { index, score } = findSimilarGroup(answerGroups, trimmed);
    if (index !== -1 && score > SIMILARITY_THRESHOLD) {
        answerGroups[index].authors.add(authorId);
    } else {
        answerGroups.push({ text: trimmed, authors: new Set([authorId]) });
    }
  }


  // Scoring
  for (const [guesserId, rawGuess] of Object.entries(playerGuesses)) {
    if (rawGuess === TIMEOUT_TOKEN) {
      timedOutGuesserIds.push(guesserId);
      continue;
    }
    if (rawGuess == null) continue;
    
    const guessSig = getSimilaritySignature(rawGuess);
    const displayedGuess = canonicalMap.get(guessSig)
      ?? [...canonicalMap.values()].find(opt => safeCompareStrings(opt, rawGuess) > SIMILARITY_THRESHOLD);

    if (!displayedGuess) continue;

    const isCorrect = safeCompareStrings(displayedGuess, correctDisplayedOpt) > SIMILARITY_THRESHOLD
      || (getSimilaritySignature(displayedGuess) === getSimilaritySignature(correctDisplayedOpt));

    if (isCorrect) {
      ensureBucket(roundScores, guesserId);
      roundScores[guesserId].points += 2;
      roundScores[guesserId].breakdown.push({ reason: "إجابة صحيحة", points: 2 });
      continue;
    }

    const { index: chosenGroupIdx } = findSimilarGroup(answerGroups, displayedGuess);
    if (chosenGroupIdx < 0) continue;
    
    const group = answerGroups[chosenGroupIdx];
    const authors = [...group.authors];

    if (group.authors.has(guesserId)) {
      ensureBucket(roundScores, guesserId);
      roundScores[guesserId].points -= 1;
      roundScores[guesserId].breakdown.push({ reason: "صوّت لنفسه", points: -1 });
    }

    const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';
    for (const authorId of authors) {
      if (authorId === guesserId && roundScores[guesserId].breakdown.some(b => b.reason === 'صوّت لنفسه')) {
         // If a player votes for their own answer, they should get both the penalty and the points for tricking others.
         // Let's ensure the logic reflects this if needed, but for now, we separate.
      }
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

  // Build results list
  const resultsByAnswer: ResultsByAnswer = [];
  for (const optionText of shuffledAnswers) {
    const isCorrect =
      safeCompareStrings(optionText, correctDisplayedOpt) > SIMILARITY_THRESHOLD ||
      (getSimilaritySignature(optionText) === getSimilaritySignature(correctDisplayedOpt));
    
    const { index: groupIndex } = findSimilarGroup(answerGroups, optionText);
    const group = groupIndex !== -1 ? answerGroups[groupIndex] : null;

    const guesserIds = Object.entries(playerGuesses)
      .filter(([pid, g]) => g !== TIMEOUT_TOKEN && g != null && (safeCompareStrings(g, optionText) > SIMILARITY_THRESHOLD))
      .map(([pid]) => pid);

    resultsByAnswer.push({
      text: optionText,
      isCorrect,
      authorIds: isCorrect ? [] : group ? [...group.authors] : [],
      guesserIds
    });
  }

  return {
    roundScores,
    resultsByAnswer,
    newTrickStats,
    timedOutGuesserIds,
    awayPlayerIdsDuringRound: awayPlayerIdsInRound
  };
}