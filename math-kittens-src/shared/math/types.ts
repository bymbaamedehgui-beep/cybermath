// Shared math-question contract used by the engine, server and UI.

export type TopicId =
  | 'arithmetic'
  | 'fractions'
  | 'percent'
  | 'linear'
  | 'systems'
  | 'inequalities'
  | 'quadratic'
  | 'functions'
  | 'geometry'
  | 'trig'
  | 'probability';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Grade = 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Optional coordinate-plane picture rendered under the question. */
export interface GraphSpec {
  kind: 'line' | 'parabola' | 'points';
  /** line: y = m·x + b */
  m?: number;
  b?: number;
  /** parabola: y = a·(x − h)² + k */
  a?: number;
  h?: number;
  k?: number;
  /** highlighted points (also used by kind 'points') */
  points?: [number, number][];
  xRange?: [number, number];
  yRange?: [number, number];
}

export interface Question {
  id: string;
  /** Signature used to avoid repeating the same problem twice in a row. */
  key: string;
  topic: TopicId | 'custom';
  difficulty: Difficulty;
  grade: Grade;
  /** Prompt in Mongolian. May contain "\n". */
  text: string;
  /** Formula lines shown large (e.g. the two equations of a system). */
  lines?: string[];
  /** Draw a curly brace in front of `lines` (systems of equations). */
  system?: boolean;
  graph?: GraphSpec;
  choices: [string, string, string, string];
  /** Index of the single correct choice (0..3). Never sent to clients before answering. */
  answer: number;
  /** Short worked solution in Mongolian, revealed after answering. */
  explanation: string;
  /** Suggested time in seconds (10..30). */
  timeSuggested: number;
  custom?: boolean;
}

/** The part of a question that may be shown before it is answered. */
export type PublicQuestion = Omit<Question, 'answer' | 'explanation' | 'key'>;

export interface CustomQuestion {
  id: string;
  text: string;
  choices: [string, string, string, string];
  answer: number;
  difficulty: Difficulty;
  topic?: TopicId | 'custom';
  explanation?: string;
  /** Optional time override in seconds. */
  time?: number;
}

export interface QuestionOptions {
  grade: Grade;
  topic: TopicId | 'mixed';
  difficulty: Difficulty | 'auto';
  rng?: () => number;
  /** Keys of recent questions to avoid repeating. */
  avoidKeys?: string[];
}

export function toPublicQuestion(q: Question): PublicQuestion {
  const { answer: _a, explanation: _e, key: _k, ...rest } = q;
  return rest;
}
