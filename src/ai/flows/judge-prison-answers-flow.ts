

'use server';
/**
 * @fileOverview An AI flow to act as a judge in the Prison game.
 * - judgePrisonAnswers - The function that judges player submissions.
 * - JudgePrisonAnswersInput - The input type for the function.
 * - JudgePrisonAnswersOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { 
    JudgePrisonAnswersInputSchema, 
    JudgePrisonAnswersOutputSchema, 
    type JudgePrisonAnswersInput, 
    type JudgePrisonAnswersOutput,
    JudgeSingleSubmissionInputSchema,
    JudgeSingleSubmissionOutputSchema,
    type JudgeSingleSubmissionInput
} from '@/types';


export async function judgePrisonAnswers(
    { input, useProModel = false }: { input: JudgePrisonAnswersInput, useProModel?: boolean }
): Promise<JudgePrisonAnswersOutput> {
  return judgePrisonAnswersFlow({ input, useProModel });
}


const singleSubmissionPrompt = ai.definePrompt({
    name: 'judgeSingleSubmissionPrompt',
    input: { schema: JudgeSingleSubmissionInputSchema },
    output: { schema: JudgeSingleSubmissionOutputSchema },
    model: 'googleai/gemini-1.5-flash-latest',
    prompt: `أنت حكم آلي صارم للغاية، ومهمتك هي تقييم إجابات لاعب واحد على سؤال معين. يجب أن تكون منطقيًا وقاسيًا ولا تقبل الأعذار.

القواعد الأساسية للحكم الصارم:
1.  **السؤال هو:** "{{{question}}}". افهم المطلوب بدقة متناهية.
2.  **إجابات اللاعب:** للاعب {{submission.name}} (ID: {{submission.playerId}})، راجع قائمة إجاباته: {{#each submission.answers}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}.
3.  **التدقيق بلا رحمة:**
    *   **ارفض أي إجابة مكررة تمامًا أو متشابهة جدًا.** (مثال: "تفاحة" و "تفاح" تعتبر مكررة).
    *   **ارفض أي إجابة لا تنتمي للفئة المطلوبة بدقة 100%.** لا يوجد تساهل. (مثال: إذا كان السؤال "أسماء أولاد"، فإن "خالد بن الوليد" إجابة خاطئة لأنها اسم مركب وليست اسمًا مفردًا).
    *   **ارفض الإجابات العامة جدًا.** (مثال: لو السؤال "ماركات سيارات"، إجابة "سيارة يابانية" مرفوضة).
    *   **ارفض الأخطاء الإملائية التي تغيّر المعنى أو تجعل الكلمة غريبة.** تساهل فقط مع أبسط الأخطاء التي لا لبس فيها.
4.  **النتيجة النهائية:**
    *   أنشئ قائمة **فقط** بالإجابات التي قبلتها تمامًا.
    *   عدد الإجابات في هذه القائمة هو نقاط اللاعب.
    *   **لا تضع أي شرح في خانة "evaluation".** أتركها فارغة.

مهمتك الآن هي تطبيق هذه القواعد الصارمة على إجابات هذا اللاعب وإرجاع النتيجة في صيغة JSON المطلوبة.
`
});


const rejudgePrompt = ai.definePrompt({
  name: 'rejudgePrompt',
  input: { schema: JudgePrisonAnswersInputSchema },
  output: { schema: JudgePrisonAnswersOutputSchema },
  model: 'googleai/gemini-1.5-flash-latest',
  prompt: `أنت حكم خبير ومحايد، طُلب منك إعادة تقييم حكم سابق بسبب اعتراض من أحد اللاعبين.

**السؤال الأصلي:** "{{{question}}}"

**الإجابات التي قدمها اللاعبون:**
{{#each submissions}}
- **اللاعب:** {{name}} (ID: {{playerId}})
  - **الإجابات:** {{#each answers}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

**سبب الاعتراض من اللاعب {{rejudgeReason.name}}:** "{{{rejudgeReason.reason}}}"

**مهمتك:**
1.  **حلل حجة اللاعب:** هل هي منطقية وصحيحة؟ هل تشير إلى خطأ حقيقي في التقييم الأصلي سواء له أو للاعب آخر؟
2.  **أعد تقييم جميع الإجابات** بناءً على القواعد الصارمة الأصلية (التصنيف الدقيق، الصحة الموسوعية، عدم التكرار) مع الأخذ في الاعتبار حجة اللاعب.
3.  **اكتب "judgeExplanation":** اشرح قرارك النهائي بوضوح.
    *   **إذا كانت الحجة صحيحة:** وافق على الاعتراض، ووضح لماذا كان صحيحًا وكيف أثر على النتائج. (مثال: "بعد مراجعة حجة اللاعب، تبين أن إجابة 'بطيخ' هي بالفعل من الفواكه. تم تعديل النتيجة.").
    *   **إذا كانت الحجة خاطئة أو غير منطقية:** ارفضها بلهجة ساخرة وحادة. (مثال: "محاولة يائسة. 'البطاطس' ستبقى من الخضروات مهما حاولت. طلبك مرفوض.").
4.  **اضبط "isRejectionJustified":** اجعلها 'true' **فقط** إذا رفضت حجة اللاعب.
5.  **أصدر الحكم النهائي (results):** قدم قائمة النتائج النهائية المحدثة لجميع اللاعبين بناءً على إعادة تقييمك. يجب أن تعكس النتائج التغييرات التي ذكرتها في شرحك.

أصدر حكمك النهائي بصيغة JSON.
`
});


const judgePrisonAnswersFlow = ai.defineFlow(
  {
    name: 'judgePrisonAnswersFlow',
    inputSchema: z.object({ input: JudgePrisonAnswersInputSchema, useProModel: z.boolean().optional() }),
    outputSchema: JudgePrisonAnswersOutputSchema,
  },
  async ({ input, useProModel }) => {
    
    try {
        // Handle re-judge requests with a separate, more capable prompt/model
        if (input.rejudgeReason) {
             const { output } = await rejudgePrompt(input);
             if (!output) throw new Error("AI re-judge failed to produce a result.");
             return output;
        }

        // Standard judging: process each submission individually for robustness
        const judgmentPromises = input.submissions.map(submission => {
            const singleInput: JudgeSingleSubmissionInput = {
                question: input.question,
                submission: submission
            };
            return singleSubmissionPrompt(singleInput);
        });

        const settledResults = await Promise.allSettled(judgmentPromises);
        
        const successfulJudgments = settledResults
            .filter(result => result.status === 'fulfilled')
            .map(result => (result as PromiseFulfilledResult<any>).value.output);

        if (successfulJudgments.length !== input.submissions.length) {
            console.warn("Some submissions failed to be judged.");
            // Optionally, handle partial failures here. For now, we proceed with successful ones.
        }

        return {
            results: successfulJudgments,
        };

    } catch (error) {
        console.error("AI Judging Flow Error:", error);
        // Fallback response on any catastrophic error
        return {
            results: input.submissions.map(s => ({
                playerId: s.playerId,
                name: s.name,
                correctAnswers: [],
                score: 0,
                evaluation: `حدث خطأ فادح أثناء محاولة الحكم على إجاباتك. الخطأ: ${error instanceof Error ? error.message : String(error)}`,
            })),
            judgeExplanation: `حدث خطأ فادح أثناء محاولة الحكم. تم إعطاء صفر للجميع.`,
        };
    }
  }
);
