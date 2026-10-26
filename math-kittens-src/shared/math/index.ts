// Public entry point of the math-question generator.

import type { CustomQuestion, Difficulty, Grade, Question, QuestionOptions, TopicId } from './types';
import { topicsForGrade } from './topics';
import { type GenQuestion, type Generator, type Rng, pick, randInt, shuffle } from './util';
import { generateArithmetic } from './generators/arithmetic';
import { generateFractions } from './generators/fractions';
import { generatePercent } from './generators/percent';
import { generateLinear } from './generators/linear';
import { generateSystems } from './generators/systems';
import { generateInequalities } from './generators/inequalities';
import { generateQuadratic } from './generators/quadratic';
import { generateFunctions } from './generators/functions';
import { generateGeometry } from './generators/geometry';
import { generateTrig } from './generators/trig';
import { generateProbability } from './generators/probability';

export * from './types';
export * from './topics';
export type { GenQuestion, Generator, Rng } from './util';
export { makeRng } from './util';

/** One generator per topic: (grade, difficulty, rng) → question without id/topic/grade/time. */
export const GENERATORS: Record<TopicId, Generator> = {
  arithmetic: generateArithmetic,
  fractions: generateFractions,
  percent: generatePercent,
  linear: generateLinear,
  systems: generateSystems,
  inequalities: generateInequalities,
  quadratic: generateQuadratic,
  functions: generateFunctions,
  geometry: generateGeometry,
  trig: generateTrig,
  probability: generateProbability,
};

const BASE_TIME: Record<Difficulty, number> = { easy: 15, medium: 20, hard: 30 };
const TIME_BAND: Record<Difficulty, [number, number]> = { easy: [10, 15], medium: [18, 22], hard: [25, 30] };

/** Suggested answer time in seconds: easy 15, medium 20, hard 30. */
export function timeForDifficulty(d: Difficulty): number {
  return BASE_TIME[d] ?? 20;
}

function clampTime(t: number | undefined, d: Difficulty): number {
  const [lo, hi] = TIME_BAND[d];
  const v = t === undefined || !Number.isFinite(t) ? timeForDifficulty(d) : Math.round(t);
  return Math.min(hi, Math.max(lo, v));
}

/** 35% easy, 45% medium, 20% hard. */
export function pickAutoDifficulty(rng: Rng = Math.random): Difficulty {
  const r = rng();
  return r < 0.35 ? 'easy' : r < 0.8 ? 'medium' : 'hard';
}

let idCounter = 0;
function newId(rng: Rng): string {
  idCounter = (idCounter + 1) % 1679616;
  let s = '';
  for (let i = 0; i < 8; i++) s += randInt(rng, 0, 35).toString(36);
  return `q${s}${idCounter.toString(36)}`;
}

function normalizeGrade(g: number): Grade {
  const n = Math.round(Number(g));
  return (Number.isFinite(n) ? Math.min(12, Math.max(6, n)) : 9) as Grade;
}

function toQuestion(g: GenQuestion, topic: TopicId, grade: Grade, difficulty: Difficulty, rng: Rng): Question {
  const q: Question = {
    id: newId(rng),
    key: `${topic}:${g.key}`,
    topic,
    difficulty,
    grade,
    text: g.text,
    choices: g.choices,
    answer: g.answer,
    explanation: g.explanation,
    timeSuggested: clampTime(g.time, difficulty),
  };
  if (g.lines && g.lines.length) q.lines = g.lines;
  if (g.system) q.system = true;
  if (g.graph) q.graph = g.graph;
  return q;
}

/** Generates one question; retries up to 8 times to avoid keys in `opts.avoidKeys`. */
export function generateQuestion(opts: QuestionOptions): Question {
  const rng = opts.rng ?? Math.random;
  const grade = normalizeGrade(opts.grade);
  const avoid = new Set(opts.avoidKeys ?? []);
  const topic: TopicId =
    opts.topic === 'mixed' || !(opts.topic in GENERATORS) ? pick(rng, topicsForGrade(grade)) : opts.topic;
  const difficulty: Difficulty =
    opts.difficulty === 'easy' || opts.difficulty === 'medium' || opts.difficulty === 'hard'
      ? opts.difficulty
      : pickAutoDifficulty(rng);

  let last: Question | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    let g: GenQuestion;
    try {
      g = GENERATORS[topic](grade, difficulty, rng);
    } catch {
      continue; // a parameter search failed — just try again
    }
    last = toQuestion(g, topic, grade, difficulty, rng);
    if (!avoid.has(last.key)) return last;
  }
  if (last) return last;
  // Extremely unlikely fallback: a simple arithmetic question.
  return toQuestion(GENERATORS.arithmetic(grade, 'easy', rng), 'arithmetic', grade, 'easy', rng);
}

/** Turns a teacher's question into a playable Question with shuffled choices. */
export function questionFromCustom(c: CustomQuestion, grade: Grade, rng: Rng = Math.random): Question {
  if (!Array.isArray(c.choices) || c.choices.length !== 4) throw new Error('Custom question needs exactly 4 choices');
  if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer > 3) throw new Error('Custom question answer must be 0..3');
  const order = shuffle(rng, [0, 1, 2, 3]);
  const choices = order.map((i) => String(c.choices[i])) as [string, string, string, string];
  const difficulty: Difficulty = c.difficulty === 'easy' || c.difficulty === 'hard' ? c.difficulty : 'medium';
  const time = typeof c.time === 'number' && Number.isFinite(c.time) && c.time > 0 ? Math.round(c.time) : timeForDifficulty(difficulty);
  return {
    id: newId(rng),
    key: `custom:${c.id}`,
    topic: c.topic ?? 'custom',
    difficulty,
    grade: normalizeGrade(grade),
    text: c.text,
    choices,
    answer: order.indexOf(c.answer),
    explanation: c.explanation && c.explanation.trim() ? c.explanation : `Зөв хариулт: ${c.choices[c.answer]}`,
    timeSuggested: time,
    custom: true,
  };
}
