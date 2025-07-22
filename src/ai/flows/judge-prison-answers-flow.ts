
'use server';
/**
 * @fileOverview An AI flow to act as a judge in the Prison game.
 * - judgePrisonAnswers - The function that judges player submissions.
 * - JudgePrisonAnswersInput - The input type for the function.
 * - JudgePrisonAnswersOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const PlayerAnswersSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  answers: z.array(z.string()),
});

export const JudgePrisonAnswersInputSchema = z.object({
  question: z.string().describe('The question that was asked to the players.'),
  submissions: z
    .array(PlayerAnswersSchema)
    .describe('An array of player submissions.'),
});
export type JudgePrisonAnswersInput = z.infer<
  typeof JudgePrisonAnswersInputSchema
>;

const SinglePlayerResultSchema = z.object({
  playerId: z.string(),
  correctAnswers: z
    .array(z.string())
    .describe('A list of the answers that you considered correct.'),
  score: z.number().int().describe('The total count of correct answers.'),
});

export const JudgePrisonAnswersOutputSchema = z.object({
  results: z
    .array(SinglePlayerResultSchema)
    .describe('The judging results for each player.'),
});
export type JudgePrisonAnswersOutput = z.infer<
  typeof JudgePrisonAnswersOutputSchema
>;

export async function judgePrisonAnswers(
  input: JudgePrisonAnswersInput
): Promise<JudgePrisonAnswersOutput> {
  return judgePrisonAnswersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'judgePrisonAnswersPrompt',
  input: { schema: JudgePrisonAnswersInputSchema },
  output: { schema: JudgePrisonAnswersOutputSchema },
  prompt: `أنت حكم خبير، ذكي، ومنطقي في لعبة ذهنية. مهمتك هي تقييم إجابات اللاعبين على سؤال معين بدقة وموضوعية.

القواعد الأساسية للحكم:
1.  **فهم السؤال:** حلل السؤال بعمق: "{{{question}}}". هل هو سؤال يتطلب إجابات محددة (مثل "عواصم أوروبية") أم إبداعية (مثل "أشياء تفعلها في المصعد")؟
2.  **تقييم الإجابات:** لكل لاعب، راجع قائمة إجاباته.
3.  **الدقة والمرونة:**
    *   كن مرنًا مع الأخطاء الإملائية البسيطة أو الاختلافات الطفيفة (مثال: "تفاح" و "تفاحة" كلاهما صحيح).
    *   تقبل الإجابات باللغة العربية أو الإنجليزية طالما أنها صحيحة ومنطقية في سياق السؤال.
    *   إذا كان السؤال يتطلب فئة معينة، تأكد من أن الإجابة تنتمي لتلك الفئة.
    *   ارفض الإجابات المكررة بشكل واضح ضمن قائمة اللاعب الواحد.
4.  **تحديد الإجابات الصحيحة:** لكل لاعب، قم بإنشاء قائمة تحتوي **فقط** على الإجابات التي اعتبرتها صحيحة.
5.  **حساب النقاط:** عدد الإجابات في قائمة الإجابات الصحيحة هو نقاط اللاعب.
6.  **المخرجات:** قم بإرجاع النتائج في صيغة JSON المطلوبة.

البيانات المقدمة من اللاعبين:
{{#each submissions}}
- **اللاعب:** {{name}} (ID: {{playerId}})
  - **الإجابات:** {{#each answers}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

مهمتك الآن هي تطبيق هذه القواعد على البيانات المقدمة وإرجاع النتيجة النهائية.
`,
});

const judgePrisonAnswersFlow = ai.defineFlow(
  {
    name: 'judgePrisonAnswersFlow',
    inputSchema: JudgePrisonAnswersInputSchema,
    outputSchema: JudgePrisonAnswersOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
