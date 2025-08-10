'use server';

/**
 * @fileOverview An AI flow to generate a plausible but incorrect ("trap") answer for a given question.
 *
 * - generateTrapAnswer - The function that generates the trap answer.
 * - GenerateTrapAnswerInput - The input type for the function.
 * - GenerateTrapAnswerOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const GenerateTrapAnswerInputSchema = z.object({
  question: z.string().describe('The question for which to generate a trap answer.'),
  correctAnswer: z.string().describe('The correct answer, which should not be replicated.'),
});
export type GenerateTrapAnswerInput = z.infer<typeof GenerateTrapAnswerInputSchema>;

const GenerateTrapAnswerOutputSchema = z.object({
  trapAnswer: z.string().describe('A plausible but incorrect answer for the question.'),
});
export type GenerateTrapAnswerOutput = z.infer<typeof GenerateTrapAnswerOutputSchema>;

export async function generateTrapAnswer(
  input: GenerateTrapAnswerInput
): Promise<GenerateTrapAnswerOutput> {
  return generateTrapAnswerFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateTrapAnswerPrompt',
  input: {schema: GenerateTrapAnswerInputSchema},
  output: {schema: GenerateTrapAnswerOutputSchema},
  prompt: `You are a creative assistant for a trivia game. Your task is to create a single, plausible-sounding but incorrect answer for a given question. This is a "trap answer" meant to trick players.

The question is: "{{{question}}}"

The real, correct answer is: "{{{correctAnswer}}}"

Generate one single trap answer. The trap answer must be:
- Incorrect.
- Plausible and believable.
- In Arabic.
- Different from the correct answer.

Do not include any preambles like "The trap answer is:". Just provide the answer itself.`,
});

const generateTrapAnswerFlow = ai.defineFlow(
  {
    name: 'generateTrapAnswerFlow',
    inputSchema: GenerateTrapAnswerInputSchema,
    outputSchema: GenerateTrapAnswerOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
