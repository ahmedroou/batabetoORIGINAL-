
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
    gridSize: z.number().describe("The size of the grid, which must be 8."),
    path: z.array(z.object({ x: z.number().int(), y: z.number().int() })).describe("An array of {x, y} coordinates representing the correct path from start (0,0) to end (7,7)."),
});


// Schema for Smart Grid Puzzle
const SmartGridPuzzleSchema = z.object({
    grid: z.array(z.array(z.number().nullable())).describe("A 2D array representing the grid. Some cells are null and need to be filled."),
    gridSize: z.number().describe("The size of the grid (e.g., 4 for a 4x4 grid)."),
    hint: z.string().describe("A hint describing the pattern or rule of the grid."),
    solution: z.array(z.array(z.number())).describe("The fully solved grid."),
});

const HiddenMazePuzzleSchema = z.object({
    gridSize: z.number().int().describe("The size of the square grid (e.g., 8 for an 8x8 grid)."),
    start: z.object({ x: z.number(), y: z.number() }).describe("The starting coordinates {x, y}."),
    end: z.object({ x: z.number(), y: z.number() }).describe("The ending coordinates {x, y}."),
    path: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates representing the correct path from start to end."),
    walls: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates representing the walls or barriers in the maze."),
    initialHints: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates for path tiles to be revealed at the start."),
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
    prompt: `You are an expert level designer for puzzle games. Your task is to create a memory puzzle for the "Path of Survival" challenge.

Generate a valid path on an 8x8 grid.
Path Generation Rules:
1.  **Grid Size:** The grid size must be fixed at 8x8. The gridSize output must be 8.
2.  **Start and End:** The path must start at the top-left corner (x=0, y=0) and end at the bottom-right corner (x=7, y=7).
3.  **Path Movement:** The path can only move one step at a time (horizontally or vertically). Diagonal movement is not allowed.
4.  **No Overlapping:** The path cannot cross itself or pass through the same cell twice.
5.  **Path Length:** The path must be reasonably long and complex. Avoid overly straight paths.
6.  **Algorithm:** Use a randomized depth-first search (DFS) algorithm to ensure a single, valid, connected path is generated.
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

// Helper function to generate a random code
const generateRandomCode = (): string[] => {
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    // Fisher-Yates shuffle
    for (let i = digits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.slice(0, 5);
};

function generateHiddenMazePuzzle(gridSize: number, numHints: number): z.infer<typeof HiddenMazePuzzleSchema> {
    const grid: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(true)); // true = wall
    const visited: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));

    const start = { x: 0, y: Math.floor(Math.random() * gridSize) };
    grid[start.y][start.x] = false;
    let current = start;
    const stack: { x: number; y: number }[] = [current];
    visited[current.y][current.x] = true;

    // Randomized DFS to create the maze path
    while (stack.length > 0) {
        current = stack.pop()!;
        const neighbors = [];
        const directions = [[0, -2], [0, 2], [-2, 0], [2, 0]];
        directions.sort(() => Math.random() - 0.5);

        for (const [dx, dy] of directions) {
            const nx = current.x + dx;
            const ny = current.y + dy;
            if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && !visited[ny][nx]) {
                neighbors.push({ nx, ny, wallX: current.x + dx / 2, wallY: current.y + dy / 2 });
            }
        }
        
        if (neighbors.length > 0) {
            stack.push(current);
            const { nx, ny, wallX, wallY } = neighbors[0];
            grid[wallY][wallX] = false;
            grid[ny][nx] = false;
            visited[ny][nx] = true;
            stack.push({ x: nx, y: ny });
        }
    }
    
    // Determine end point
    let end = { x: gridSize - 1, y: Math.floor(Math.random() * gridSize) };
    if (grid[end.y][end.x]) { // If end is a wall, find a non-wall on the last column
        for(let y = 0; y < gridSize; y++){
            if(!grid[y][gridSize-1]) {
                end = {x: gridSize-1, y};
                break;
            }
        }
    }


    // Find the single valid path from start to end using BFS
    const queue: { pos: { x: number, y: number }, path: { x: number, y: number }[] }[] = [{ pos: start, path: [start] }];
    const pathVisited: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));
    pathVisited[start.y][start.x] = true;
    let finalPath: { x: number; y: number }[] = [];

    while (queue.length > 0) {
        const { pos, path } = queue.shift()!;
        if (pos.x === end.x && pos.y === end.y) {
            finalPath = path;
            break;
        }

        const moves = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of moves) {
            const newX = pos.x + dx;
            const newY = pos.y + dy;

            if (newX >= 0 && newX < gridSize && newY >= 0 && newY < gridSize && !grid[newY][newX] && !pathVisited[newY][newX]) {
                pathVisited[newY][newX] = true;
                queue.push({ pos: { x: newX, y: newY }, path: [...path, { x: newX, y: newY }] });
            }
        }
    }

    const walls: { x: number; y: number }[] = [];
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            if (grid[y][x]) {
                walls.push({ x, y });
            }
        }
    }
    
    // Select random hints from the path, excluding start and end
    const hintablePath = finalPath.slice(1, -1);
    const shuffledHints = hintablePath.sort(() => 0.5 - Math.random());
    const initialHints = shuffledHints.slice(0, numHints);


    return {
        gridSize,
        start,
        end,
        path: finalPath,
        walls,
        initialHints
    };
}


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
            const puzzle = generateHiddenMazePuzzle(8, 5); // 8x8 grid, 5 initial hints
            return { puzzle };
        }
         case 'code_breaker': {
            const secretCode = generateRandomCode();
            return { puzzle: { secretCode } };
        }
        default:
            throw new Error(`Challenge generation for '${input.challengeId}' is not implemented.`);
    }
  }
);



