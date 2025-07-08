
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

// Schema for Code Breaker
const CodeBreakerPuzzleSchema = z.object({
  secretCode: z.array(z.string()).length(5).describe('An array of 5 unique single-digit strings (e.g., ["1", "7", "3", "9", "5"]).'),
});

// Schema for a single math problem
const SingleMathProblemSchema = z.object({
  problem: z.string().describe('A mathematical problem string, e.g., "15 * 3 - 7".'),
  answer: z.number().describe('The numerical answer to the problem.'),
});

// Schema for Quick Math challenge
const MathPuzzleSchema = z.object({
  problems: z.array(SingleMathProblemSchema).length(5).describe('An array of 5 math problems.'),
});


const GenerateGeniusChallengeOutputSchema = z.object({
  puzzle: z.any().describe("The generated puzzle object, structure depends on challengeId."),
});
export type GenerateGeniusChallengeOutput = z.infer<
  typeof GenerateGeniusChallengeOutputSchema
>;

export async function generateGeniusChallenge(
  input: GenerateGeniusChallengeInput
): Promise<GenerateGeniusChallengeOutput> {
  return generateGeniusChallengeFlow(input);
}

const codeBreakerPrompt = ai.definePrompt({
  name: 'generateCodeBreakerPrompt',
  input: { schema: z.object({}) },
  output: { schema: CodeBreakerPuzzleSchema },
  prompt: `أنت مساعد خبير في تصميم الألعاب. مهمتك هي إنشاء لغز لتحدي "كسر الشفرة".

قم بتوليد شفرة سرية مكونة من 5 أرقام. يجب أن يكون كل رقم فريدًا (لا يتكرر).
على سبيل المثال: [ "1", "7", "3", "9", "5" ]

تأكد من أن المخرجات هي مصفوفة من السلاسل النصية، كل سلسلة تحتوي على رقم واحد فقط.
`,
});

const mathPuzzlePrompt = ai.definePrompt({
  name: 'generateMathPuzzlePrompt',
  input: { schema: z.object({}) },
  output: { schema: MathPuzzleSchema },
  prompt: `أنت مساعد خبير في تصميم الألعاب. مهمتك هي إنشاء لغز لتحدي "الحساب السريع".

قم بتوليد 5 مسائل حسابية. يجب أن تزداد صعوبة المسائل تدريجيًا.
- المسائل الأولى يجب أن تكون بسيطة (عمليتان حسابيتان ورقمان أو ثلاثة).
- المسائل الأخيرة يجب أن تكون أكثر تعقيدًا (ثلاث عمليات حسابية، أرقام أكبر، استخدام الأقواس).
- يجب أن تتضمن المسائل عمليات الضرب والجمع والطرح.
- تجنب القسمة والأرقام السالبة في النتيجة النهائية.

مثال للمخرجات:
{
  "problems": [
    { "problem": "9 * 5 - 10", "answer": 35 },
    { "problem": "20 + 7 * 3", "answer": 41 },
    { "problem": "5 * (12 - 4)", "answer": 40 },
    { "problem": "100 - 15 * 5 + 3", "answer": 28 },
    { "problem": "8 * (6 + 9) - 20", "answer": 100 }
  ]
}

تأكد من أن المخرجات تحتوي على مفتاح "problems" وبداخله مصفوفة من 5 كائنات، كل كائن يحتوي على "problem" و "answer".
`,
});


const generateGeniusChallengeFlow = ai.defineFlow(
  {
    name: 'generateGeniusChallengeFlow',
    inputSchema: GenerateGeniusChallengeInputSchema,
    outputSchema: GenerateGeniusChallengeOutputSchema,
  },
  async (input) => {
    switch (input.challengeId) {
        case 'code_breaker': {
            const { output } = await codeBreakerPrompt({});
            return { puzzle: output! };
        }
        case 'quick_math': {
            const { output } = await mathPuzzlePrompt({});
            return { puzzle: output! };
        }
        default:
            throw new Error(`Challenge generation for '${input.challengeId}' is not implemented.`);
    }
  }
);
