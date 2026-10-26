import type { Card, CardType } from '../cards';
import type { CustomQuestion, Difficulty, Grade, PublicQuestion, Question, TopicId } from '../math/types';

export type BotLevel = 'easy' | 'medium' | 'hard';

export interface GameSettings {
  grade: Grade;
  topic: TopicId | 'mixed';
  difficulty: Difficulty | 'auto';
  /** Seconds per math problem, or 'auto' (by problem difficulty, 10–30 s). */
  timeLimit: number | 'auto';
  questionSource: 'generated' | 'mixed' | 'custom';
  customQuestions: CustomQuestion[];
  /** Classroom option: every action card needs a solved problem to take effect. */
  mathOnActions: boolean;
  /** Seconds a player has to act on their turn before an automatic draw. null = unlimited. */
  turnTimeLimit: number | null;
  /** Show the worked solution after each answer. */
  showExplanations: boolean;
}

export type PublicSettings = Omit<GameSettings, 'customQuestions'> & { customCount: number };

export interface PlayerStats {
  answered: number;
  correct: number;
  totalMs: number;
  score: number;
  survived: number;
}

export interface SeatInfo {
  id: string;
  name: string;
  avatar: number;
  isBot: boolean;
  botLevel?: BotLevel;
}

export interface PlayerState extends SeatInfo {
  hand: Card[];
  alive: boolean;
  /** Final place (1 = winner). Set on elimination / game end. */
  place?: number;
  stats: PlayerStats;
  connected: boolean;
}

export type MathPurpose = 'explode' | 'challenge' | 'double' | 'action';

export interface ActiveMath {
  question: Question;
  /** Who must answer. */
  playerId: string;
  purpose: MathPurpose;
  /** Whose card caused the problem (the current player). */
  sourceId: string;
  /** The explode card held aside, or the action card waiting for its effect. */
  card?: Card;
  targetId?: string;
  /** Answers are timed from here (gives clients time to animate). */
  startsAt: number;
  deadline: number;
  seconds: number;
}

export type Phase =
  | { kind: 'turn' }
  | { kind: 'math'; math: ActiveMath }
  | { kind: 'rescue'; playerId: string; card: Card; deadline: number }
  | { kind: 'insert'; playerId: string; card: Card; deadline: number }
  | { kind: 'double'; playerId: string; deadline: number }
  | { kind: 'over'; winnerId: string | null };

export type DoubleChoice = 'future' | 'steal' | 'skip';

export type EventBody =
  | { type: 'start'; firstId: string }
  | { type: 'turn'; playerId: string; turnsRemaining: number }
  | { type: 'play'; playerId: string; card: Card; targetId?: string }
  | { type: 'draw'; playerId: string; card: Card | null }
  | { type: 'explodeDrawn'; playerId: string }
  | { type: 'mathStart'; playerId: string; purpose: MathPurpose; sourceId: string }
  | {
      type: 'answer';
      playerId: string;
      purpose: MathPurpose;
      chosen: number | null;
      correct: boolean;
      answer: number;
      explanation: string;
      ms: number;
      points: number;
      question: PublicQuestion;
    }
  | { type: 'rescueUsed'; playerId: string }
  | { type: 'inserted'; playerId: string; position: number }
  | { type: 'eliminated'; playerId: string; place: number }
  | { type: 'future'; playerId: string; cards: Card[] }
  | { type: 'shuffle'; playerId: string }
  | { type: 'steal'; fromId: string; toId: string; card: Card | null; reason: 'steal' | 'challenge' }
  | { type: 'reverse'; playerId: string; direction: 1 | -1 }
  | { type: 'attack'; playerId: string; targetId: string; turns: number }
  | { type: 'skip'; playerId: string }
  | { type: 'doubleChoice'; playerId: string; choice: DoubleChoice }
  | { type: 'fizzle'; playerId: string; cardType: CardType }
  | { type: 'nothingToSteal'; fromId: string; toId: string }
  | { type: 'finalStage' }
  | { type: 'timeout'; playerId: string; what: 'turn' | 'math' | 'insert' | 'rescue' | 'double' }
  | { type: 'win'; playerId: string };

export type GameEvent = EventBody & { seq: number; at: number };
export type GameEventType = GameEvent['type'];

export interface AnswerRecord {
  playerId: string;
  name: string;
  topic: string;
  difficulty: Difficulty;
  purpose: MathPurpose;
  correct: boolean;
  timedOut: boolean;
  ms: number;
  at: number;
  text: string;
}

export interface BotMemory {
  /** Card types known at the top of the deck, in order. */
  top: CardType[];
}

export interface GameState {
  id: string;
  version: number;
  createdAt: number;
  settings: GameSettings;
  players: PlayerState[];
  current: number;
  direction: 1 | -1;
  turnsRemaining: number;
  turnNumber: number;
  turnDeadline: number | null;
  playsThisTurn: number;
  /** deck[0] is the top card. */
  deck: Card[];
  discard: Card[];
  phase: Phase;
  events: GameEvent[];
  seq: number;
  recentKeys: string[];
  finalStage: boolean;
  /** Each solved bomb in the final stage shortens the next bomb timer. */
  pressure: number;
  nextCardId: number;
  memory: Record<string, BotMemory>;
  answers: AnswerRecord[];
  winnerId: string | null;
  finishedAt: number | null;
}

export type GameAction =
  | { type: 'play'; playerId: string; cardId: string; targetId?: string }
  | { type: 'draw'; playerId: string }
  | { type: 'answer'; playerId: string; choice: number }
  | { type: 'useRescue'; playerId: string }
  | { type: 'insert'; playerId: string; position: number }
  | { type: 'doubleChoice'; playerId: string; choice: DoubleChoice; targetId?: string };

// ---- What a client is allowed to see ----

export interface PlayerView {
  id: string;
  name: string;
  avatar: number;
  isBot: boolean;
  alive: boolean;
  place?: number;
  handCount: number;
  connected: boolean;
  stats: PlayerStats;
}

export type PhaseView =
  | { kind: 'turn' }
  | {
      kind: 'math';
      playerId: string;
      purpose: MathPurpose;
      sourceId: string;
      targetId?: string;
      cardType?: CardType;
      question: PublicQuestion;
      startsAt: number;
      deadline: number;
      seconds: number;
    }
  | { kind: 'rescue'; playerId: string; deadline: number }
  | { kind: 'insert'; playerId: string; deadline: number }
  | { kind: 'double'; playerId: string; deadline: number }
  | { kind: 'over'; winnerId: string | null };

export interface GameView {
  gameId: string;
  version: number;
  /** The viewer's player id, or null for a spectator (teacher). */
  you: string | null;
  players: PlayerView[];
  hand: Card[];
  currentId: string;
  direction: 1 | -1;
  turnsRemaining: number;
  turnNumber: number;
  turnDeadline: number | null;
  deckCount: number;
  explodesInDeck: number;
  discardTop: Card[];
  discardCount: number;
  phase: PhaseView;
  settings: PublicSettings;
  events: GameEvent[];
  finalStage: boolean;
  pressure: number;
  winnerId: string | null;
  /** Clock of whoever produced this view; deadlines are on this clock. */
  now: number;
}
