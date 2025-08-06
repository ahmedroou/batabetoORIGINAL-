

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


export async function judgePrisonAnswers({ input, useProModel = false }: { input: JudgePrisonAnswersInput, useProModel?: boolean }): Promise<JudgePrisonAnswersOutput> {
  return judgePrisonAnswersFlow({ input, useProModel });
}


const prompt = ai.definePrompt({
  name: 'judgePrisonAnswersPrompt',
  input: { schema: JudgePrisonAnswersInputSchema },
  output: { schema: JudgePrisonAnswersOutputSchema },
  // Default model is Flash for speed. The flow can override this.
  model: 'googleai/gemini-1.5-flash-latest', 
  prompt: `أنت حكم آلي فائق الدقة وموسوعي، ومهمتك هي تقييم إجابات اللاعبين على سؤال معين. يجب أن تكون صارمًا ومنطقيًا للغاية في حكمك.

القواعد الأساسية للحكم:
1.  **فهم السؤال بعمق:** حلل السؤال جيدًا: "{{{question}}}".
2.  **التدقيق والبحث قبل الحكم (مهم جدًا):** قبل قبول أي إجابة، استخدم معرفتك الموسوعية للتأكد من أنها صحيحة 100% وتنتمي للفئة المطلوبة. لا تقبل الإجابات التي تبدو صحيحة ظاهريًا دون التأكد من دقتها.
3.  **تقييم الإجابات بدقة شديدة:** لكل لاعب، راجع قائمة إجاباته.
4.  **تطبيق قواعد الرفض الصارمة:**
    *   **كن صارمًا جدًا.** لا تقبل الإجابات التي تبدو صحيحة ولكنها ليست ضمن الفئة المطلوبة بدقة (مثال: إذا كان السؤال "فواكه"، فإن "بطاطس" إجابة خاطئة تمامًا).
    *   ارفض الإجابات الغامضة أو العامة جدًا التي لا تجيب على السؤال بشكل مباشر (مثال: إذا كان السؤال "عواصم أوروبية"، فإن إجابة "دولة" مرفوضة).
    *   اقبل الأخطاء الإملائية البسيطة جدًا التي لا تغير المعنى (مثل "تفاح" و "تفاحة"). لكن ارفض الأخطاء الإملائية الكبيرة التي تغير الكلمة أو تجعلها غير مفهومة.
    *   تقبل الإجابات باللغة العربية أو الإنجليزية طالما أنها صحيحة 100% ومنطقية في سياق السؤال.
    *   ارفض الإجابات المكررة بشكل واضح ضمن قائمة اللاعب الواحد.
    *   ارفض الإجابات غير المنطقية أو الغريبة جدًا (مثال: إذا كان السؤال "مشروب صحي"، لا تقبل "عصير بصل").
5.  **تحديد الإجابات الصحيحة فقط:** لكل لاعب، قم بإنشاء قائمة تحتوي **فقط** على الإجابات التي اعتبرتها صحيحة تمامًا بناءً على القواعد الصارمة أعلاه.
6.  **حساب النقاط:** عدد الإجابات في قائمة الإجابات الصحيحة هو نقاط اللاعب.
7.  **المخرجات:** قم بإرجاع النتائج في صيغة JSON المطلوبة.

البيانات المقدمة من اللاعبين:
{{#each submissions}}
- **اللاعب:** {{name}} (ID: {{playerId}})
  - **الإجابات:** {{#each answers}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

{{#if rejudgeReason}}
### طلب إعادة تقييم
لقد قدم اللاعب **{{rejudgeReason.name}}** اعتراضًا على النتائج السابقة، قائلاً: "{{{rejudgeReason.reason}}}"

**مهمتك الإضافية عند وجود اعتراض (مهم جدًا):**
عليك الرد على حجة اللاعب في خانة "judgeExplanation". حلل سبب الاعتراض. **انتبه جيداً، قد يكون الاعتراض على إجابة لاعب آخر وليس بالضرورة على إجابات اللاعب المعترض نفسه.**

- **إذا كانت الحجة صحيحة ومنطقية:**
    1.  وافق على التعديل، ووضح سبب موافقتك بشكل دقيق. (مثال: "بعد مراجعة حجة اللاعب، تبين أن إجابة 'بطيخ' التي قدمها اللاعب 'فلان' هي بالفعل من الفواكه. تم قبول الإجابة.").
    2.  **الأهم:** قم بتعديل بيانات اللاعب الذي تنطبق عليه الحجة. **يجب عليك إضافة الإجابة المقبولة إلى قائمة 'correctAnswers' الخاصة به وزيادة قيمة 'score' بمقدار واحد.**
    3.  **لا تغير أيًا من نتائج اللاعبين الآخرين الذين لا علاقة لهم بالاعتراض.**
    4.  أعد إصدار الحكم النهائي مع التعديل المطلوب.

- **إذا كانت الحجة ضعيفة، خاطئة، أو غير منطقية:**
    1.  ارفضها بوقاحة وسخرية. كن مبدعًا في ردودك اللاذعة. (أمثلة للرفض: "عذر أقبح من ذنب. هل تظن أن 'بطاطس' يمكن أن تكون من الفواكه؟ طلبك مرفوض." أو "محاولة بائسة لتبرير خطأ خصمك. ابكِ في زاوية أخرى.").
    2.  **الأهم:** **أبقِ على جميع النتائج الأصلية كما هي دون أي تغيير على الإطلاق.**
    3.  **في هذه الحالة، اضبط قيمة 'isRejectionJustified' إلى 'true'**.

- **مهم جدًا:** لا تقبل التبريرات التي تعتمد على نوايا اللاعب مثل "كنت أقصد كتابة كلمة أخرى". أحكم فقط على النص المكتوب أمامك. قرارك يجب أن يكون متسقًا تمامًا مع شرحك.
{{/if}}

مهمتك الآن هي تطبيق هذه القواعد الصارمة على البيانات المقدمة وإرجاع النتيجة النهائية.`
});

const judgePrisonAnswersFlow = ai.defineFlow(
  {
    name: 'judgePrisonAnswersFlow',
    inputSchema: z.object({ input: JudgePrisonAnswersInputSchema, useProModel: z.boolean().optional() }),
    outputSchema: JudgePrisonAnswersOutputSchema,
  },
  async ({ input, useProModel }) => {
    
    const modelToUse = useProModel ? 'googleai/gemini-1.5-pro-latest' : prompt.model;
    
    try {
        const { output } = await ai.generate({
            model: modelToUse,
            prompt: prompt.prompt,
            input: input,
            config: {
                output: {
                    format: 'json',
                    schema: JudgePrisonAnswersOutputSchema,
                },
            },
        });
        
        if (output) {
            return output;
        }

        // Fallback response if the model returns nothing
        throw new Error("AI judge returned an empty response.");
    } catch (error) {
        console.error("AI Judging Flow Error:", error);
        // Fallback response on any error
        return {
            results: input.submissions.map(s => ({
                playerId: s.playerId,
                name: s.name,
                correctAnswers: [],
                score: 0,
            })),
            judgeExplanation: `حدث خطأ فادح أثناء محاولة الحكم. تم إعطاء صفر للجميع. الخطأ: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
  }
);
