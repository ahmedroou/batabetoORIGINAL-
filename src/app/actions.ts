'use server';

import { generatePersonalizedQuestions } from '@/ai/flows/generate-personalized-questions';
import type { AiCategoryValue } from '@/data/questions';

export async function getAIQuestion(category: AiCategoryValue) {
  try {
    const result = await generatePersonalizedQuestions({ category });
    return { question: result.question };
  } catch (error) {
    console.error(error);
    return { error: 'Failed to generate question. Please try again.' };
  }
}
