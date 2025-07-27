

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
  prompt: `أنت حكم آلي فائق الدقة، ومهمتك هي تقييم إجابات اللاعبين على سؤال معين. يجب أن تكون صارمًا ومنطقيًا للغاية في حكمك.

القواعد الأساسية للحكم:
1.  **فهم السؤال بعمق:** حلل السؤال جيدًا: "{{{question}}}".
2.  **تقييم الإجابات بدقة شديدة:** لكل لاعب، راجع قائمة إجاباته.
3.  **الدقة الصارمة والمرونة المحدودة:**
    *   **كن صارمًا جدًا.** لا تقبل الإجابات التي تبدو صحيحة ولكنها ليست ضمن الفئة المطلوبة بدقة (مثال: إذا كان السؤال "فواكه"، فإن "خضار" إجابة خاطئة).
    *   ارفض الإجابات الغامضة أو العامة جدًا التي لا تجيب على السؤال بشكل مباشر.
    *   اقبل الأخطاء الإملائية البسيطة جدًا التي لا تغير المعنى (مثل "تفاح" و "تفاحة"). لكن ارفض الأخطاء الإملائية الكبيرة التي تغير الكلمة أو تجعلها غير مفهومة.
    *   تقبل الإجابات باللغة العربية أو الإنجليزية طالما أنها صحيحة 100% ومنطقية في سياق السؤال.
    *   ارفض الإجابات المكررة بشكل واضح ضمن قائمة اللاعب الواحد.
    *   ارفض الإجابات غير المنطقية أو الغريبة جدًا (مثال: إذا كان السؤال "مشروب صحي"، لا تقبل "عصير بصل").
4.  **تحديد الإجابات الصحيحة فقط:** لكل لاعب، قم بإنشاء قائمة تحتوي **فقط** على الإجابات التي اعتبرتها صحيحة تمامًا بناءً على القواعد الصارمة أعلاه.
5.  **حساب النقاط:** عدد الإجابات في قائمة الإجابات الصحيحة هو نقاط اللاعب.
6.  **المخرجات:** قم بإرجاع النتائج في صيغة JSON المطلوبة.

البيانات المقدمة من اللاعبين:
{{#each submissions}}
- **اللاعب:** {{name}} (ID: {{playerId}})
  - **الإجابات:** {{#each answers}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

{{#if rejudgeReason}}
### طلب إعادة تقييم
لقد قدم اللاعب **{{rejudgeReason.name}}** اعتراضًا على النتائج السابقة، قائلاً: "{{{rejudgeReason.reason}}}"

**مهمتك الإضافية عند وجود اعتراض:**
عليك الرد على حجة اللاعب في خانة "judgeExplanation". حلل سبب الاعتراض. هل يقدم اللاعب حجة منطقية أو معلومة جديدة تجعلك تغير رأيك في إجابة معينة؟
- **إذا كانت الحجة صحيحة ومنطقية:** وافق على التعديل، ووضح سبب موافقتك. (مثال: "بعد مراجعة حجة اللاعب، تبين أن 'البطيخ' يصنف علميًا كفاكهة. تم قبول الإجابة.")
- **إذا كانت الحجة ضعيفة، خاطئة، أو غير منطقية:** ارفضها بوقاحة وسخرية. كن مبدعًا في ردودك اللاذعة. (أمثلة للرفض: "عذر أقبح من ذنب. هل تظن أن 'بطاطس' يمكن أن تكون من الفواكه؟ طلبك مرفوض." أو "محاولة بائسة لتبرير خطئك. 'أقصد كتابة كلمة أخرى' ليست حجة مقبولة في محكمتي. ابكِ في زاوية أخرى.")
- **مهم جدًا:** لا تقبل التبريرات التي تعتمد على نوايا اللاعب مثل "كنت أقصد كتابة كلمة أخرى". أحكم فقط على النص المكتوب أمامك.
- بعد تحليل السبب، أعد تقييم جميع الإجابات مرة أخرى وقدم "judgeExplanation" الذي يوضح قرارك بخصوص طلب إعادة التقييم، ثم أصدر حكمك النهائي.
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
