
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
import type { SmartGridPuzzleData, PathTile } from '@/types'; // تأكد من استيراد PathTile

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

const SmartGridPuzzleSchema = z.object({
    columns: z.array(z.object({
        cells: z.array(z.number().nullable()),
        pattern: z.string(),
        solution: z.array(z.number()),
    })),
});

const PathOfSurvivalPuzzleSchema = z.object({
    gridSize: z.number().int().describe("The size of the square grid (e.g., 7 for a 7x7 grid)."),
    start: z.object({ x: z.number(), y: z.number() }).describe("The starting coordinates {x, y}."),
    end: z.object({ x: z.number(), y: z.number() }).describe("The ending coordinates {x, y}."),
    path: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates representing the correct path from start to end."),
});


const HiddenMazePuzzleSchema = z.object({
    gridSize: z.number().int().describe("The size of the square grid (e.g., 8 for an 8x8 grid)."),
    start: z.object({ x: z.number(), y: z.number() }).describe("The starting coordinates {x, y}."),
    end: z.object({ x: z.number(), y: z.number() }).describe("The ending coordinates {x, y}."),
    path: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates representing the correct path from start to end."),
    walls: z.array(z.object({ x: z.number(), y: z.number() })).describe("An array of {x, y} coordinates for the walls or barriers in the maze."),
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


// Procedural generation for Path of Survival
function generateSurvivalPath(gridSize: number): z.infer<typeof PathOfSurvivalPuzzleSchema> {
    const TARGET_PATH_LENGTH = 16; // الطول المستهدف للمسار (تم التعديل إلى 16)
    const PATH_LENGTH_TOLERANCE = 2; // التسامح في الطول (مثلاً، 16 +/- 2 = 14 إلى 18)
    const MAX_ATTEMPTS = 100; // الحد الأقصى لمحاولات التوليد

    let attempts = 0;
    let generatedPath: PathTile[] = [];
    let startPos: PathTile;
    let endPos: PathTile;

    while (attempts < MAX_ATTEMPTS) {
        // إعادة تعيين المتغيرات لكل محاولة
        startPos = { x: gridSize - 1, y: 0 }; // Top-right corner
        endPos = { x: 0, y: gridSize - 1 };   // Bottom-left corner
        const visited: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));
        let currentPath: PathTile[] = [];

        function isValid(x: number, y: number) {
            return x >= 0 && x < gridSize && y >= 0 && y < gridSize;
        }

        // Recursive DFS function to find a winding path
        function findPathDFS(current: PathTile, pathSoFar: PathTile[]): boolean {
            if (current.x === endPos.x && current.y === endPos.y) {
                currentPath = pathSoFar;
                return true;
            }

            visited[current.y][current.x] = true;

            const moves = [[0, 1], [0, -1], [1, 0], [-1, 0]]; 
            moves.sort(() => Math.random() - 0.5); 

            for (const [dx, dy] of moves) {
                const newX = current.x + dx;
                const newY = current.y + dy;
                const nextPos = { x: newX, y: newY };

                if (isValid(newX, newY) && !visited[newY][newX]) {
                    if (findPathDFS(nextPos, [...pathSoFar, nextPos])) {
                        return true;
                    }
                }
            }
            return false;
        }

        // محاولة توليد المسار
        if (findPathDFS(startPos, [startPos])) {
            // التحقق من طول المسار
            if (currentPath.length >= TARGET_PATH_LENGTH - PATH_LENGTH_TOLERANCE &&
                currentPath.length <= TARGET_PATH_LENGTH + PATH_LENGTH_TOLERANCE) {
                generatedPath = currentPath;
                break; // تم العثور على مسار بالطول المطلوب
            }
        }
        attempts++;
    }

    // إذا لم يتم العثور على مسار بالطول المطلوب بعد عدة محاولات، استخدم المسار الأخير الذي تم توليده
    // أو مسار احتياطي بسيط
    if (generatedPath.length === 0) {
        console.warn(`Failed to generate a path of length around ${TARGET_PATH_LENGTH} after ${MAX_ATTEMPTS} attempts. Using a fallback path.`);
        // Fallback: create a simple L-shaped path
        generatedPath = [];
        startPos = { x: gridSize - 1, y: 0 };
        endPos = { x: 0, y: gridSize - 1 };
        for(let y = 0; y < gridSize; y++) generatedPath.push({x: gridSize-1, y});
        for(let x = gridSize-2; x >=0; x--) generatedPath.push({x, y: gridSize-1});
    }

    return { gridSize, start: startPos, end: endPos, path: generatedPath };
}


