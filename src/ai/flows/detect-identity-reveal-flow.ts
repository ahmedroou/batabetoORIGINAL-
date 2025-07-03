'use server';
/**
 * @fileOverview An AI flow to detect if a detective has revealed their identity in a chat message.
 * - detectIdentityReveal - The function that checks the message.
 * - DetectIdentityRevealInput - The input type for the function.
 * - DetectIdentityRevealOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectIdentityRevealInputSchema = z.object({
  message: z.string().describe('The chat message sent by the player.'),
  detectiveAlias: z.string().describe('The secret alias of the detective.'),
});
export type DetectIdentityRevealInput = z.infer<typeof DetectIdentityRevealInputSchema>;

const DetectIdentityRevealOutputSchema = z.object({
  isIdentityRevealed: z
    .boolean()
    .describe('Set to true if the message contains a clear and unambiguous reveal of the sender being the detective. Otherwise, set to false.'),
});
export type DetectIdentityRevealOutput = z.infer<typeof DetectIdentityRevealOutputSchema>;

export async function detectIdentityReveal(
  input: DetectIdentityRevealInput
): Promise<DetectIdentityRevealOutput> {
  return detectIdentityRevealFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectIdentityRevealPrompt',
  input: {schema: DetectIdentityRevealInputSchema},
  output: {schema: DetectIdentityRevealOutputSchema},
  prompt: `أنت حكم خبير في لعبة "المحقق والقاتل". مهمتك هي تحليل رسالة دردشة أرسلها لاعب قد يكون هو المحقق السري.

الاسم المستعار للمحقق هو: {{{detectiveAlias}}}

نص الرسالة لتحليلها:
"{{{message}}}"

القاعدة الحاسمة: إذا كشف المحقق عن هويته بشكل صريح أو شبه صريح، فإنه يخسر اللعبة فورًا.

مهمتك:
قرر ما إذا كانت الرسالة تحتوي على كشف واضح وصريح للهوية.
- **يعتبر كشفًا للهوية:** أي عبارة مباشرة مثل "أنا المحقق"، "دوري هو المحقق"، أو "القاتل لم يستهدفني لأني أنا المحقق".
- **يعتبر كشفًا للهوية:** تلميحات قوية جدًا لا يمكن تفسيرها إلا بأن المرسل هو المحقق، مثل "لدي صلاحية الاعتقال وسأستخدمها ضدك".
- **لا يعتبر كشفًا للهوية:** التخمين، التحليل، توجيه الاتهام، أو الادعاء الكاذب بأنه المحقق (لأن أي لاعب يمكنه فعل ذلك لخداع الآخرين). ركز فقط على الكشف الحقيقي.

اضبط قيمة 'isIdentityRevealed' إلى 'true' فقط إذا كان الكشف واضحًا ولا لبس فيه. في جميع الحالات الأخرى، اضبطها على 'false'. كن حذرًا جدًا، فالقرار خاطئ قد ينهي اللعبة بشكل غير عادل.
`,
});

const detectIdentityRevealFlow = ai.defineFlow(
  {
    name: 'detectIdentityRevealFlow',
    inputSchema: DetectIdentityRevealInputSchema,
    outputSchema: DetectIdentityRevealOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
