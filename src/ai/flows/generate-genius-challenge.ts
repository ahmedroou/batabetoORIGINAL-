
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
  gridSize: z.number().describe('The size of the grid, must be 8.'),
  path: z
    .array(z.object({ x: z.number().int(), y: z.number().int() }))
    .describe(
      'An array of {x, y} coordinates representing the correct path from start (0,0) to end (7,7).'
    ),
});


// Schema for Smart Grid Puzzle
const SmartGridPuzzleSchema = z.object({
    grid: z.array(z.array(z.number().nullable())).describe("A 2D array representing the grid. Some cells are null and need to be filled."),
    gridSize: z.number().describe("The size of the grid (e.g., 6 for a 6x6 grid)."),
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


const shuffleArray = <T>(array: T[]): T[] => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// Smart Grid Puzzle Generation Logic - Purely Algorithmic
function generateSmartGridPuzzle(): z.infer<typeof SmartGridPuzzleSchema> {
    const SIZE = 6;
    const MIN_HIDDEN_CELLS = 18;
    const MAX_ITERATIONS = 5000;
    const MAX_CELL_VALUE = 500;

    type PatternFn = (index: number, sequence: (number | null)[]) => number | null;

    const patterns: { [key: string]: { fn: PatternFn, isRecursive: boolean, description: string } } = {
        add: { fn: (i, seq) => (seq[i-1] ?? (Math.floor(Math.random() * 10) + 1)) + (Math.floor(Math.random() * 8) + 2), isRecursive: true, description: "Arithmetic (Add)" },
        subtract: { fn: (i, seq) => (seq[i-1] ?? (Math.floor(Math.random() * 10) + 10)) - (Math.floor(Math.random() * 8) + 2), isRecursive: true, description: "Arithmetic (Subtract)" },
        multiply: { fn: (i, seq) => (seq[i-1] ?? (Math.floor(Math.random() * 3) + 1)) * (Math.random() > 0.5 ? 2 : 3), isRecursive: true, description: "Geometric (Multiply)" },
        divide: { 
            fn: (i, seq) => {
                const divisor = Math.random() > 0.5 ? 2 : 3;
                const prev = seq[i-1];
                if (prev !== null && prev % divisor === 0 && prev !== 0) return prev / divisor;
                if (i === 0) return (Math.floor(Math.random() * 10) + 5) * divisor * divisor;
                return null;
            }, 
            isRecursive: true,
            description: "Geometric (Divide)" 
        },
        power_of_index: { fn: (i, seq) => Math.pow(i + 1, 2), isRecursive: false, description: "Power (Square of index)" },
        cube_of_index: { fn: (i, seq) => Math.pow(i + 1, 3), isRecursive: false, description: "Power (Cube of index)" },
        fibonacci: { fn: (i, seq) => i > 1 ? (seq[i-1] ?? 0) + (seq[i-2] ?? 0) : i + 1, isRecursive: true, description: "Fibonacci Sequence" },
        custom_linear: { fn: (i, seq) => (seq[i-1] ?? (Math.floor(Math.random() * 5))) * 2 + (Math.floor(Math.random() * 3) + 1), isRecursive: true, description: "Custom Linear (2x+c)" },
    };
    
    const patternKeys = Object.keys(patterns);

    for(let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let grid: (number | null)[][] = Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
        
        const rowPatternKeys = shuffleArray([...patternKeys]);
        const colPatternKeys = shuffleArray([...patternKeys]);
        
        const rowFns = Array(SIZE).fill(null).map((_, i) => patterns[rowPatternKeys[i % rowPatternKeys.length]]!.fn);
        const colFns = Array(SIZE).fill(null).map((_, i) => patterns[colPatternKeys[i % colPatternKeys.length]]!.fn);
        
        let isSolvable = true;
        
        // This loop attempts to fill the grid respecting both row and column patterns.
        // It iterates multiple times to allow propagation of values.
        for (let fill_iter = 0; fill_iter < SIZE * 2 && isSolvable; fill_iter++) {
            let changedInPass = false;
            for (let r = 0; r < SIZE; r++) {
                for (let c = 0; c < SIZE; c++) {
                    if (grid[r][c] !== null) continue;
                    
                    const rowSeq = grid[r];
                    const colSeq = grid.map(row => row[c]);

                    const fromRow = rowFns[r](c, rowSeq);
                    const fromCol = colFns[c](r, colSeq);
                    
                    let finalValue: number | null = null;
                    if (fromRow !== null && fromCol !== null) {
                         // If both patterns provide a value, check for consistency.
                        if (fromRow === fromCol) {
                            finalValue = fromRow;
                        } else {
                            // Conflict! This grid is not solvable with these patterns.
                            isSolvable = false;
                            break;
                        }
                    } else if (fromRow !== null) {
                        finalValue = fromRow;
                    } else if (fromCol !== null) {
                        finalValue = fromCol;
                    }
                    
                    if (finalValue !== null && Math.abs(finalValue) < MAX_CELL_VALUE && Number.isInteger(finalValue)) {
                        grid[r][c] = finalValue;
                        changedInPass = true;
                    }
                }
                if (!isSolvable) break;
            }
             if (!changedInPass && grid.some(r => r.some(c => c === null))) {
                // If no changes were made in a full pass and there are still nulls,
                // it's likely a dead end. Break and try a new set of patterns.
                isSolvable = false;
            }
        }
        
        const isFilled = isSolvable && grid.every(row => row.every(cell => cell !== null));
        
        if (isFilled) {
            const solution = grid.map(row => row.map(cell => cell!));
            let puzzleGrid = solution.map(row => [...row]);

            const cellsToHide: { r: number, c: number }[] = [];
            for (let r = 0; r < SIZE; r++) {
                for (let c = 0; c < SIZE; c++) {
                    cellsToHide.push({ r, c });
                }
            }
            
            shuffleArray(cellsToHide);
            
            for (let i = 0; i < MIN_HIDDEN_CELLS; i++) {
                const cell = cellsToHide[i];
                if (cell) {
                    (puzzleGrid[cell.r] as any)[cell.c] = null;
                }
            }
            
            return {
                grid: puzzleGrid,
                solution,
                hint: "كل صف وعمود يتبع نمطًا رياضيًا فريدًا. اكتشفه!",
                gridSize: SIZE,
            };
        }
    }
    
    // This is an emergency fallback, should ideally never be reached.
    // It signals that the main algorithm failed to produce a valid grid after many attempts.
    throw new Error("فشل توليد لغز الشبكة الذكية. الرجاء المحاولة مرة أخرى.");
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
            const puzzle = generateSmartGridPuzzle();
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

    


