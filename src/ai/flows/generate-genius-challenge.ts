
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
    gridSize: z.number().describe("The size of the grid, e.g., 8 for an 8x8 grid."),
    path: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates representing the correct path from start to end."),
});

// Schema for Smart Grid Puzzle
const SmartGridPuzzleSchema = z.object({
    grid: z.array(z.array(z.number().nullable())).describe("A 2D array representing the grid. Some cells are null and need to be filled."),
    gridSize: z.number().describe("The size of the grid (e.g., 4 for a 4x4 grid)."),
    hint: z.string().describe("A hint describing the pattern or rule of the grid."),
    solution: z.array(z.array(z.number())).describe("The fully solved grid."),
});

const HiddenMazePuzzleSchema = z.object({
    gridSize: z.number().int().positive().describe("The size of the square grid (e.g., 8 for an 8x8 grid)."),
    start: z.object({ x: z.number(), y: z.number() }).describe("The starting coordinates {x, y}."),
    end: z.object({ x: z.number(), y: z.number() }).describe("The ending coordinates {x, y}."),
    path: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates representing the correct path from start to end."),
    walls: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates representing the walls or barriers in the maze."),
});

const CodeBreakerPuzzleSchema = z.object({
    secretCode: z.array(z.string()).length(5).describe('An array of 5 unique digit strings (e.g., ["1", "5", "0", "8", "3"]).'),
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
    prompt: `أنت مصمم مستويات خبير في تصميم الألعاب. مهمتك هي إنشاء لغز ذاكرة لتحدي "مسار النجاة".

قم بإنشاء مسار صالح على شبكة بحجم 8x8.
قواعد إنشاء المسار:
1.  **Grid Size:** يجب أن يكون حجم الشبكة ثابتًا عند 8.
2.  **Start and End:** يجب أن يبدأ المسار من الزاوية العلوية اليسرى (x=0, y=0) وينتهي في الزاوية السفلية اليمنى (x=7, y=7).
3.  **Path Movement:** يمكن للمسار التحرك خطوة واحدة فقط في كل مرة (أفقيًا أو رأسيًا). لا يسمح بالحركة القطرية.
4.  **No Overlapping:** لا يمكن للمسار أن يتقاطع مع نفسه أو يمر بنفس الخلية مرتين.
5.  **Path Length:** يجب أن يكون طول المسار دائمًا 19 خطوة بالضبط.
6.  **Complexity:** يجب أن يكون المسار طويلاً ومعقدًا بشكل معقول. تجنب المسارات المستقيمة جدًا.
7.  **Algorithm:** استخدم خوارزمية بحث متعمق (DFS) عشوائية لضمان وجود مسار واحد صالح ومتصل.
`,
});

const smartGridPuzzlePrompt = ai.definePrompt({
  name: 'generateSmartGridPuzzlePrompt',
  input: { schema: z.object({}) },
  output: { schema: SmartGridPuzzleSchema },
  prompt: `أنت خبير في تصميم ألغاز الشبكات المنطقية والرياضية. مهمتك هي إنشاء لغز لتحدي "لغز الشبكة الذكية".

قواعد إنشاء اللغز:
1.  **حجم الشبكة:** قم بإنشاء شبكة بحجم 4x4.
2.  **نوع النمط:** اختر بشكل عشوائي أحد الأنماط التالية لتطبيقه على الشبكة:
    *   **مجموع الصفوف/الأعمدة:** يجب أن يكون مجموع الأرقام في كل صف وكل عمود متساويًا لنفس الرقم (مثال: كل صف وكل عمود مجموعه 34).
    *   **تسلسل حسابي:** الأرقام في الشبكة تتبع تسلسلًا حسابيًا بسيطًا عند قراءتها من اليسار إلى اليمين ومن الأعلى إلى الأسفل (مثال: كل رقم يزيد عن سابقه بـ 3).
3.  **الأرقام المستخدمة:** استخدم أرقامًا صحيحة بين 1 و 50.
4.  **إخفاء الأرقام:** بعد إنشاء الشبكة الكاملة (الحل)، قم بإخفاء 4 إلى 6 مربعات بشكل عشوائي (اجعل قيمتها \`null\`). تأكد من أن اللغز لا يزال قابلاً للحل.
5.  **التلميح:** اكتب تلميحًا واضحًا وموجزًا باللغة العربية يصف القاعدة المستخدمة (مثال: "مجموع كل صف وكل عمود هو 34"، أو "كل رقم في الشبكة يزيد عن الرقم السابق له بمقدار 3").

تأكد من أن المخرجات تحتوي على: \`grid\` (الشبكة مع المربعات المخفية)، \`gridSize\` (دائمًا 4)، \`hint\` (التلميح)، و \`solution\` (الشبكة الكاملة قبل إخفاء الأرقام).
`,
});

