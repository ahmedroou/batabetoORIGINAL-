'use server';

/**
 * @fileOverview This file defines the AI flow for generating personalized questions.
 *
 * - generatePersonalizedQuestions - The function to call the AI flow.
 * - GeneratePersonalizedQuestionsInput - The input type for the flow.
 * - GeneratePersonalizedQuestionsOutput - The output type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Define the input schema using Zod
export const GeneratePersonalizedQuestionsInputSchema = z.object({
  category: z.enum([
    "Emotional",
    "Tastes",
    "Funny",
    "People",
    "Personal",
    "Game-Style",
  ]).describe("The category of the questions to generate."),
  count: z.number().int().min(1).max(10).describe("The number of questions to generate."),
});
export type GeneratePersonalizedQuestionsInput = z.infer<typeof GeneratePersonalizedQuestionsInputSchema>;

// Define the output schema using Zod
export const GeneratePersonalizedQuestionsOutputSchema = z.object({
  questions: z.array(z.string()).describe("An array of generated questions."),
});
export type GeneratePersonalizedQuestionsOutput = z.infer<typeof GeneratePersonalizedQuestionsOutputSchema>;


// The main function that calls the AI flow
export async function generatePersonalizedQuestions(input: GeneratePersonalizedQuestionsInput): Promise<GeneratePersonalizedQuestionsOutput> {
  return generateQuestionsFlow(input);
}


// Define the Genkit prompt
const prompt = ai.definePrompt({
  name: 'generatePersonalizedQuestionsPrompt',
  input: { schema: GeneratePersonalizedQuestionsInputSchema },
  output: { schema: GeneratePersonalizedQuestionsOutputSchema },
  prompt: `Generate {{{count}}} unique and insightful questions for a friendship game based on the category '{{{category}}}'. The questions should follow the format: "What's your [emotion/food/habit/personality]-related preference?".

For example:
- If the category is 'Tastes', a good question would be "What's your favorite type of cuisine to eat when you're celebrating?".
- If the category is 'Emotional', a good question would be "What's your go-to comfort movie when you're feeling down?".

Ensure the questions are engaging and help players learn more about each other.
`,
});

// Define the Genkit flow
const generateQuestionsFlow = ai.defineFlow(
  {
    name: 'generateQuestionsFlow',
    inputSchema: GeneratePersonalizedQuestionsInputSchema,
    outputSchema: GeneratePersonalizedQuestionsOutputSchema,
  },
  async (input) => {
    const llmResponse = await prompt(input);
    return llmResponse.output!;
  }
);
