// Shared helpers for the math-question generators: randomness (always via a
// passed rng), number theory, a tiny Fraction type, Mongolian-textbook number
// formatting and the 4-choice builder.

import type { Difficulty, Grade, GraphSpec } from './types';

export type Rng = () => number;

/** U+2212 MINUS SIGN — used for negatives and subtraction everywhere. */
export const MINUS = '−';
/** Non-breaking space used as the thousands separator ("12 000"). */
export const NBSP = ' ';

/* ================================ random ================================ */

/** Small deterministic PRNG (mulberry32) for tests, samples and replays. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] (inclusive). */
export function randInt(rng: Rng, min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  const v = min + Math.floor(rng() * (max - min + 1));
  return v > max ? max : v;
}

/** Non-zero integer in [min, max]. */
export function randNZ(rng: Rng, min: number, max: number): number {
  for (let i = 0; i < 64; i++) {
    const v = randInt(rng, min, max);
    if (v !== 0) return v;
  }
  return max !== 0 ? max : min !== 0 ? min : 1;
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick() from an empty array');
  return arr[randInt(rng, 0, arr.length - 1)];
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** k distinct elements of arr (k ≤ arr.length), in random order. */
export function sampleUnique<T>(rng: Rng, arr: readonly T[], k: number): T[] {
  return shuffle(rng, arr).slice(0, k);
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function weighted<T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T {
  let total = 0;
  for (const [, w] of items) total += Math.max(0, w);
  if (total <= 0) throw new Error('weighted(): no positive weights');
  let r = rng() * total;
  for (const [v, w] of items) {
    if (w <= 0) continue;
    r -= w;
    if (r < 0) return v;
  }
  for (let i = items.length - 1; i >= 0; i--) if (items[i][1] > 0) return items[i][0];
  throw new Error('unreachable');
}

/** Calls `fn` until it returns a non-null value (parameter search with constraints). */
export function attempt<T>(fn: () => T | null | undefined | false, tries = 400): T {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v !== null && v !== undefined && v !== false) return v;
  }
  throw new Error('attempt(): no valid parameters found');
}

/* ============================= number theory ============================ */

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b);
}

export function isInt(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9;
}

export function round9(n: number): number {
  const r = Math.round(n * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
}

/** Positive divisors of n (n > 0). */
export function divisors(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= Math.abs(n); i++) if (n % i === 0) out.push(i);
  return out;
}

/* =============================== Fraction =============================== */

export class Fraction {
  readonly n: number;
  readonly d: number;

  constructor(n: number, d = 1) {
    if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) {
      throw new Error(`bad fraction ${n}/${d}`);
    }
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1;
    this.n = n / g === 0 ? 0 : n / g;
    this.d = d / g;
  }

  /** Integers, Fractions and finite decimals (0.375 → 3/8). */
  static of(x: number | Fraction): Fraction {
    if (x instanceof Fraction) return x;
    if (Number.isInteger(x)) return new Fraction(x, 1);
    for (let d = 10; d <= 1e6; d *= 10) {
      if (isInt(x * d)) return new Fraction(Math.round(x * d), d);
    }
    throw new Error(`Fraction.of(): ${x} is not a finite decimal`);
  }

  add(o: number | Fraction): Fraction {
    const b = Fraction.of(o);
    return new Fraction(this.n * b.d + b.n * this.d, this.d * b.d);
  }
  sub(o: number | Fraction): Fraction {
    const b = Fraction.of(o);
    return new Fraction(this.n * b.d - b.n * this.d, this.d * b.d);
  }
  mul(o: number | Fraction): Fraction {
    const b = Fraction.of(o);
    return new Fraction(this.n * b.n, this.d * b.d);
  }
  div(o: number | Fraction): Fraction {
    const b = Fraction.of(o);
    if (b.n === 0) throw new Error('division by zero fraction');
    return new Fraction(this.n * b.d, this.d * b.n);
  }
  neg(): Fraction {
    return new Fraction(-this.n, this.d);
  }
  inv(): Fraction {
    return new Fraction(this.d, this.n);
  }
  get value(): number {
    return this.n / this.d;
  }
  isInt(): boolean {
    return this.d === 1;
  }
  eq(o: number | Fraction): boolean {
    const b = Fraction.of(o);
    return this.n === b.n && this.d === b.d;
  }
  /** "3/4", "−3/4", "2" */
  toString(): string {
    if (this.d === 1) return fmt(this.n);
    return `${this.n < 0 ? MINUS : ''}${Math.abs(this.n)}/${this.d}`;
  }
  /** "1 1/2", "−2 3/4", "3/4", "2" */
  toMixed(): string {
    const an = Math.abs(this.n);
    if (this.d === 1 || an < this.d) return this.toString();
    const whole = Math.floor(an / this.d);
    const rem = an % this.d;
    return `${this.n < 0 ? MINUS : ''}${whole} ${rem}/${this.d}`;
  }
}

