'use server';
/**
 * @fileOverview AI flow to generate a fictional crime scenario for the game.
 * - generateCrimeScenario - Generates the scenario.
 * - GenerateCrimeScenarioInput - The input type for the function.
 * - GenerateCrimeScenarioOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateCrimeScenarioInputSchema = z.object({
  playerAliases: z.array(z.string()).describe("A list of player aliases in the game."),
});
export type GenerateCrimeScenarioInput = z.infer<typeof GenerateCrimeScenarioInputSchema>;

const GenerateCrimeScenarioOutputSchema = z.object({
  victimAlias: z.string().describe("The alias of the player who was fictionally murdered."),
  method: z.string().describe("A creative and slightly humorous description of the murder method."),
  publicClue: z.string().describe("A short, vague clue about the crime scene that all players will see."),
  detailedClue: z.string().describe("A more detailed clue about the crime scene, visible only to the Detective and the real Killer."),
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
  prompt: `أنت كاتب سيناريو مبدع ومرح متخصص في ألعاب الغموض. مهمتك هي إنشاء سيناريو جريمة قتل وهمية ليبدأ بها اللاعبون لعبة "المحقق والقاتل".

أسماء اللاعبين المستعارة هي:
{{#each playerAliases}}
- {{{this}}}
{{/each}}

قواعد إنشاء السيناريو:
1.  اختر عشوائيًا "ضحية" من قائمة الأسماء المستعارة.
2.  ابتكر طريقة قتل "وهمية" تكون غريبة ومضحكة ومبتكرة (مثال: "قُتل بسبب جرعة زائدة من الضحك بعد سماع نكتة سيئة" أو "تم العثور عليه متجمدًا بعد أن ترك باب الثلاجة مفتوحًا").
3.  اكتب "دليل عام": وصف موجز جدًا وغامض لمسرح الجريمة يمكن للجميع رؤيته (مثال: "تم العثور على الضحية في المطبخ وبجانبه بقايا طعام غريبة").
4.  اكتب "دليل مفصل": وصف أكثر تفصيلاً للمحقق والقاتل فقط. يجب أن يحتوي على تفاصيل إضافية قد تكون مضللة أو مفيدة (مثال: "كانت الضحية ترتدي قبعة طاهٍ، وبجانبها رسالة مكتوبة بالكاتشب تقول 'الطباخ التالي هو أنت'. هناك ريشة ببغاء ملونة على الأرض.").

تأكد من أن جميع المخرجات باللغة العربية.
`,
});

const generateCrimeScenarioFlow = ai.defineFlow(
  {
    name: 'generateCrimeScenarioFlow',
    inputSchema: GenerateCrimeScenarioInputSchema,
    outputSchema: GenerateCrimeScenarioOutputSchema,
  },
  async input => {
    // Ensure there are players to select from
    if (input.playerAliases.length === 0) {
        throw new Error("Cannot generate a scenario without player aliases.");
    }
    const {output} = await prompt(input);
    return output!;
  }
);