// Robust Maze Generation using Randomized DFS and BFS for pathfinding
function generateHiddenMazePuzzle(gridSize: number, numHints: number): z.infer<typeof HiddenMazePuzzleSchema> {
    const grid: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(true)); // true = wall
    const visited: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));

    // Start carving the maze from a random point
    const startX = Math.floor(Math.random() * (gridSize / 2)) * 2;
    const startY = Math.floor(Math.random() * (gridSize / 2)) * 2;
    const stack: PathTile[] = [{ x: startX, y: startY }];
    grid[startY][startX] = false;
    visited[startY][startX] = true;

    // Randomized Depth-First Search to create paths
    while (stack.length > 0) {
        const current = stack[stack.length - 1]!;
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
            const { nx, ny, wallX, wallY } = neighbors[0]!;
            grid[wallY][wallX] = false;
            grid[ny][nx] = false;
            visited[ny][nx] = true;
            stack.push({ x: nx, y: ny });
        } else {
            stack.pop();
        }
    }

    // Define start and end points
    const start = { x: 0, y: 0 };
    let end = { x: gridSize - 1, y: gridSize - 1 };

    // Ensure start and end are not walls
    grid[start.y][start.x] = false; 
    if (grid[end.y][end.x]) {
       grid[end.y][end.x] = false;
       // Also clear a path to it if needed
       if (end.x > 0 && grid[end.y][end.x-1]) grid[end.y][end.x-1] = false;
       else if (end.y > 0 && grid[end.y-1][end.x]) grid[end.y-1][end.x] = false;
    }


    // Find the single valid path from start to end using BFS (guarantees shortest path)
    const queue: { pos: PathTile; path: PathTile[] }[] = [{ pos: start, path: [start] }];
    const pathVisited: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));
    pathVisited[start.y][start.x] = true;
    let finalPath: PathTile[] = [];

    while (queue.length > 0) {
        const { pos, path } = queue.shift()!;
        if (pos.x === end.x && pos.y === end.y) {
            finalPath = path;
            break;
        }

        const moves = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        moves.sort(() => Math.random() - 0.5); // Randomize move order to vary the path slightly
        for (const [dx, dy] of moves) {
            const newX = pos.x + dx;
            const newY = pos.y + dy;

            if (newX >= 0 && newX < gridSize && newY >= 0 && newY < gridSize && !grid[newY][newX] && !pathVisited[newY][newX]) {
                pathVisited[newY][newX] = true;
                queue.push({ pos: { x: newX, y: newY }, path: [...path, { x: newX, y: newY }] });
            }
        }
    }

    // If BFS fails, it's a bug in generation, but we add a fallback
    if (finalPath.length === 0) {
        finalPath = [{x:0, y:0}, {x:1, y:0}, {x:2, y:0}]; // Simple fallback
    }


    const walls: PathTile[] = [];
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

const shuffleArray = <T>(array: T[]): T[] => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

type Pattern = {
  name: string;
  apply: (a: number, b: number, f1?: number, f2?: number) => number;
  isTwoStep: boolean;
  getHint: (factor1: number, factor2: number) => string;
};

