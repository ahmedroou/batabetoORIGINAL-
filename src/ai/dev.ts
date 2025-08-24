
'use server';

import { config } from 'dotenv';
config();

// AI flows are defined here.
// Example: import '@/ai/flows/example-flow.ts';
import '@/ai/flows/generate-genius-challenge.ts';
import '@/ai/flows/judge-prison-answers-flow.ts';
import '@/ai/flows/generate-news-article-flow.ts';

