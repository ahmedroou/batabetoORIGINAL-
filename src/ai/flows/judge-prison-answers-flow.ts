

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
    *   اقبل الأخطاء الإملائية البسيطة جدًا التي لا تغير المعنى (مثل "تفاح" و "تفاحة"). لكن ارفض الأخطاء الإملائية الكبيرة التي تغير الكلمة أو تجعلها غير مفهومة.
    *   تقبل الإجابات باللغة العربية أو الإنجليزية طالما أنها صحيحة 100% ومنطقية في سياق السؤال.
    *   **ارفض الإجابات المكررة بشكل واضح ضمن قائمة اللاعب الواحد.** لا يهم إذا تكررت الإجابة بين لاعبين مختلفين، المهم هو عدم تكرارها لدى نفس اللاعب.
4.  **تحديد الإجابات الصحيحة فقط:** لكل لاعب، قم بإنشاء قائمة تحتوي **فقط** على الإجابات التي اعتبرتها صحيحة تمامًا بناءً على القواعد الصارمة أعلاه.
5.  **حساب النقاط:** عدد الإجابات في قائمة الإجابات الصحيحة هو نقاط اللاعب.
6.  **المخرجات:** قم بإرجاع النتائج في صيغة JSON المطلوبة.
7. ** الاجوبة التي تظهر انها عشوائية او مكررة بصيغة عشوائية لا تقبلها ولا تقبل الامور المنطقية ان كانت غريبة وغير مستساغة مثلا اذا كان السؤال عن مشروب صحي لا يمكن للاعب تقديم جواب عصير جرجير او عصير بصل 
البيانات المقدمة من اللاعبين:
{{#each submissions}}
- **اللاعب:** {{name}} (ID: {{playerId}})
  - **الإجابات:** {{#each answers}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

{{#if rejudgeReasons.length}}
### طلب إعادة تقييم
لقد طلب بعض اللاعبين إعادة تقييم النتائج السابقة. هذه هي أسبابهم:
{{#each rejudgeReasons}}
- **اللاعب:** {{name}} (ID: {{playerId}})
  - **السبب:** "{{{reason}}}"
{{/each}}

**مهمتك الإضافية:**
حلل هذه الأسباب. هل يقدم أي لاعب حجة منطقية أو معلومة جديدة تجعلك تغير رأيك في إجابة معينة؟
- **إذا كانت الحجة صحيحة ومنطقية:** قم بتعديل قائمتك للإجابات الصحيحة بناءً على ذلك. على سبيل المثال، إذا أثبت لاعب أن "بطيخ" هو فاكهة، يجب عليك قبوله.
- **إذا كانت الحجة ضعيفة أو غير صحيحة:** تجاهلها تمامًا وحافظ على حكمك الأصلي. يجب أن تظل صارمًا وموضوعيًا. لا تقبل الأعذار الواهية.
- **مهم جدًا:** لا تقبل التبريرات التي تعتمد على نوايا اللاعب مثل "كنت أقصد كتابة كلمة أخرى" أو "لم أنتبه للخطأ". أحكم فقط على النص المكتوب أمامك.

بعد تحليل الأسباب، أعد تقييم جميع الإجابات مرة أخرى وأصدر حكمك النهائي.
{{/if}}

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
