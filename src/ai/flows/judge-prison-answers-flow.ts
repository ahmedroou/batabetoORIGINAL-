
'use server';
/**
 * @fileOverview An AI flow to act as a judge in the Prison game.
 * - judgePrisonAnswers - The function that judges player submissions.
 * - JudgePrisonAnswersInput - The input type for the function.
 * - JudgePrisonAnswersOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { JudgePrisonAnswersInputSchema, JudgePrisonAnswersOutputSchema, type JudgePrisonAnswersInput, type JudgePrisonAnswersOutput } from '@/types';

export async function judgePrisonAnswers(
  input: JudgePrisonAnswersInput
): Promise<JudgePrisonAnswersOutput> {
  return judgePrisonAnswersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'judgePrisonAnswersPrompt',
  input: { schema: JudgePrisonAnswersInputSchema },
  output: { schema: JudgePrisonAnswersOutputSchema },
  model: 'googleai/gemini-1.5-pro-latest',
  prompt: `أنت حكم خبير، ذكي، ومنطقي في لعبة ذهنية. مهمتك هي تقييم إجابات اللاعبين على سؤال معين بدقة وموضوعية. يجب أن تكون صارمًا جدًا في حكمك.

القواعد الأساسية للحكم:
1.  **فهم السؤال بعمق:** حلل السؤال جيدًا: "{{{question}}}". هل هو سؤال يتطلب فئة محددة جدًا (مثل "عواصم أوروبية فقط") أم فئة إبداعية (مثل "أشياء تفعلها في المصعد")؟
2.  **تقييم الإجابات بدقة شديدة:** لكل لاعب، راجع قائمة إجاباته.
3.  **الدقة الصارمة والمرونة المحدودة:**
    *   كن صارمًا جدًا. لا تقبل الإجابات التي تبدو صحيحة ولكنها ليست ضمن الفئة المطلوبة بدقة (مثال: إذا كان السؤال "فواكه"، فإن "خضار" إجابة خاطئة).
    *   ارفض الإجابات الغامضة أو العامة جدًا التي لا تجيب على السؤال بشكل مباشر.
    *   اقبل الأخطاء الإملائية البسيطة جدًا التي لا تغير المعنى (مثل "تفاح" و "تفاحة"). لكن ارفض الأخطاء الإملائية الكبيرة التي تغير الكلمة.
    *   تقبل الإجابات باللغة العربية أو الإنجليزية طالما أنها صحيحة 100% ومنطقية في سياق السؤال.
    *   ارفض الإجابات المكررة بشكل واضح ضمن قائمة اللاعب الواحد.
4.  **تحديد الإجابات الصحيحة فقط:** لكل لاعب، قم بإنشاء قائمة تحتوي **فقط** على الإجابات التي اعتبرتها صحيحة تمامًا بناءً على القواعد الصارمة أعلاه.
5.  **حساب النقاط:** عدد الإجابات في قائمة الإجابات الصحيحة هو نقاط اللاعب.
6.  **المخرجات:** قم بإرجاع النتائج في صيغة JSON المطلوبة.

البيانات المقدمة من اللاعبين:
{{#each submissions}}
- **اللاعب:** {{name}} (ID: {{playerId}})
  - **الإجابات:** {{#each answers}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

مهمتك الآن هي تطبيق هذه القواعد الصارمة على البيانات المقدمة وإرجاع النتيجة النهائية.
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