export const frac = (n: number, d = 1): Fraction => new Fraction(n, d);

/* ============================== formatting ============================== */

/** Integer or decimal with U+2212 minus, decimal comma and NBSP thousands for ≥ 10 000. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`fmt(): bad number ${n}`);
  const r = round9(n);
  const abs = Math.abs(r);
  let s: string;
  if (Number.isInteger(abs)) {
    s = String(abs);
    if (abs >= 10000) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  } else {
    s = String(abs).replace('.', ',');
  }
  return (r < 0 ? MINUS : '') + s;
}

/** Number wrapped in parentheses when negative: "(−3)". */
export function pn(n: number): string {
  return n < 0 ? `(${fmt(n)})` : fmt(n);
}

export const money = (n: number): string => fmt(n) + '₮';
export const deg = (n: number): string => fmt(n) + '°';

/** "a − b" with b in parentheses when negative; just "a" when b = 0. */
export function minusStr(a: number, b: number): string {
  return b === 0 ? fmt(a) : `${fmt(a)} ${MINUS} ${pn(b)}`;
}

/** " + 3", " − 3" or "" for 0 — for appending a constant term. */
export function plus(n: number): string {
  if (n === 0) return '';
  return n > 0 ? ` + ${fmt(n)}` : ` ${MINUS} ${fmt(-n)}`;
}

/**
 * Linear combination with normalized signs, e.g. lin([[2,'x'],[-1,'y']], 3) → "2x − y + 3".
 * Never produces "1x", "+ −", "0y" or "+ 0". An all-zero expression is "0".
 */
export function lin(terms: ReadonlyArray<readonly [number, string]>, constant = 0): string {
  let out = '';
  const push = (c: number, body: string) => {
    if (out === '') out = (c < 0 ? MINUS : '') + body;
    else out += (c < 0 ? ` ${MINUS} ` : ' + ') + body;
  };
  for (const [c, v] of terms) {
    if (c === 0) continue;
    const a = Math.abs(c);
    push(c, v === '' ? fmt(a) : (a === 1 ? '' : fmt(a)) + v);
  }
  if (constant !== 0) push(constant, fmt(Math.abs(constant)));
  return out === '' ? '0' : out;
}

/** a·x² + b·x + c → "2x² − 3x + 1". */
export function poly(a: number, b: number, c: number, v = 'x'): string {
  return lin([[a, v + '²'], [b, v]], c);
}

/** v + c in parentheses: shift('x', -3) → "(x − 3)", shift('x', 0) → "x". */
export function shift(v: string, c: number): string {
  return c === 0 ? v : `(${v}${plus(c)})`;
}

/** Coefficient in front of a parenthesis / variable: 1 → "", −1 → "−", 3 → "3". */
export function coef(a: number): string {
  return a === 1 ? '' : a === -1 ? MINUS : fmt(a);
}

export const pairStr = (x: number, y: number): string => `(${fmt(x)}; ${fmt(y)})`;

/** k·√r: sqrtStr(6,3) → "6√3", sqrtStr(1,2) → "√2". */
export function sqrtStr(k: number, r: number): string {
  if (r === 1) return fmt(k);
  return `${coef(k)}√${r}`;
}

/** Multiple of π: piStr(frac(2,3)) → "2π/3", piStr(1) → "π", piStr(10) → "10π". */
export function piStr(c: number | Fraction): string {
  const f = Fraction.of(c);
  if (f.n === 0) return '0';
  const num = `${coef(f.n)}π`;
  return f.d === 1 ? num : `${num}/${f.d}`;
}

/* ============================ Mongolian text ============================ */

// Case suffixes after a numeral depend on how the number is pronounced, so we
// only use them for small known numbers.
const ABL: Record<number, string> = {
  1: '1-ээс', 2: '2-оос', 3: '3-аас', 4: '4-өөс', 5: '5-аас', 6: '6-гаас',
  7: '7-гоос', 8: '8-аас', 9: '9-өөс', 10: '10-аас', 11: '11-ээс', 12: '12-оос',
};
/** Ablative "-аас" form of a small number: abl(4) → "4-өөс". */
export function abl(n: number): string {
  const s = ABL[n];
  if (!s) throw new Error(`abl(): unsupported ${n}`);
  return s;
}

