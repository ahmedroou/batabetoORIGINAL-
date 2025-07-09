
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
  problems: z.array(SingleMathProblemSchema).length(5).describe('An array of 5 math problems with increasing difficulty.'),
});

// Schema for Path of Survival
const PathOfSurvivalPuzzleSchema = z.object({
    gridSize: z.number().describe("The size of the grid, e.g., 10 for a 10x10 grid."),
    path: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates representing the correct path from start to end."),
});

// Schema for Cipher Shift
const CipherPuzzleSchema = z.object({
  encryptedWord: z.string().describe('The final encrypted Arabic word.'),
  plainWord: z.string().describe('The original, unencrypted Arabic word.'),
  hint: z.string().describe('A clever hint about the type of cipher used, e.g., "أبجدية معكوسة" for Atbash, or "إزاحة قيصرية بسيطة" for Caesar.'),
});

const CipherPuzzleInputSchema = z.object({
  randomSeed: z.number().describe('A random number to ensure generation uniqueness.'),
});

// Schema for Visual Memory
const VisualMemoryImageSchema = z.object({
  id: z.string().describe("A unique identifier for this image, e.g., 'img_1'."),
  description: z.string().describe('A concise, one-or-two-word description of the image content in English for placeholder generation, e.g., "red car", "blue umbrella".'),
});

const VisualMemoryPuzzleSchema = z.object({
  images: z.array(VisualMemoryImageSchema).length(9).describe('An array of 9 unique image objects.'),
  prompt: z.string().describe("The user-facing prompt in Arabic, e.g., 'اختر كل الصور التي تحتوي على مظلة'."),
  correctImageIds: z.array(z.string()).describe("An array of the IDs of the images that are correct answers to the prompt."),
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
  prompt: `أنت خبير في تصميم ألغاز الرياضيات للعبة تنافسية. مهمتك هي إنشاء 5 مسائل حسابية صعبة وطويلة لتحدي "الحساب السريع".

القواعد:
1.  **الطول والتعقيد:** قم بتوليد مسائل حسابية طويلة تحتوي على 3 إلى 4 عمليات حسابية. يجب أن تكون المسائل معقدة بما فيه الكفاية لتكون تحديًا.
2.  **التنوع:** يجب أن تكون كل مسألة من المسائل الخمس فريدة ومختلفة تمامًا عن الأخرى في كل مرة يتم استدعاؤك فيها.
3.  **الأرقام:** استخدم أرقامًا تتكون من رقم واحد أو رقمين (بين 1 و 99).
4.  **العمليات:** استخدم عمليات الضرب والجمع والطرح والأقواس.
5.  **النتيجة:** تأكد من أن النتيجة النهائية دائمًا رقم موجب صحيح (لا كسور عشرية أو أرقام سالبة).

مثال للمخرجات المطلوبة:
{
  "problems": [
    { "problem": "15 * (4 + 2) - 10", "answer": 80 },
    { "problem": "99 - 8 * (2 + 7)", "answer": 27 },
    { "problem": "7 * (3 + 9) - 5 * 3", "answer": 69 },
    { "problem": "25 + 5 * 10 - 15", "answer": 60 },
    { "problem": "8 * 9 - (14 + 6)", "answer": 52 }
  ]
}

تأكد من أن المخرجات تحتوي على مفتاح "problems" وبداخله مصفوفة من 5 كائنات، كل كائن يحتوي على "problem" و "answer". تأكد من أن الجواب 'answer' صحيح حسابياً.
`,
});

const pathOfSurvivalPrompt = ai.definePrompt({
    name: 'generatePathOfSurvivalPrompt',
    input: { schema: z.object({}) },
    output: { schema: PathOfSurvivalPuzzleSchema },
    prompt: `أنت مصمم مستويات خبير في تصميم الألعاب. مهمتك هي إنشاء لغز ذاكرة صعب جداً لتحدي "مسار النجاة".

قم بإنشاء مسار صالح على شبكة بحجم 10x10.
قواعد إنشاء المسار:
1.  **Grid Size:** يجب أن يكون حجم الشبكة ثابتًا عند 10.
2.  **Start and End:** يجب أن يبدأ المسار من العمود الأيسر (x=0) وينتهي في العمود الأيمن (x=9). يمكن أن تكون نقطة البداية والنهاية في أي صف (y بين 0 و 9).
3.  **Path Movement:** يمكن للمسار التحرك خطوة واحدة فقط في كل مرة (أفقيًا، رأسيًا، أو قطريًا). لا يمكن للمسار أن يقفز.
4.  **No Overlapping:** لا يمكن للمسار أن يتقاطع مع نفسه أو يمر بنفس الخلية مرتين.
5.  **Complexity:** يجب أن يكون المسار طويلاً ومعقدًا بشكل معقول، بطول يتراوح بين 12 و 15 خطوة.

مثال على المخرجات:
{
  "gridSize": 10,
  "path": [
    { "x": 0, "y": 2 },
    { "x": 1, "y": 3 },
    { "x": 2, "y": 4 },
    { "x": 3, "y": 5 },
    { "x": 4, "y": 5 },
    { "x": 5, "y": 6 },
    { "x": 6, "y": 7 },
    { "x": 7, "y": 6 },
    { "x": 8, "y": 5 },
    { "x": 9, "y": 4 }
  ]
}
`,
});

