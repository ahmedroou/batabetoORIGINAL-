
'use server';

/**
 * @fileOverview AI flow to generate a daily news article summarizing game events.
 *
 * - generateNewsArticle - The main function that orchestrates the generation.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { 
    type NewsArticleInput, 
    type NewsArticleOutput, 
    NewsArticleInputSchema,
    NewsArticleOutputSchema,
    DraftArticleSchema,
    EventSummarySchema
} from '@/types';


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
  prompt: `You are a news analyst for a social deduction and strategy game. Your job is to identify the most dramatic, important, and interesting events from a raw list of daily occurrences. Focus on betrayals, major victories, significant punishments, ongoing rivalries, and surprising outcomes.

Today's Date: {{{date}}}
---
**Recent Social Events (Last 24 Hours):**
{{#if events}}
{{#each events}}
- Event Type: {{type}}, Description: {{description}}, Timestamp: {{timestamp}}
{{/each}}
{{else}}
- No significant new social events today.
{{/if}}
---
**Active Punishments:**
{{#if punished_players}}
{{#each punished_players}}
- {{name}} is currently being punished.
{{/each}}
{{else}}
- The community is peaceful; no one is currently being punished.
{{/if}}
---
**Active Challenges:**
{{#if active_challenges}}
{{#each active_challenges}}
- Challenge '{{title}}' is ongoing.
{{/each}}
{{/if}}
---
**Top Punisher:**
{{#if top_punisher}}
- {{top_punisher.name}} is known as the top punisher.
{{else}}
- No one has distinguished themselves as a top punisher yet.
{{/if}}
---
**Top 5 Leaderboard:**
{{#each leaderboard}}
- {{name}} ({{leaderboardPoints}} points)
{{/each}}
---
**Recent Game Results (Last 10 Games):**
{{#if recent_games}}
{{#each recent_games}}
- Game '{{gameType}}' finished. Winner: {{gameResult.winner}}.
{{/each}}
{{/if}}
---
**Previously Published Articles (Last 7 Days):**
{{#if previous_articles}}
{{#each previous_articles}}
- Headline: "{{title}}" (Published by: {{authorName}})
{{/each}}
{{/if}}
---
Based on ALL of this information, provide a summary. Select only the key events that would make for a juicy news story. Connect new events to older stories if possible. Ignore minor events unless they contribute to a larger narrative (e.g., a top player losing a duel).
`,
});

// 2. Define the Writer Prompt (using a more creative model)
const writerPrompt = ai.definePrompt({
  name: 'newsArticleWriter',
  input: { schema: z.object({ date: z.string(), summary: EventSummarySchema, directive: z.string().optional() }) },
  output: { schema: DraftArticleSchema },
  model: 'googleai/gemini-1.5-pro-latest', // Use a more powerful model for creative writing
  prompt: `You are a sarcastic and witty journalist for a game world's newspaper called "بطابيطو اليوم". Your audience loves drama, satire, and humor. Write a news article in Arabic based on the provided summary of today's events.

Today's Date: {{{date}}}

{{#if directive}}
**Admin's Directive:** Focus on this: {{{directive}}}
{{/if}}

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
    const { output: draftArticle } = await writerPrompt({ date: input.date, summary, directive: input.directive });
    if (!draftArticle) {
      throw new Error('AI Writer failed to produce an article.');
    }

    return {
      headline: draftArticle.headline,
      body: draftArticle.body,
      category: 'أخبار اللعبة',
      // Image generation can be added here if needed in the future
      imageUrl: "", 
    };
  }
);

    