const DAT: Record<number, string> = { 2: '2-т', 3: '3-т', 4: '4-т', 5: '5-д', 10: '10-т' };
/** Dative "-д/-т" form of a small number: dat(3) → "3-т". */
export function dat(n: number): string {
  const s = DAT[n];
  if (!s) throw new Error(`dat(): unsupported ${n}`);
  return s;
}

const COUNT_WORD: Record<number, string> = {
  2: 'хоёр', 3: 'гурван', 4: 'дөрвөн', 5: 'таван', 6: 'зургаан', 7: 'долоон',
  8: 'найман', 9: 'есөн', 10: 'арван', 12: 'арван хоёр',
};
/** Attributive numeral word ("гурван", "зургаан"). */
export function countWord(n: number): string {
  const s = COUNT_WORD[n];
  if (!s) throw new Error(`countWord(): unsupported ${n}`);
  return s;
}

/* ================================ levels ================================ */

export interface Level {
  grade: Grade;
  /** 0 easy, 1 medium, 2 hard */
  d: 0 | 1 | 2;
  /** grade band: 0 = 6–7, 1 = 8–9, 2 = 10–12 */
  g: 0 | 1 | 2;
  /** negative numbers allowed */
  neg: boolean;
}

export function level(grade: Grade, difficulty: Difficulty): Level {
  const d = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 1 : 2;
  const g = grade <= 7 ? 0 : grade <= 9 ? 1 : 2;
  const neg = grade >= 10 ? true : grade >= 7 ? d >= 1 : d >= 2;
  return { grade, d, g, neg };
}

/* ============================ choice building =========================== */

/** A choice: display text + a value key used for "same value" detection. */
export interface Opt {
  text: string;
  v: string;
}
export type OptLike = Opt | string | null | undefined | false;

const canon = (n: number): string => String(round9(n));

export function opt(text: string, v?: number | string): Opt {
  if (v === undefined) return { text, v: 's:' + text.replace(/\s+/g, ' ').trim() };
  if (typeof v === 'number') return { text, v: 'n:' + canon(v) };
  return { text, v };
}

/** Numeric choice, e.g. optNum(5, ' см') → "5 см". */
export function optNum(n: number, suffix = ''): Opt {
  return opt(fmt(n) + suffix, n);
}

export function optFrac(f: Fraction, mixed = false, suffix = ''): Opt {
  return opt((mixed ? f.toMixed() : f.toString()) + suffix, f.value);
}

export function optPair(x: number, y: number): Opt {
  return { text: pairStr(x, y), v: `p:${canon(x)},${canon(y)}` };
}

/**
 * Unordered set of numbers ("−5; 2", "±3" for {−3, 3}, "30°; 150°" with suffix "°").
 * Values may be Fractions.
 */
export function optSet(vals: ReadonlyArray<number | Fraction>, suffix = '', pm = true): Opt {
  const items = vals.map(Fraction.of);
  const uniq: Fraction[] = [];
  for (const f of items) if (!uniq.some((u) => u.eq(f))) uniq.push(f);
  uniq.sort((a, b) => a.value - b.value);
  const key = 'set:' + uniq.map((f) => canon(f.value)).join(',');
  if (pm && uniq.length === 2 && uniq[0].eq(uniq[1].neg()) && uniq[1].n !== 0) {
    return { text: `±${uniq[1].toString()}${suffix}`, v: key };
  }
  return { text: uniq.map((f) => f.toString() + suffix).join('; '), v: key };
}