const cipherPuzzlePrompt = ai.definePrompt({
  name: 'generateCipherPuzzlePrompt',
  input: { schema: CipherPuzzleInputSchema },
  output: { schema: CipherPuzzleSchema },
  prompt: `أنت مصمم ألغاز وخبير في علم التشفير للعبة تنافسية شديدة الصعوبة باللغة العربية. مهمتك هي إنشاء لغز تشفير صعب وعشوائي تمامًا في كل مرة. استخدم هذا الرقم العشوائي لضمان التفرد: {{randomSeed}}.

القواعد:
1.  **اختر كلمة:** قم بتوليد كلمة عربية شائعة ومناسبة تتكون من 4 إلى 7 أحرف. يجب أن تكون الكلمة مختلفة في كل مرة.
2.  **اختر تشفيراً:** اختر بشكل عشوائي **واحداً** من أنواع التشفير التالية:
    *   **تشفير قيصر (Caesar Cipher):** إزاحة كل حرف بمقدار ثابت (بين 1 و 3).
    *   **تشفير أتباش (Atbash Cipher):** عكس الأبجدية (أ يصبح ي، ب يصبح ش، إلخ).
    *   **التشفير العكسي (Reverse Cipher):** عكس ترتيب حروف الكلمة (مثال: "مرحبا" تصبح "ابحرم").
3.  **قم بالتشفير:** طبّق خوارزمية التشفير التي اخترتها على الكلمة.
4.  **اكتب تلميحاً:** قم بصياغة تلميح ذكي وقصير جداً حول نوع التشفير المستخدم. لا تكشف الإجابة، فقط وجّه اللاعب.

مثال على المخرجات:
{
  "encryptedWord": "طيور",
  "plainWord": "طيور",
  "hint": "لا يوجد تشفير هذه المرة!"
}
أو
{
  "encryptedWord": "غتور",
  "plainWord": "كنوز",
  "hint": "إزاحة قيصرية بسيطة."
}

تأكد من أن جميع المخرجات باللغة العربية، وأنها عشوائية ومختلفة في كل مرة يتم استدعاؤك فيها.
`,
});

const visualMemoryPuzzlePrompt = ai.definePrompt({
  name: 'generateVisualMemoryPuzzlePrompt',
  input: { schema: z.object({}) },
  output: { schema: VisualMemoryPuzzleSchema },
  prompt: `أنت مصمم ألعاب خبير متخصص في إنشاء تحديات ذاكرة بصرية صعبة جدًا للعبة تنافسية.

مهمتك هي إنشاء لغز لذاكرة صورية للعبة "ساحة العباقرة".

القواعد:
1.  **أنشئ 9 صور:** قم بتوليد 9 أوصاف صور فريدة ومختلفة تمامًا. يجب أن تكون الأوصاف باللغة الإنجليزية ومكونة من كلمة أو كلمتين (مثل "green tree", "fast car", "sad clown") لتستخدم في توليد الصور. أعطِ كل صورة معرفًا فريدًا (مثل 'img_1', 'img_2', ...).
2.  **اختر موضوعًا مشتركًا:** من بين الصور التسع، اختر بشكل عشوائي موضوعًا أو عنصرًا مشتركًا يظهر في عدد يتراوح بين 2 و 4 صور. على سبيل المثال، قد يكون الموضوع هو "حيوانات" أو "مركبات" أو "طعام".
3.  **تأكد من التفرد:** يجب أن تكون الصور التسعة فريدة، ولكن الصور المستهدفة تشترك في نفس الفئة التي اخترتها.
4.  **صياغة السؤال:** اكتب السؤال (prompt) باللغة العربية الذي سيُعرض للاعب، يطلب منه تحديد جميع الصور التي تنتمي إلى الموضوع المشترك الذي اخترته. مثال: "اختر كل الصور التي تحتوي على حيوانات".
5.  **حدد الإجابات الصحيحة:** قم بإرجاع قائمة بمعرفات (IDs) الصور الصحيحة التي تطابق السؤال.

مثال على المخرجات:
{
  "images": [
    { "id": "img_1", "description": "red car" },
    { "id": "img_2", "description": "green tree" },
    { "id": "img_3", "description": "sad clown" },
    { "id": "img_4", "description": "blue boat" },
    { "id": "img_5", "description": "yellow bus" },
    { "id": "img_6", "description": "happy sun" },
    { "id": "img_7", "description": "big truck" },
    { "id": "img_8", "description": "tall building" },
    { "id": "img_9", "description": "dark cloud" }
  ],
  "prompt": "اختر كل الصور التي تحتوي على مركبات.",
  "correctImageIds": ["img_1", "img_4", "img_5", "img_7"]
}

تأكد من أن المخرجات عشوائية ومتنوعة في كل مرة يتم استدعاؤك فيها.
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
            if (output?.problems) {
                for (const p of output.problems) {
                    try {
                        const sanitizedExpression = p.problem.replace(/[^-()\d/*+.]/g, '');
                        const calculatedAnswer = new Function('return ' + sanitizedExpression)();
                        p.answer = Math.round(calculatedAnswer);
                    } catch (e) {
                        console.error(`Error calculating math expression "${p.problem}":`, e);
                    }
                }
            }
            return { puzzle: output! };
        }
        case 'path_of_survival': {
            const { output } = await pathOfSurvivalPrompt({});
            return { puzzle: output! };
        }
        case 'cipher_shift': {
            const { output } = await cipherPuzzlePrompt({ randomSeed: Math.random() });
            return { puzzle: output! };
        }
        case 'visual_memory': {
            const { output } = await visualMemoryPuzzlePrompt({});
            return { puzzle: output! };
        }
        default:
            throw new Error(`Challenge generation for '${input.challengeId}' is not implemented.`);
    }
  }
);
