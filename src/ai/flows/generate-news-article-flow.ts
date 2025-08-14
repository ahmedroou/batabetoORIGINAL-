'use server';

/**
 * @fileoverview Ultra-upgraded AI flow to generate a daily news article summarizing game events.
 *
 * Goals:
 *  - Preserve current external API (backward compatible `generateNewsArticle(input)` export).
 *  - Dramatically improve quality, consistency, and safety of outputs.
 *  - Add modular steps: pre-process ➜ analyze ➜ outline ➜ write ➜ polish ➜ validate ➜ post-process.
 *  - Fine-grained control via env + sensible defaults (models, temperature, tone, style, length).
 *  - Robustness: retries, timeouts, defensive checks, schema validation, safe string utilities.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import {
  type NewsArticleInput,
  type NewsArticleOutput,
  NewsArticleInputSchema,
  NewsArticleOutputSchema,
  DraftArticleSchema,
  EventSummarySchema,
} from '@/types';

/**
 * =========================
 * Configuration & Constants
 * =========================
 */

const DEFAULT_MODELS = {
  analyzer: process.env.NEWS_ANALYZER_MODEL || 'googleai/gemini-2.5-pro',
  outliner: process.env.NEWS_OUTLINER_MODEL || 'googleai/gemini-2.5-pro',
  writer: process.env.NEWS_WRITER_MODEL || 'googleai/gemini-2.5-pro',
  editor: process.env.NEWS_EDITOR_MODEL || 'googleai/gemini-2.5-pro',
};

const DEFAULT_TEMPS = {
  analyzer: Number(process.env.NEWS_ANALYZER_TEMP ?? 0.2),
  outliner: Number(process.env.NEWS_OUTLINER_TEMP ?? 0.3),
  writer: Number(process.env.NEWS_WRITER_TEMP ?? 0.7),
  editor: Number(process.env.NEWS_EDITOR_TEMP ?? 0.4),
};

// Hard caps to protect model inputs and outputs
const LIMITS = {
  maxEvents: 200,
  maxEventDescChars: 280,
  maxPrevArticles: 20,
  maxPlayers: 200,
  maxChallenges: 50,
  targetWordsMin: 110,
  targetWordsMax: 220,
};

// Tone presets
const ToneSchema = z.enum(['satire', 'dramatic', 'neutral', 'playful']);

// Optional directive extension
const ExtendedInputSchema = NewsArticleInputSchema.extend({
  tone: ToneSchema.optional(),
  wordTarget: z.number().min(80).max(300).optional(),
}).strict();

/**
 * ===============
 * Helper Utilities
 * ===============
 */

const safeStr = (s: unknown) => (typeof s === 'string' ? s : '')
  .replace(/\s+/g, ' ')
  .trim();

const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

const countWords = (s: string) => safeStr(s).split(/\s+/).filter(Boolean).length;

const pick = <T>(arr: T[], n: number): T[] => arr.slice(0, Math.max(0, n));

function uniqBy<T>(arr: T[], key: (t: T) => string | number) {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!seen.has(k)) { seen.add(k); out.push(item); }
  }
  return out;
}

const normalizeRtl = (s: string) => s
  // Normalize spaces & punctuation for better Arabic typography
  .replace(/\s+/g, ' ')
  .replace(/\s([،؛؟!:,.])/g, '$1')
  .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  .trim();

/**
 * =================
 * Pre-processing step
 * =================
 *  - Truncates oversized arrays
 *  - Sanitizes strings
 *  - Dedupe events and players
 */
function preprocessInput(raw: NewsArticleInput) {
  const input = ExtendedInputSchema.parse(raw);
  const events = uniqBy((input.events || []).slice(0, LIMITS.maxEvents).map(e => ({
    ...e,
    description: truncate(safeStr(e.description), LIMITS.maxEventDescChars),
  })), e => `${e.type}:${e.timestamp}`);

  const previous_articles = (input.previous_articles || []).slice(0, LIMITS.maxPrevArticles).map(a => ({
    ...a,
    title: truncate(safeStr(a.title), 140),
    authorName: truncate(safeStr(a.authorName), 80),
  }));

  const leaderboard = uniqBy((input.leaderboard || []).slice(0, LIMITS.maxPlayers), p => p.id);
  const punished_players = uniqBy((input.punished_players || []).slice(0, LIMITS.maxPlayers), p => p.id);
  const active_challenges = (input.active_challenges || []).slice(0, LIMITS.maxChallenges).map(c => ({
    ...c,
    title: truncate(safeStr(c.title), 80),
  }));

  return {
    ...input,
    events,
    previous_articles,
    leaderboard,
    punished_players,
    active_challenges,
    // Effective targets
    _effectiveWordTarget: clamp(input.wordTarget ?? LIMITS.targetWordsMax, LIMITS.targetWordsMin, LIMITS.targetWordsMax),
    _effectiveTone: input.tone ?? 'satire' as z.infer<typeof ToneSchema>,
  } as NewsArticleInput & { _effectiveWordTarget: number; _effectiveTone: z.infer<typeof ToneSchema> };
}