const BAD = /NaN|undefined|Infinity|null|\[object/;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Builds 4 distinct (by text and by value) shuffled choices.
 * `wrong` candidates are shuffled and the first valid unique ones are used;
 * `more(i)` is called to fill in if fewer than 3 survive.
 */
export function buildChoices(
  rng: Rng,
  correct: Opt | string,
  wrong: readonly OptLike[],
  more?: (i: number) => OptLike,
): { choices: [string, string, string, string]; answer: number } {
  const toOpt = (o: Opt | string): Opt => (typeof o === 'string' ? opt(o) : o);
  const c = toOpt(correct);
  if (!c.text || BAD.test(c.text)) throw new Error(`invalid correct choice "${c.text}"`);
  const chosen: Opt[] = [c];
  const vs = new Set([c.v]);
  const ts = new Set([norm(c.text)]);
  const add = (o: OptLike) => {
    if (!o || chosen.length >= 4) return;
    const x = toOpt(o);
    if (!x.text || BAD.test(x.text)) return;
    const t = norm(x.text);
    if (vs.has(x.v) || ts.has(t)) return;
    chosen.push(x);
    vs.add(x.v);
    ts.add(t);
  };
  for (const w of shuffle(rng, wrong)) add(w);
  if (more) for (let i = 0; chosen.length < 4 && i < 400; i++) add(more(i));
  if (chosen.length < 4) throw new Error(`not enough distinct choices for "${c.text}"`);
  const order = shuffle(rng, [0, 1, 2, 3]);
  return {
    choices: order.map((i) => chosen[i].text) as [string, string, string, string],
    answer: order.indexOf(0),
  };
}

/** `more` helper: integers near `center` (spread grows with the attempt index). */
export function nearInts(
  rng: Rng,
  center: number,
  f: (n: number) => OptLike,
  opts: { spread?: number; step?: number; ok?: (n: number) => boolean } = {},
): (i: number) => OptLike {
  const spread = opts.spread ?? 3;
  const step = opts.step ?? 1;
  return (i) => {
    const s = spread + Math.floor(i / 20);
    const n = center + step * randNZ(rng, -s, s);
    if (opts.ok && !opts.ok(n)) return null;
    return f(n);
  };
}

/* ============================ generator output ========================== */

/** Machine-checkable description of the problem, used by the tests to verify the math independently. */
export type Check =
  /** value of the correct choice == eval(expr) */
  | { kind: 'value'; expr: string; vars?: Record<string, number> }
  /**
   * Equation in `variable` (default x). Without `solution`: the correct choice satisfies it and no
   * wrong choice does. With `solution`: that value satisfies it and the correct choice equals
   * `answer` (an expression in the variable, default the variable itself) evaluated there.
   */
  | { kind: 'root'; equation: string; variable?: string; solution?: number; answer?: string }
  /** linear system in x, y with the unique solution; correct choice == target(solution) */
  | { kind: 'system'; equations: string[]; solution: [number, number]; target: string }
  /** correct choice is the solution-count classification of the system */
  | { kind: 'systemCount'; equations: string[] }
  /** substituting the correct parameter value makes the system have no / infinitely many solutions */
  | { kind: 'systemParam'; equations: string[]; param: string; want: 'none' | 'inf' }
  /** quadratic equation; ask what */
  | {
      kind: 'quad';
      equation: string;
      ask: 'roots' | 'sum' | 'product' | 'sumsq' | 'disc' | 'count' | 'max' | 'min';
    }
  /** inequality (or system of them) in x */
  | { kind: 'ineq'; inequalities: string[]; ask: 'set' | 'min' | 'max' | 'count' }
  /** correct choice "y = …" passes through all the points; each wrong one misses at least one */
  | { kind: 'through'; points: [number, number][] }
  /** correct choice is the vertex (h; k) of y = fx */
  | { kind: 'vertex'; fx: string }
  /** correct choice is the point where y = fx meets the given axis */
  | { kind: 'axisPoint'; fx: string; axis: 'x' | 'y' };

/** What every topic generator returns: a Question without the per-instance fields. */
export interface GenQuestion {
  key: string;
  text: string;
  lines?: string[];
  system?: boolean;
  graph?: GraphSpec;
  choices: [string, string, string, string];
  answer: number;
  explanation: string;
  /** Preferred time in seconds (clamped to the difficulty band later). */
  time?: number;
  check?: Check;
}

export type Generator = (grade: Grade, difficulty: Difficulty, rng: Rng) => GenQuestion;

export interface Spec {
  key: string;
  text: string;
  lines?: string[];
  system?: boolean;
  graph?: GraphSpec;
  correct: Opt | string;
  wrong: readonly OptLike[];
  more?: (i: number) => OptLike;
  explanation: string;
  time?: number;
  check?: Check;
}

export function make(rng: Rng, s: Spec): GenQuestion {
  const { choices, answer } = buildChoices(rng, s.correct, s.wrong, s.more);
  const q: GenQuestion = { key: s.key, text: s.text, choices, answer, explanation: s.explanation };
  if (s.lines && s.lines.length) q.lines = s.lines;
  if (s.system) q.system = true;
  if (s.graph) q.graph = s.graph;
  if (s.time !== undefined) q.time = s.time;
  if (s.check) q.check = s.check;
  return q;
}
