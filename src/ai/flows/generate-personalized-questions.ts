'use server';

/**
 * @fileOverview AI flow to generate personalized questions based on a category.
 *
 * - generatePersonalizedQuestions - Generates questions based on category.
 * - GeneratePersonalizedQuestionsInput - The input type for the function.
 * - GeneratePersonalizedQuestionsOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GeneratePersonalizedQuestionsInputSchema = z.object({
  category: z
    .string()
    .describe("The category of question to generate (emotion, food, habit, personality)."),
});
export type GeneratePersonalizedQuestionsInput = z.infer<
  typeof GeneratePersonalizedQuestionsInputSchema
>;

const GeneratePersonalizedQuestionsOutputSchema = z.object({
  question: z.string().describe('The generated question.'),
});
export type GeneratePersonalizedQuestionsOutput = z.infer<
  typeof GeneratePersonalizedQuestionsOutputSchema
>;

export async function generatePersonalizedQuestions(
  input: GeneratePersonalizedQuestionsInput
): Promise<GeneratePersonalizedQuestionsOutput> {
  return generatePersonalizedQuestionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generatePersonalizedQuestionsPrompt',
  input: {schema: GeneratePersonalizedQuestionsInputSchema},
  output: {schema: GeneratePersonalizedQuestionsOutputSchema},
  prompt: `أنت مساعد ودود ومبدع في لعبة أسئلة. قم بصياغة سؤال ممتع وغير متوقع باللغة العربية بناءً على الفئة التالية: {{category}}. يجب أن يكون السؤال شخصيًا ومثيرًا للتفكير ومناسبًا للعبة بين الأصدقاء.`,
});

const generatePersonalizedQuestionsFlow = ai.defineFlow(
  {
    name: 'generatePersonalizedQuestionsFlow',
    inputSchema: GeneratePersonalizedQuestionsInputSchema,
    outputSchema: GeneratePersonalizedQuestionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
