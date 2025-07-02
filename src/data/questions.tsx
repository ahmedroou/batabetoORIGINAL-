import { BrainCircuit, Gamepad2, Heart, Laugh, Users, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Category {
  name: string;
  icon: LucideIcon;
  description: string;
  questions: string[];
}

export const CATEGORIES: Category[] = [
  {
    name: 'Emotional & Deep',
    icon: Heart,
    description: 'Questions about feelings and significant life moments.',
    questions: [
      'What’s something that always makes you cry?',
      'What’s your biggest fear?',
      'What memory instantly makes you emotional?',
      'What’s something you regret deeply?',
      'What’s your biggest insecurity?',
      'What’s the kindest thing someone has ever done for you?',
      'What’s a secret dream you rarely talk about?',
      'Who do you trust the most in your life?',
      'What’s the worst heartbreak you’ve had?',
      'What would truly break your heart if you lost it?',
    ],
  },
  {
    name: 'Tastes & Preferences',
    icon: Utensils,
    description: 'Exploring your likes, dislikes, and culinary tastes.',
    questions: [
      'What’s your all-time favorite meal?',
      'What food do you absolutely hate?',
      'What’s your go-to fast food order?',
      'Sweet or salty – what do you crave more?',
      'What drink do you always order in cafés?',
      'What’s your guilty pleasure snack?',
      'What food reminds you of home?',
      'What’s a food you pretend to like but secretly don’t?',
      'What flavor of ice cream would describe you?',
      "What's one dish you could eat for the rest of your life?",
    ],
  },
  {
    name: 'Funny & Random',
    icon: Laugh,
    description: 'Lighthearted and quirky questions to spark laughter.',
    questions: [
      'What’s the dumbest thing you’ve ever done?',
      'If you were a cartoon character, who would you be?',
      'What’s your weirdest daily habit?',
      'What’s the silliest nickname you’ve ever had?',
      'What’s a weird fear you have?',
      'If your life was a movie, what would the title be?',
      'What’s a lie you tell all the time?',
      'If you had a useless superpower, what would it be?',
      'What’s the worst fashion decision you’ve made?',
      'What’s something that makes you laugh no matter what?',
    ],
  },
  {
    name: 'People & Friends',
    icon: Users,
    description: 'Questions about your relationships with others.',
    questions: [
      'Who’s the person you trust the most?',
      'Who would you call in the middle of the night?',
      'Who in your friend group makes you laugh the most?',
      'Who’s most likely to know all your secrets?',
      'Who have you had the biggest fight with?',
      'Who’s the most similar to you in the group?',
      'Who’s your comfort person?',
      'Who’s the person you admire secretly?',
      'Who’s the best listener in your life?',
      'If you had to pick someone to live with forever, who would it be?',
    ],
  },
  {
    name: 'Personal Choices & Identity',
    icon: BrainCircuit,
    description: 'Diving into your personality, values, and choices.',
    questions: [
      'Are you more of a thinker or a feeler?',
      'What’s your love language?',
      'What’s one thing people misunderstand about you?',
      'Are you more introvert or extrovert?',
      'What’s one value you can’t live without?',
      'What would you never forgive someone for?',
      'What’s the biggest lesson you learned last year?',
      'What do you like most about yourself?',
      'What habit are you trying to break?',
      'What’s something you wish people would ask you more often?',
    ],
  },
  {
    name: 'Game-Style & Guess-Friendly',
    icon: Gamepad2,
    description: 'Fun, guessable facts for friends who know you well.',
    questions: [
      'What song always cheers you up?',
      'What’s the app you use the most?',
      'What time do you usually go to sleep?',
      'Who’s your favorite fictional character?',
      'What was your favorite cartoon growing up?',
      'What’s the first thing you do when you wake up?',
      'What’s the weirdest thing in your room right now?',
      'What’s your dream job (secret or obvious)?',
      'What item do you carry with you everywhere?',
      'What’s your hidden talent?',
    ],
  },
];

export const AI_CATEGORIES = [
  { name: 'Emotion', value: 'emotion' },
  { name: 'Food', value: 'food' },
  { name: 'Habit', value: 'habit' },
  { name: 'Personality', value: 'personality' },
] as const;

export type AiCategoryValue = typeof AI_CATEGORIES[number]['value'];
