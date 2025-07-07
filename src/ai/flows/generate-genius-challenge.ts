
'use server';

/**
 * @fileOverview AI flow to generate puzzles for the King of Genius game.
 *
 * - generateGeniusChallenge - Generates a puzzle for a given challenge ID.
 * - GenerateGeniusChallengeInput - The input type for the function.
 * - GenerateGeniusChallengeOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateGeniusChallengeInputSchema = z.object({
  challengeId: z
    .string()
    .describe("The ID of the challenge to generate, e.g., 'code_breaker'."),
});
export type GenerateGeniusChallengeInput = z.infer<
  typeof GenerateGeniusChallengeInputSchema
>;

const GenerateGeniusChallengeOutputSchema = z.object({
  secretCode: z.array(z.string()).length(4).describe('An array of 4 unique single-digit strings (e.g., ["1", "7", "3", "9"]).'),
});
export type GenerateGeniusChallengeOutput = z.infer<
  typeof GenerateGeniusChallengeOutputSchema
>;

export async function generateGeniusChallenge(
  input: GenerateGeniusChallengeInput
): Promise<GenerateGeniusChallengeOutput> {
  return generateGeniusChallengeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateGeniusChallengePrompt',
  input: { schema: GenerateGeniusChallengeInputSchema },
  output: { schema: GenerateGeniusChallengeOutputSchema },
  prompt: `أنت مساعد خبير في تصميم الألعاب. مهمتك هي إنشاء لغز لتحدي "كسر الشفرة".

قم بتوليد شفرة سرية مكونة من 4 أرقام. يجب أن يكون كل رقم فريدًا (لا يتكرر).
على سبيل المثال: [ "1", "7", "3", "9" ]

تأكد من أن المخرجات هي مصفوفة من السلاسل النصية، كل سلسلة تحتوي على رقم واحد فقط.
`,
});

const generateGeniusChallengeFlow = ai.defineFlow(
  {
    name: 'generateGeniusChallengeFlow',
    inputSchema: GenerateGeniusChallengeInputSchema,
    outputSchema: GenerateGeniusChallengeOutputSchema,
  },
  async (input) => {
    // For now, we only have one challenge type.
    // This can be expanded with a switch statement for different challenge IDs.
    if (input.challengeId === 'code_breaker') {
      const { output } = await prompt(input);
      return output!;
    }
    // Fallback for unimplemented challenges
    throw new Error(`Challenge generation for '${input.challengeId}' is not implemented.`);
  }
);
