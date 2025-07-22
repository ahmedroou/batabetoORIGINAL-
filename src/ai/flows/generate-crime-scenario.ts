'use server';
/**
 * @fileOverview AI flow to generate a fictional crime scenario for the game.
 * - generateCrimeScenario - Generates the scenario.
 * - GenerateCrimeScenarioInput - The input type for the function.
 * - GenerateCrimeScenarioOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const GenerateCrimeScenarioInputSchema = z.object({});
export type GenerateCrimeScenarioInput = z.infer<typeof GenerateCrimeScenarioInputSchema>;

const GenerateCrimeScenarioOutputSchema = z.object({
  victimAlias: z.string().trim().min(1, {message: 'Victim alias cannot be empty.'}).describe("اسم الضحية الوهمية القابل للتصديق (مثال: 'عادل الفارسي', 'ليلى كرم')."),
  victimBackground: z.string().trim().min(1, {message: 'Victim background cannot be empty.'}).describe("خلفية موجزة من جملة واحدة عن الضحية تلمح إلى دوافع محتملة (مثال: 'مليونير غريب الأطوار معروف بصفقاته المشبوهة'، 'صحفية استقصائية عنيدة كانت على وشك فضح فضيحة')."),
  method: z.string().trim().min(1, {message: 'Method cannot be empty.'}).describe("وصف معقول وموجز لسبب الوفاة (مثال: 'التسمم بمادة نادرة'، 'طعنة واحدة متقنة'، 'حادث مدبر ليبدو طبيعياً')."),
  publicClue: z.string().trim().min(1, {message: 'Public clue cannot be empty.'}).describe("دليل قصير ومثير للاهتمام حول مسرح الجريمة سيراه المدنيون والشهود فقط (مثال: 'تم العثور على الضحية في مكتبته، والباب مغلق من الداخل')."),
  detailedClue: z.string().trim().min(1, {message: 'Detailed clue cannot be empty.'}).describe("دليل أكثر تفصيلاً لمسرح الجريمة، مرئي فقط للمحقق والقاتل الحقيقي، ويحتوي على تفاصيل أساسية للتحقيق (مثال: 'بجانب الجثة، يوجد كتاب مفتوح على صفحة تتحدث عن الخيانة. هناك أثر طين غريب على السجادة لا يتناسب مع أحذية الضحية')."),
});
export type GenerateCrimeScenarioOutput = z.infer<typeof GenerateCrimeScenarioOutputSchema>;

export async function generateCrimeScenario(
  input: GenerateCrimeScenarioInput
): Promise<GenerateCrimeScenarioOutput> {
  return generateCrimeScenarioFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCrimeScenarioPrompt',
  input: {schema: GenerateCrimeScenarioInputSchema},
  output: {schema: GenerateCrimeScenarioOutputSchema},
  prompt: `أنت روائي متخصص في قصص الجرائم والغموض. مهمتك هي إنشاء سيناريو جريمة قتل وهمي، يكون مقنعًا وواقعيًا ومثيرًا ليبدأ به اللاعبون لعبة "المحقق والقاتل".

قواعد إنشاء السيناريو:
1.  **الضحية:** ابتكر شخصية ضحية وهمية تمامًا باسم قابل للتصديق.
2.  **خلفية الضحية:** اكتب جملة واحدة فقط تصف خلفية الضحية وتلمح لدوافع قتل محتملة (مثل الأعداء، الديون، الأسرار).
3.  **طريقة القتل:** صف طريقة قتل واقعية ومبتكرة، تجنب الأساليب الكوميدية أو الخيالية. فكر في قصص التحقيق الكلاسيكية.
4.  **الدليل العام:** اكتب وصفًا موجزًا وغامضًا لمسرح الجريمة ليكون متاحًا للمدنيين والشهود فقط. يجب أن يثير الفضول دون كشف الكثير.
5.  **الدليل المفصل:** اكتب وصفًا أكثر تفصيلاً للمحقق والقاتل فقط. يجب أن يحتوي على تفاصيل دقيقة تفتح خطوط تحقيق جديدة، قد تكون مضللة أو مفيدة جدًا.

تأكد من أن جميع المخرجات باللغة العربية، وواقعية، ومناسبة للعبة تحقيق.
`,
});

const generateCrimeScenarioFlow = ai.defineFlow(
  {
    name: 'generateCrimeScenarioFlow',
    inputSchema: GenerateCrimeScenarioInputSchema,
    outputSchema: GenerateCrimeScenarioOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
