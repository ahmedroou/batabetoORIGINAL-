// This file is intentionally blank. It will be populated with game-specific types.
export type GameState =
  | 'lobby'
  | 'team_selection'
  | 'challenge_intro'
  | 'challenge_active'
  | 'challenge_results'
  | 'final_results'
  | 'category-selection'
  | 'answer-submission'
  | 'guessing'
  | 'round-results'
  | 'final-results'
  | 'role_reveal'
  | 'night'
  | 'day'
  | 'voting'
  | 'execution'
  | 'preparation'
  | 'guide_turn'
  | 'guesser_turn'
  | 'board_reveal'
  | 'instructions'
  | 'open_auction'
  | 'closed_auction_bidding'
  | 'closed_auction_answering'
  | 'judging'
  | 'rejudging'
  | 'results'
  | 'rolling'
  | 'movement'
  | 'property_action'
  | 'question'
  | 'turn_end'
  | 'drawing'
  | 'trapping'
  | 'playing' // Added missing phase
  | 'kick_vote';
  
export type KingOfGeniusGameState = Extract<GameState, 'lobby' | 'team_selection' | 'challenge_intro' | 'challenge_active' | 'challenge_results' | 'final_results'>;
export type TrapAnswerGameState = Extract<GameState, 'lobby' | 'category-selection' | 'answer-submission' | 'guessing' | 'round-results' | 'final-results'>;
export type MafiaGameState = Extract<GameState, 'lobby' | 'role_reveal' | 'night' | 'day' | 'voting' | 'execution' | 'final_results'>;
export type WordWarGameState = Extract<GameState, 'lobby' | 'preparation' | 'guide_turn' | 'guesser_turn' | 'board_reveal' | 'final_results'>;
export type PrisonGameState = Extract<GameState, 'lobby' | 'instructions' | 'open_auction' | 'closed_auction_bidding' | 'closed_auction_answering' | 'judging' | 'rejudging' | 'results' | 'final_results'>;
export type EducatedMerchantGameState = Extract<GameState, 'lobby' | 'rolling' | 'movement' | 'property_action' | 'question' | 'turn_end' | 'final_results'>;
export type DrawAndDeceivePhase = Extract<GameState, 'lobby' | 'drawing' | 'trapping' | 'guessing' | 'results' | 'final_results' | 'kick_vote'>;
export type KingdomOfNamesPhase = Extract<GameState, 'lobby' | 'playing' | 'voting' | 'results' | 'final_results'>;