const hiddenMazePrompt = ai.definePrompt({
    name: 'generateHiddenMazePrompt',
    input: { schema: z.object({}) },
    output: { schema: HiddenMazePuzzleSchema },
    prompt: `أنت مصمم متاهات محترف. مهمتك هي إنشاء متاهة مربعة لتحدي "المتاهة المخفية".

قواعد إنشاء المتاهة:
1.  **حجم الشبكة:** يجب أن يكون حجم الشبكة دائمًا 8x8.
2.  **نقطة البداية والنهاية:** يجب أن تكون نقطة البداية عشوائية، ونقطة النهاية عشوائية، ولكن يجب أن تكونا مختلفتين.
3.  **المسار الصحيح:** يجب أن يكون هناك مسار واحد على الأقل صالح ومتصل من نقطة البداية إلى النهاية. يجب ألا يكون المسار تافهًا أو قصيرًا جدًا.
4.  **الجدران:** يجب أن تملأ بقية الشبكة بالجدران أو العوائق. يجب أن يكون عدد الجدران معقولاً لجعل المتاهة تحديًا، ولكن ليس مستحيل الحل.
5.  **الخوارزمية:** استخدم خوارزمية توليد متاهات موثوقة (مثل Randomized Depth-First Search أو Randomized Kruskal's Algorithm) لضمان وجود مسار صالح وأن المتاهة متصلة.
6.  **المخرجات:** يجب أن توفر إحداثيات كل من البداية، النهاية، قائمة بإحداثيات المسار الصحيح، وقائمة بإحداثيات الجدران.`,
});

const codeBreakerPrompt = ai.definePrompt({
    name: 'generateCodeBreakerPrompt',
    input: { schema: z.object({}) },
    output: { schema: CodeBreakerPuzzleSchema },
    prompt: `أنت خبير في تصميم ألغاز الشيفرات. مهمتك هي إنشاء لغز لتحدي "كسر الشيفرة".

قواعد إنشاء الشيفرة:
1.  **طول الشيفرة:** يجب أن تتكون الشيفرة من 5 أرقام.
2.  **أرقام فريدة:** يجب أن تكون جميع الأرقام الخمسة في الشيفرة فريدة من نوعها (لا تكرار).
3.  **الأرقام المستخدمة:** استخدم الأرقام من 0 إلى 9.
4.  **المخرجات:** يجب أن تكون المخرجات عبارة عن كائن يحتوي على مفتاح "secretCode"، وقيمته عبارة عن مصفوفة من 5 سلاسل نصية (string)، كل سلسلة نصية تمثل رقمًا في الشيفرة.

مثال للمخرجات المطلوبة:
{
  "secretCode": ["1", "5", "0", "8", "3"]
}
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
        case 'quick_math': {
            const { output } = await mathPuzzlePrompt({});
            if (output?.problems) {
                for (const p of output.problems) {
                    try {
                        const sanitizedExpression = p.problem.replace(/[^-()\d/*+.]/g, '');
                        // Using Function constructor for safe evaluation on server
                        const calculatedAnswer = new Function('return ' + sanitizedExpression)();
                        p.answer = Math.round(calculatedAnswer);
                    } catch (e) {
                        console.error(`Error calculating math expression "${p.problem}":`, e);
                        // Fallback or error handling
                    }
                }
            }
            return { puzzle: output! };
        }
        case 'path_of_survival': {
            const { output } = await pathOfSurvivalPrompt({});
            return { puzzle: output! };
        }
        case 'smart_grid_puzzle': {
            const { output } = await smartGridPuzzlePrompt({});
            return { puzzle: output! };
        }
        case 'hidden_maze': {
            const { output } = await hiddenMazePrompt({});
            return { puzzle: output! };
        }
         case 'code_breaker': {
            const { output } = await codeBreakerPrompt({});
            return { puzzle: output! };
        }
        default:
            throw new Error(`Challenge generation for '${input.challengeId}' is not implemented.`);
    }
  }
);
