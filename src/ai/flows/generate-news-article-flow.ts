
'use server';

/**
 * @fileOverview An AI flow to generate a comprehensive, analytical, and satirical news article about the game world.
 *
 * - generateNewsArticle - The function that generates the article.
 * - NewsArticleInputSchema - The input type for the function.
 * - NewsArticleOutputSchema - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { NewsArticleInputSchema, NewsArticleOutputSchema } from '@/types';
import { googleAI } from '@genkit-ai/googleai';

export async function generateNewsArticle(
  input: z.infer<typeof NewsArticleInputSchema>
): Promise<z.infer<typeof NewsArticleOutputSchema>> {
  return generateArticleFlow(input);
}

const generationPrompt = `
You are a witty, sharp, and satirical journalist for a popular in-game newspaper. Your writing style is a mix of The Economist's analytical depth and The Onion's biting satire. You see through the noise and report on the *real* stories, the power dynamics, and the drama unfolding in the game world. Your tone is sophisticated, journalistic, and slightly condescending to the players' antics.

**Your Task:**
Write a comprehensive news article based on the provided JSON data. The article must be long, detailed, and structured like a professional news piece. It must have a catchy, dramatic headline and a full body of text (3-5 paragraphs, 150-250 words total).

**Mandatory Structure & Style:**
1.  **Headline:** Create a powerful, click-worthy headline that hints at the day's main drama.
2.  **Introduction:** Start with a strong opening paragraph summarizing the day's most significant event or trend.
3.  **Body Paragraphs:**
    *   Dive deeper. Connect different events. Don't just list what happened; analyze *why*.
    *   Discuss the leaderboard shifts. Who is rising? Who is falling? Is the "King of Games" showing weakness?
    *   Mention the punished players. Frame their punishment not just as a penalty, but as a public spectacle of failure or a sign of shifting power.
    *   Reference recent game outcomes and active challenges. Are they a distraction, or the new arena for power struggles?
    *   Use the provided context from previous articles to build a continuous narrative. Show that you remember past events.
4.  **Conclusion:** End with a forward-looking statement, a rhetorical question, or a cynical prediction about what might happen next.

**Data Context (JSON Input):**
- \`events\`: Raw social events. Look for betrayals, new alliances, etc.
- \`previous_articles\`: Use these to understand the ongoing narrative. Don't repeat old news, but build on it.
- \`leaderboard\`: The top dogs. Are they secure?
- \`punished_players\`: The fallen. What does their failure signify?
- \`top_punisher\`: The enforcer. Is their power growing?
- \`active_challenges\`: Where the next battles are fought.
- \`recent_games\`: Sidelights or main events? You decide.
- \`date\`: Today's date for the byline.
- \`directive\`: An optional hint from the admin. Give it high priority.

**Final Output:**
You must provide your response in a valid JSON object with a "headline" and a "body".
`;

const generateArticleFlow = ai.defineFlow(
  {
    name: 'generateArticleFlow',
    inputSchema: NewsArticleInputSchema,
    outputSchema: NewsArticleOutputSchema,
  },
  async (input) => {
    // Step 1: Generate the text content of the article
    const articleTextResponse = await ai.generate({
      model: 'googleai/gemini-1.5-flash-latest',
      prompt: generationPrompt,
      config: {
        // Specify JSON output mode for reliable parsing
        responseMimeType: 'application/json',
      },
      context: [
        {
          role: 'user',
          content: [{ json: input }],
        },
      ],
    });

    const { headline, body } = JSON.parse(articleTextResponse.text) as { headline: string, body: string };

    // Step 2: Generate a unique image for the article based on its content
    const imagePrompt = `Generate a satirical, political-cartoon-style image that visually represents this headline: "${headline}". The style should be like a newspaper's editorial cartoon, using symbolism and caricature. For example, if the headline is about a falling king, show a king with a crooked crown tripping over a game piece.`;
    
    const imageResponse = await ai.generate({
      model: googleAI.model('gemini-2.0-flash-preview-image-generation'),
      prompt: imagePrompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const imageUrl = imageResponse.media?.url ?? undefined;

    // Step 3: Combine and return
    return {
      headline,
      body,
      imageUrl,
      category: 'أخبار اللعبة',
    };
  }
);
