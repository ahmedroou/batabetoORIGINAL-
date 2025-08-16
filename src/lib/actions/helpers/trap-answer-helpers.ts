/**
 * @fileoverview Helper functions for the "Trap Answer" game logic (pure).
 * Preserves public API. Safer canonical mapping to displayed options,
 * stable grouping, and hardened trick stats.
 */
import type { Game, Player, TrapQuestion } from '@/types';
import { safeCompareStrings, getSimilaritySignature } from '../helpers';

const SIMILARITY_THRESHOLD = 0.90 as const;
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
function findSimilarGroupIdx(groups: { text: string; authors: Set<string> }[], text: string) {
  const t = text.trim();
  for (let i = 0; i < groups.length; i++) {
    if (safeCompareStrings(groups[i].text, t) > SIMILARITY_THRESHOLD) return i;
  }
  return -1;
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

  // Canonical map for displayed options (ensures scoring aligns with what players actually saw)
  const canonicalMap = buildCanonicalOptionsMap(shuffledAnswers);
  const correctSig = getSimilaritySignature(question.answer);
  const correctDisplayedOpt =
    [...canonicalMap.entries()].find(
      ([sig, txt]) => safeCompareStrings(txt, question.answer) > SIMILARITY_THRESHOLD || sig === correctSig
    )?.[1] ?? question.answer;

  // Group similar trap answers (authors as a Set for uniqueness)
  const answerGroups: { text: string; authors: Set<string> }[] = [];
  for (const [authorId, answerText] of Object.entries(playerAnswers)) {
    if (answerText === null) continue;
    const trimmed = answerText.trim();
    if (!trimmed) continue;

    const idx = findSimilarGroupIdx(answerGroups, trimmed);
    if (idx >= 0) {
      answerGroups[idx].authors.add(authorId);
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

    // Map guess to a canonical displayed option; ignore if not a displayed option
    const guessSig = getSimilaritySignature(rawGuess);
    const displayedGuess = canonicalMap.get(guessSig)
      ?? [...canonicalMap.values()].find(opt => safeCompareStrings(opt, rawGuess) > SIMILARITY_THRESHOLD);

    if (!displayedGuess) {
      // Safety: skip guesses that weren't on the board
      continue;
    }

    // Correct guess?
    const isCorrect = safeCompareStrings(displayedGuess, correctDisplayedOpt) > SIMILARITY_THRESHOLD
      || (getSimilaritySignature(displayedGuess) === getSimilaritySignature(correctDisplayedOpt));

    if (isCorrect) {
      ensureBucket(roundScores, guesserId);
      roundScores[guesserId].points += 2;
      roundScores[guesserId].breakdown.push({ reason: "إجابة صحيحة", points: 2 });
      continue;
    }

    // Otherwise: guessed a trap (find the group whose representative matches the displayed guess)
    const chosenGroupIdx = findSimilarGroupIdx(answerGroups, displayedGuess);
    if (chosenGroupIdx < 0) {
      // Not matching any trap group (e.g., dummy answer) → no points change
      continue;
    }

    const group = answerGroups[chosenGroupIdx];
    const authors = [...group.authors];

    // Self-vote penalty
    if (group.authors.has(guesserId)) {
      ensureBucket(roundScores, guesserId);
      roundScores[guesserId].points -= 1;
      roundScores[guesserId].breakdown.push({ reason: "صوّت لنفسه", points: -1 });
    }

    // Award authors (excluding the guesser)
    const guesserName = activePlayers.find(p => p.id === guesserId)?.name || 'لاعب';
    for (const authorId of authors) {
      if (authorId === guesserId) continue;
      ensureBucket(roundScores, authorId);
      roundScores[authorId].points += 1;
      roundScores[authorId].breakdown.push({ reason: `خدع ${guesserName}`, points: 1 });

      // trickedOthers: credit all authors who fooled this guesser
      if (!newTrickStats.trickedOthers[authorId]) newTrickStats.trickedOthers[authorId] = [];
      if (!newTrickStats.trickedOthers[authorId].includes(guesserId)) {
        newTrickStats.trickedOthers[authorId].push(guesserId);
      }
    }

    // trickedBy: register exactly ONE author (deterministic)
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

  // Build results list exactly in the display order (merged options stay merged)
  const resultsByAnswer: ResultsByAnswer = [];
  for (const optionText of shuffledAnswers) {
    const isCorrect =
      safeCompareStrings(optionText, correctDisplayedOpt) > SIMILARITY_THRESHOLD ||
      (getSimilaritySignature(optionText) === getSimilaritySignature(correctDisplayedOpt));

    const group = answerGroups.find(g => safeCompareStrings(g.text, optionText) > SIMILARITY_THRESHOLD);

    // Collect guessers for this displayed option (exclude timeouts)
    const guesserIds = Object.entries(playerGuesses)
      .filter(([pid, g]) => g !== TIMEOUT_TOKEN && g != null)
      .map(([pid, g]) => {
        // map each raw guess to its displayed canonical option, then match
        const sig = getSimilaritySignature(String(g));
        const displayed = canonicalMap.get(sig)
          ?? [...canonicalMap.values()].find(opt => safeCompareStrings(opt, String(g)) > SIMILARITY_THRESHOLD);
        return displayed && safeCompareStrings(displayed, optionText) > SIMILARITY_THRESHOLD ? pid : null;
      })
      .filter((pid): pid is string => !!pid);

    resultsByAnswer.push({
      text: optionText,
      isCorrect,
      authorIds: isCorrect ? null : group ? [...group.authors] : [],
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