/**
 * =====================
 * Prompt Declarations
 * =====================
 */

const analyzerPrompt = ai.definePrompt({
  name: 'newsEventAnalyzer.v2',
  input: { schema: NewsArticleInputSchema },
  output: { schema: EventSummarySchema },
  model: DEFAULT_MODELS.analyzer,
  config: { temperature: DEFAULT_TEMPS.analyzer },
  prompt: `You are a reliable, non-hallucinating event analyst for a social deduction & strategy game.\n\nCRITICAL RULES:\n- Absolutely DO NOT invent facts, names, or scores. Use only provided data.\n- Prefer fewer, more meaningful highlights over many trivial ones.\n- Connect new events to prior stories only when evidence exists in \"previous_articles\" or \"events\".\n- If data is missing, say so briefly in the summary.\n\nReturn a concise Arabic summary with:\n- overall_mood (e.g., توتر، انتقام، فرح، فوضى)\n- 5—10 key_events (full sentences, crisp, juicy).\n- optional notable_stats (bullet-like facts: أعلى نقاط اليوم، سلسلة انتصارات/هزائم، إلخ).\n\nToday: {{{date}}}\n---\nActive Challenges:\n{{#if active_challenges}}{{#each active_challenges}}- '{{title}}' ends {{endsAt}} — participants: {{participantCount}}.\n{{/each}}{{else}}- لا توجد تحديات مفعّلة اليوم.{{/if}}\n---\nLast 24h Events:\n{{#if events}}{{#each events}}- [{{type}}] {{description}} ({{timestamp}})\n{{/each}}{{else}}- لا أحداث مهمة.{{/if}}\n---\nPunishments:\n{{#if punished_players}}{{#each punished_players}}- {{name}} تحت العقوبة.\n{{/each}}{{else}}- لا عقوبات حالية.{{/if}}\n---\nTop Punisher: {{#if top_punisher}}{{top_punisher.name}}{{else}}غير متوفر{{/if}}\n---\nLeaderboard Top 5:\n{{#each leaderboard}}- {{name}} ({{leaderboardPoints}})\n{{/each}}\n---\nRecent Games (up to 10):\n{{#if recent_games}}{{#each recent_games}}- '{{gameType}}' — Winner: {{gameResult.winner}}; Players: {{#each players}}{{name}} [{{lookup ../playerScores id}}], {{/each}}\n{{/each}}{{/if}}\n---\nPrevious 7 Days Headlines:\n{{#if previous_articles}}{{#each previous_articles}}- \"{{title}}\" — {{authorName}}\n{{/each}}{{/if}}\n\nNow compute the best, most newsworthy summary.`,
});

const outlinerPrompt = ai.definePrompt({
  name: 'newsArticleOutliner.v1',
  input: { schema: z.object({ date: z.string(), summary: EventSummarySchema, tone: ToneSchema }) },
  output: { schema: z.object({ outline: z.array(z.string()).min(3).max(8), angle: z.string() }) },
  model: DEFAULT_MODELS.outliner,
  config: { temperature: DEFAULT_TEMPS.outliner },
  prompt: `Create a short Arabic outline (3–8 bullet points) that sequences the story beats for a compelling article about today's game events.\n- Keep the selected tone in mind: {{{tone}}}.\n- Include a through-line/angle tying the events: rivalry, comeback, scandal, etc.\nReturn JSON with { outline: string[], angle: string }.`,
});

