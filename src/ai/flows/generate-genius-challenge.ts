
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
import { getVisualMemoryImages, type VisualMemoryAssets } from '@/lib/actions/admin';

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

// Schema for Visual Memory (Admin-defined)
const VisualMemoryPuzzleSchema = z.object({
  grid: z.array(z.object({ id: z.string(), fruitType: z.string() })).length(25),
  imageUrls: z.record(z.string()),
  prompt: z.string(),
  correctFruitTypes: z.array(z.string()),
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

const generateVisualMemoryPuzzle = async (): Promise<z.infer<typeof VisualMemoryPuzzleSchema>> => {
    const result = await getVisualMemoryImages();
    if (!result.success || !result.images) {
        throw new Error("لم يتم العثور على صور لعبة الذاكرة الصورية. الرجاء الطلب من الأدمن رفعها من لوحة التحكم.");
    }
    const imageUrls = result.images;
    const fruitTypes = Object.keys(imageUrls);

    // 1. Create the 5x5 grid
    const grid: { id: string, fruitType: string }[] = [];
    for (let i = 0; i < 25; i++) {
        grid.push({
            id: `tile_${i}`,
            fruitType: fruitTypes[Math.floor(Math.random() * fruitTypes.length)]
        });
    }

    // 2. Decide on target fruit(s) - 1 or 2
    const shuffledFruits = [...fruitTypes].sort(() => 0.5 - Math.random());
    const targetCount = Math.random() > 0.6 ? 2 : 1;
    const correctFruitTypes = shuffledFruits.slice(0, targetCount);

    // Ensure at least one target fruit is on the grid
    const gridFruits = new Set(grid.map(t => t.fruitType));
    const hasTarget = correctFruitTypes.some(type => gridFruits.has(type));
    if (!hasTarget) {
        grid[Math.floor(Math.random() * 25)].fruitType = correctFruitTypes[0];
    }

    // 3. Generate the prompt
    const fruitNames: Record<string, string> = {
        apple: 'التفاح',
        mango: 'المانجا',
        watermelon: 'البطيخ',
        grapes: 'العنب'
    };
    const targetNames = correctFruitTypes.map(type => fruitNames[type]);
    const prompt = `اعثر على كل صور ${targetNames.join(' و ')}`;

    return {
        grid,
        imageUrls,
        prompt,
        correctFruitTypes
    };
};


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
        case 'visual_memory': {
            const puzzle = await generateVisualMemoryPuzzle();
            return { puzzle };
        }
        default:
            throw new Error(`Challenge generation for '${input.challengeId}' is not implemented.`);
    }
  }
);