// New procedural generation for the column-based Smart Grid
function generateColumnsOnlyPuzzle(): SmartGridPuzzleData {
    const NUM_COLUMNS = 5;
    const NUM_ROWS = 6;

    const patternPool: Pattern[] = [
        {
            name: 'ضرب',
            isTwoStep: false,
            apply: (a, _b, f1) => a * f1!,
            getHint: (f1) => `الضرب في ${f1}`,
        },
        {
            name: 'قسمة',
            isTwoStep: false,
            apply: (a, _b, f1) => a / f1!,
            getHint: (f1) => `القسمة على ${f1}`,
        },
        {
            name: 'علاقة مركبة',
            isTwoStep: false,
            apply: (a, _b, f1, f2) => a * f1! + f2!,
            getHint: (f1, f2) => `الضرب في ${f1} ثم إضافة ${f2}`,
        },
        {
            name: 'جمع السابقين',
            isTwoStep: true,
            apply: (a, b) => a + b,
            getHint: () => `جمع الرقمين السابقين`,
        },
        {
            name: 'طرح السابقين',
            isTwoStep: true,
            apply: (a, b) => b - a,
            getHint: () => `طرح الرقمين السابقين`,
        },
        {
            name: 'ضرب السابقين',
            isTwoStep: true,
            apply: (a, b) => a * b,
            getHint: () => `ضرب الرقمين السابقين`,
        },
    ];

    const columns: SmartGridPuzzleData['columns'] = [];
    const shuffledPatterns = shuffleArray([...patternPool]);

    for (let c = 0; c < NUM_COLUMNS; c++) {
        const pattern = shuffledPatterns[c % patternPool.length];
        const solution: number[] = new Array(NUM_ROWS).fill(0);
        let factor1 = 0;
        let factor2 = 0;

        // Generate base numbers and factors
        if (pattern.name === 'قسمة') {
            factor1 = Math.floor(Math.random() * 3) + 2; // 2, 3, 4
            solution[0] = (Math.floor(Math.random() * 5) + 2) * (factor1 ** 4);
        } else if (pattern.name === 'ضرب') {
            factor1 = Math.floor(Math.random() * 3) + 2; // 2, 3, 4
            solution[0] = Math.floor(Math.random() * 4) + 1; // 1 to 4
        } else if (pattern.name === 'علاقة مركبة') {
            factor1 = Math.floor(Math.random() * 4) + 2; // 2 to 5
            factor2 = Math.floor(Math.random() * 10) + 1; // 1 to 10
            solution[0] = Math.floor(Math.random() * 5) + 1; // 1 to 5
        } else { // Two-step patterns
            solution[0] = Math.floor(Math.random() * 5) + 1;
            solution[1] = Math.floor(Math.random() * 5) + 2;
        }
        
        // Generate the full solution column
        for (let r = (pattern.isTwoStep ? 2 : 1); r < NUM_ROWS; r++) {
            const prev1 = solution[r - 1];
            const prev2 = solution[r - 2];
            let value = pattern.apply(prev1, prev2, factor1, factor2);
            
            // Clamp values to prevent them from getting too large or small
            value = Math.max(-10000, Math.min(10000, Math.round(value)));

            // Ensure division results in whole numbers
            if(pattern.name === 'قسمة' && prev1 % factor1 !== 0) {
                // If not divisible, regenerate column. This is a simple guard.
                 return generateColumnsOnlyPuzzle(); 
            }
            solution[r] = value;
        }
        
        // Make two random cells null
        const cells = [...solution];
        const emptyIndices = new Set<number>();
        while(emptyIndices.size < 2) {
            const index = Math.floor(Math.random() * NUM_ROWS);
            emptyIndices.add(index);
        }
        emptyIndices.forEach(i => (cells[i] = null));

        columns.push({
            cells,
            solution,
            pattern: pattern.getHint(factor1, factor2),
        });
    }

    return { columns };
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
            const mathPrompt = ai.definePrompt({
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

                تأكد من أن المخرجات تحتوي على مفتاح "problems" وبداخله مصفوفة من 5 كائنات، كل كائن يحتوي على "problem" و "answer". تأكد من أن الجواب 'answer' صحيح حسابياً.
                `,
            });
            const { output } = await mathPrompt({});
            if (output?.problems) {
                for (const p of output.problems) {
                    try {
                        const sanitizedExpression = p.problem.replace(/[^-()\d/*+.]/g, '');
                        p.answer = Math.round(new Function('return ' + sanitizedExpression)());
                    } catch (e) {
                        console.error(`Error calculating math expression "${p.problem}":`, e);
                        p.answer = 0; // Fallback
                    }
                }
            }
            return { puzzle: output! };
        }
        case 'smart_grid_puzzle': {
            const puzzle = generateColumnsOnlyPuzzle();
            return { puzzle };
        }
        case 'path_of_survival': {
            const puzzle = generateSurvivalPath(7); // 7x7 grid
            return { puzzle };
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