const writerPrompt = ai.definePrompt({
  name: 'newsArticleWriter.v3',
  input: { schema: z.object({ date: z.string(), summary: EventSummarySchema, outline: z.array(z.string()), tone: ToneSchema, wordTarget: z.number(), directive: z.string().optional() }) },
  output: { schema: DraftArticleSchema },
  model: DEFAULT_MODELS.writer,
  config: { temperature: DEFAULT_TEMPS.writer },
  prompt: `أنت صحفي ساخر وذكي في جريدة \"بطابيطو اليوم\" داخل عالم الألعاب. اكتب مقالة عربية ممتعة بناءً على المخطط المرفق.\n\nالقواعد:\n- لا تختلق حقائق أو أسماء. اعتمد فقط على الملخص والمخطط.\n- اجعل العنوان جذابًا ومشحونًا بالدراما دون مبالغة كاذبة.\n- الأسلوب: {{tone}} (ساخر/درامي/محايد/لعوب) — التزم بالحد.\n- انسج الأحداث في قصة واحدة لها بداية-وسط-نهاية.\n- طول المقال بين {{wordTarget}}±15 كلمة.\n- استخدم علامات الترقيم العربية (، ؛ ؟) وتجنّب الإكثار من الوجوه التعبيرية.\n- إن وُجدت {{directive}} فامنحها أولوية واضحة.\n\nأعِد المخرجات ككائن JSON يطابق DraftArticleSchema: { headline, body }.`,
});

const editorPrompt = ai.definePrompt({
  name: 'newsArticleEditor.v2',
  input: { schema: z.object({ draft: DraftArticleSchema, constraints: z.object({ minWords: z.number(), maxWords: z.number() }) }) },
  output: { schema: DraftArticleSchema },
  model: DEFAULT_MODELS.editor,
  config: { temperature: DEFAULT_TEMPS.editor },
  prompt: `راجِع المسودة العربية التالية:\n- صحّح الأسلوب، أزل التكرار، شدّد الحبكة، وحافظ على الحقائق.\n- اضبط الطول ليقع بدقة بين {{constraints.minWords}} و {{constraints.maxWords}} كلمة.\n- حسّن العنوان ليكون واضحًا ودقيقًا وجذابًا دون تضليل.\n- أعد JSON { headline, body } فقط.`,
});

/**
 * =====================
 * Retry / Guard Helpers
 * =====================
 */

async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 300): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { lastErr = e; if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1))); }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Unknown error');
}

function validateDraft(draft: z.infer<typeof DraftArticleSchema>, minWords: number, maxWords: number) {
  const headline = safeStr(draft.headline);
  const body = normalizeRtl(safeStr(draft.body));
  const words = countWords(body);

  if (!headline || !body) throw new Error('Draft is empty.');
  if (words < minWords || words > maxWords) throw new Error(`Draft length out of bounds (${words}).`);

  // Simple safety checks
  if (/\b(https?:\/\/|www\.)/i.test(body)) throw new Error('Body should not include URLs.');

  return { headline, body } as z.infer<typeof DraftArticleSchema>;
}

/**
 * =====================
 * Main Orchestrator Flow
 * =====================
 */

const newsGeneratorFlow = ai.defineFlow(
  {
    name: 'newsGeneratorFlow.v3',
    inputSchema: NewsArticleInputSchema,
    outputSchema: NewsArticleOutputSchema,
  },
  async (input) => {
    // 0) Preprocess & harden
    const pre = preprocessInput(input);
    const minWords = LIMITS.targetWordsMin;
    const maxWords = pre._effectiveWordTarget;

    // 1) Analyze
    const { output: summary } = await withRetry(() => analyzerPrompt(pre));
    if (!summary) throw new Error('AI Analyzer failed to produce a summary.');

    // 2) Outline
    const { output: outlined } = await withRetry(() => outlinerPrompt({ date: pre.date, summary, tone: pre._effectiveTone }));
    if (!outlined) throw new Error('AI Outliner failed.');

    // 3) Write
    const { output: draftArticle } = await withRetry(() => writerPrompt({
      date: pre.date,
      summary,
      outline: outlined.outline,
      tone: pre._effectiveTone,
      wordTarget: pre._effectiveWordTarget,
      directive: pre.directive,
    }));
    if (!draftArticle) throw new Error('AI Writer failed to produce an article.');

    // 4) Polish / Edit for length & style
    const { output: edited } = await withRetry(() => editorPrompt({
      draft: draftArticle,
      constraints: { minWords, maxWords },
    }));
    if (!edited) throw new Error('AI Editor failed.');

    // 5) Validate & post-process
    const clean = validateDraft(edited, minWords, maxWords);

    return {
      headline: clean.headline,
      body: clean.body,
      category: 'أخبار اللعبة',
      imageUrl: '',
    } satisfies NewsArticleOutput;
  }
);

/**
 * Public API — Backward compatible
 */
export async function generateNewsArticle(input: NewsArticleInput): Promise<NewsArticleOutput> {
  return newsGeneratorFlow(input);
}
