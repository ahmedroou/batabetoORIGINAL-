
'use server';

/**
 * @fileOverview AI flow to generate a daily news article summarizing game events.
 *
 * - generateNewsArticle - The main function that orchestrates the generation.
 * - NewsArticleInputSchema - The input type for the main function.
 * - NewsArticleOutputSchema - The return type for the main function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { SocialEvent, Article } from '@/types';

// Define Zod schemas for the flow
const EventSummarySchema = z.object({
  key_events: z.array(z.string()).describe('A list of the most interesting and dramatic events of the day, including key points from previous articles.'),
  overall_mood: z.string().describe('A one-sentence summary of the general mood of the day (e.g., "A day of surprising betrayals and unexpected victories.").'),
});

const DraftArticleSchema = z.object({
  headline: z.string().describe('A catchy, satirical, and dramatic headline for the news article.'),
  body: z.string().describe('The full body of the news article, written in an engaging and slightly sarcastic journalistic style. It should connect the key events into a coherent narrative. The length should be between 100 and 200 words.'),
});

export const NewsArticleInputSchema = z.object({
  events: z.array(z.any()).describe('An array of social event objects from the game from the last 24 hours.'),
  previous_articles: z.array(z.any()).describe('An array of articles published in the last week, to provide context.'),
  date: z.string().describe("Today's date in a readable format (e.g., 'Sunday, July 28, 2024')."),
});
export type NewsArticleInput = z.infer<typeof NewsArticleInputSchema>;

export const NewsArticleOutputSchema = z.object({
  headline: z.string(),
  body: z.string(),
  category: z.string().default('أخبار اللعبة'),
  imageUrl: z.string().optional(),
});
export type NewsArticleOutput = z.infer<typeof NewsArticleOutputSchema>;

// The main exported function to be called from the server action
export async function generateNewsArticle(input: NewsArticleInput): Promise<NewsArticleOutput> {
  return newsGeneratorFlow(input);
}


// --- Genkit Flow Definition ---

// 1. Define the Analyzer Prompt (using a cost-effective model)
const analyzerPrompt = ai.definePrompt({
  name: 'newsEventAnalyzer',
  input: { schema: NewsArticleInputSchema },
  output: { schema: EventSummarySchema },
  model: 'googleai/gemini-1.5-flash-latest',
  prompt: `You are a news analyst for a social deduction and strategy game. Your job is to identify the most dramatic, important, and interesting events from a raw list of daily occurrences and headlines from the past week. Focus on betrayals, major victories, significant punishments, ongoing rivalries, and surprising outcomes.

Today's Date: {{{date}}}
---
**Recent Events (Last 24 Hours):**
{{#if events}}
{{#each events}}
- Event Type: {{type}}
  Description: {{description}}
  Timestamp: {{timestamp}}
{{/each}}
{{else}}
- No significant new events today.
{{/if}}
---
**Previously Published Articles (Last 7 Days):**
{{#if previous_articles}}
{{#each previous_articles}}
- Headline: "{{title}}" (Published by: {{authorName}})
{{/each}}
{{else}}
- No articles published recently.
{{/if}}
---
Based on ALL of this information, provide a summary. Select only the key events that would make for a juicy news story. Connect new events to older stories if possible. Ignore minor events like simple game wins unless it was a duel or a significant match.
`,
});

// 2. Define the Writer Prompt (using a more creative model)
const writerPrompt = ai.definePrompt({
  name: 'newsArticleWriter',
  input: { schema: z.object({ date: z.string(), summary: EventSummarySchema }) },
  output: { schema: DraftArticleSchema },
  model: 'googleai/gemini-1.5-pro-latest', // Use a more powerful model for creative writing
  prompt: `You are a sarcastic and witty journalist for a game world's newspaper called "بطابيطو اليوم". Your audience loves drama, satire, and humor. Write a news article based on the provided summary of today's events.

Today's Date: {{{date}}}

Editor's Summary:
- Overall Mood: {{{summary.overall_mood}}}
- Key Events:
{{#each summary.key_events}}
  - {{{this}}}
{{/each}}

Your task is to write a news article in Arabic.
- Craft a click-worthy, dramatic headline.
- Weave the key events into a narrative.
- Use a satirical, humorous, and slightly mocking tone.
- Do not just list the events. Create a story around them.
- The article should be engaging and make the players feel like their actions have consequences and are being watched.
`,
});

// 3. Define the main Flow that orchestrates the two steps
const newsGeneratorFlow = ai.defineFlow(
  {
    name: 'newsGeneratorFlow',
    inputSchema: NewsArticleInputSchema,
    outputSchema: NewsArticleOutputSchema,
  },
  async (input) => {
    // Step 1: Analyze events to get a summary
    const { output: summary } = await analyzerPrompt(input);
    if (!summary) {
      throw new Error('AI Analyzer failed to produce a summary.');
    }

    // Step 2: Write the article based on the summary
    const { output: draftArticle } = await writerPrompt({ date: input.date, summary });
    if (!draftArticle) {
      throw new Error('AI Writer failed to produce an article.');
    }

    // (Optional Step 3: Image Generation - can be added later)
    // For now, we'll return a placeholder image or none at all.
    // const imageUrl = await generateImageForArticle(draftArticle.headline);

    return {
      headline: draftArticle.headline,
      body: draftArticle.body,
      category: 'أخبار اللعبة',
      // imageUrl: imageUrl,
    };
  }
);
