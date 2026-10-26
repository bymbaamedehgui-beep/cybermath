// Тэнцэтгэл биш: one-step, dividing by a negative (flip!), both sides,
// compound inequalities → intervals, systems, integer solutions.

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Opt,
  type Rng,
  attempt,
  chance,
  coef,
  fmt,
  isInt,
  level,
  lin,
  make,
  nearInts,
  opt,
  optNum,
  pick,
  randInt,
  randNZ,
  shift,
  weighted,
} from '../util';

export type Op = '<' | '>' | '≤' | '≥';
const OPS: Op[] = ['<', '>', '≤', '≥'];

export const isStrict = (o: Op): boolean => o === '<' || o === '>';
export const flip = (o: Op): Op => ({ '<': '>', '>': '<', '≤': '≥', '≥': '≤' } as const)[o];
const toggle = (o: Op): Op => ({ '<': '≤', '≤': '<', '>': '≥', '≥': '>' } as const)[o];

const ray = (o: Op, k: number): Opt => opt(`x ${o} ${fmt(k)}`, `ray:${o}:${k}`);
/** Drop distractors with negative bounds where negatives are not used yet. */
const rays = (L: Level, opts: Array<[Op, number] | null>): Array<Opt | null> =>
  opts.map((o) => (o && (L.neg || o[1] >= 0) ? ray(o[0], o[1]) : null));

export function intervalStr(a: number | null, b: number | null, aClosed: boolean, bClosed: boolean): string {
  const l = a === null ? '(−∞' : `${aClosed ? '[' : '('}${fmt(a)}`;
  const r = b === null ? '+∞)' : `${fmt(b)}${bClosed ? ']' : ')'}`;
  return `${l}; ${r}`;
}
const intervalOpt = (a: number | null, b: number | null, ac: boolean, bc: boolean): Opt =>
  opt(intervalStr(a, b, ac, bc), `int:${a}:${b}:${ac}:${bc}`);

/** a·x + b (op) c whose solution is x (res) k. */
function linIneq(L: Level, rng: Rng, res: Op, k: number, negCoef: boolean) {
  return attempt(() => {
    const a = negCoef ? -randInt(rng, 1, 6) : randInt(rng, 1, 5 + 2 * L.g);
    const b = L.neg ? randInt(rng, -12, 12) : randInt(rng, 0, 12);
    if (a === 1 && b === 0) return null;
    const op = a > 0 ? res : flip(res);
    const c = a * k + b;
    if (!L.neg && c < 0) return null;
    return { a, b, c, op, line: `${lin([[a, 'x']], b)} ${op} ${fmt(c)}` };
  });
}

function bound(L: Level, rng: Rng): number {
  return L.neg ? randInt(rng, -9, 9) : randInt(rng, 1, 12);
}

function rayExplain(a: number, b: number, c: number, op: Op, res: Op, k: number): string {
  const steps: string[] = [];
  if (b !== 0) steps.push(`Сул гишүүнийг баруун тал руу шилжүүлбэл ${lin([[a, 'x']])} ${op} ${fmt(c - b)}.`);
  if (a < 0) steps.push(`Сөрөг тоонд хуваахад тэмдэг эсрэгээр солигдоно: x ${res} ${fmt(k)}.`);
  else if (a !== 1) steps.push(`Эерэг тоонд хуваахад тэмдэг хэвээр: x ${res} ${fmt(k)}.`);
  else steps[steps.length - 1] = `Сул гишүүнийг баруун тал руу шилжүүлбэл x ${res} ${fmt(k)}.`;
  return steps.join(' ');
}

/** a·x + b > c  (a > 0, or a < 0 for the "flip" version). */
function famRay(L: Level, rng: Rng, negCoef: boolean): GenQuestion {
  const res = pick(rng, OPS);
  const k = bound(L, rng);
  const { a, b, c, op, line } = linIneq(L, rng, res, k, negCoef);
  const slip = (c + b) / a; // moved the constant without changing its sign
  const wrong = rays(L, [
    [flip(res), k],
    k !== 0 ? [res, -k] : null,
    [toggle(res), k],
    isInt(slip) && slip !== k ? [res, slip] : null,
    k !== 0 ? [flip(res), -k] : null,
  ]);
  return make(rng, {
    key: `ineq.ray:${a},${b},${op},${c}`,
    text: 'Тэнцэтгэл бишийг бод.',
    lines: [line],
    correct: ray(res, k),
    wrong,
    more: () => rays(L, [[pick(rng, OPS), k + randNZ(rng, -2, 2)]])[0],
    explanation: rayExplain(a, b, c, op, res, k),
    check: { kind: 'ineq', inequalities: [line], ask: 'set' },
  });
}

/** ax + b (op) cx + d, or a(x + b) (op) cx + d */
function famBoth(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const res = pick(rng, OPS);
    const k = bound(L, rng);
    const A = randNZ(rng, L.neg ? -5 : 1, 5); // a − c after collecting
    const c = randNZ(rng, L.neg ? -5 : 1, 6);
    const a = A + c;
    if (a === 0) return null;
    const op = A > 0 ? res : flip(res);
    const paren = L.d === 2 && Math.abs(a) >= 2 && chance(rng, 0.5);
    const p = randNZ(rng, L.neg ? -6 : 1, 6);
    const b = paren ? a * p : randInt(rng, L.neg ? -10 : 0, 10);
    const d = A * k + b;
    const lhs = paren ? `${coef(a)}${shift('x', p)}` : lin([[a, 'x']], b);
    const line = `${lhs} ${op} ${lin([[c, 'x']], d)}`;
    const flipNote = A < 0 ? ' Сөрөг тоонд хуваахад тэмдэг эсрэгээр солигдоно:' : ' Эндээс';
    return make(rng, {
      key: `ineq.both:${line}`,
      text: 'Тэнцэтгэл бишийг бод.',
      lines: [line],
      correct: ray(res, k),
      wrong: rays(L, [[flip(res), k], k !== 0 ? [res, -k] : null, [toggle(res), k], k !== 0 ? [flip(res), -k] : null]),
      more: () => rays(L, [[pick(rng, OPS), k + randNZ(rng, -2, 2)]])[0],
      explanation:
        `${paren ? 'Хаалтыг задалж, x' : 'x'} агуулсан гишүүдийг зүүн тал руу шилжүүлбэл ${lin([[A, 'x']])} ${op} ${fmt(d - b)}.` +
        `${flipNote} x ${res} ${fmt(k)}.`,
      check: { kind: 'ineq', inequalities: [line], ask: 'set' },
    });
  });
}

interface Compound {
  line: string;
  lo: number;
  hi: number;
  loClosed: boolean;
  hiClosed: boolean;
  a: number;
}

/** p (op1) ax + b (op2) q with solution interval between lo and hi. */
function compound(L: Level, rng: Rng): Compound {
  return attempt(() => {
    const lo = L.neg ? randInt(rng, -8, 5) : randInt(rng, 0, 6);
    const hi = lo + randInt(rng, 1, 7);
    const a = L.neg && chance(rng, 0.35) ? -randInt(rng, 1, 3) : randInt(rng, 1, 4);
    const b = randInt(rng, L.neg ? -9 : 0, 9);
    if (a === 1 && b === 0) return null;
    const op1: Op = pick(rng, ['<', '≤'] as const);
    const op2: Op = pick(rng, ['<', '≤'] as const);
    let p: number, q: number, loClosed: boolean, hiClosed: boolean;
    if (a > 0) {
      p = a * lo + b;
      q = a * hi + b;
      loClosed = !isStrict(op1);
      hiClosed = !isStrict(op2);
    } else {
      p = a * hi + b;
      q = a * lo + b;
      hiClosed = !isStrict(op1);
      loClosed = !isStrict(op2);
    }
    if (!L.neg && p < 0) return null;
    return { line: `${fmt(p)} ${op1} ${lin([[a, 'x']], b)} ${op2} ${fmt(q)}`, lo, hi, loClosed, hiClosed, a };
  });
}

function bracketVariants(lo: number | null, hi: number | null, lc: boolean, hc: boolean): Opt[] {
  const out: Opt[] = [];
  for (const x of [true, false]) for (const y of [true, false]) if (x !== lc || y !== hc) out.push(intervalOpt(lo, hi, x, y));
  return out;
}

function famCompound(L: Level, rng: Rng): GenQuestion {
  const C = compound(L, rng);
  const lop = C.loClosed ? '≤' : '<';
  const hop = C.hiClosed ? '≤' : '<';
  return make(rng, {
    key: `ineq.comp:${C.line}`,
    text: 'Давхар тэнцэтгэл бишийг бод.',
    lines: [C.line],
    correct: intervalOpt(C.lo, C.hi, C.loClosed, C.hiClosed),
    wrong: [
      ...bracketVariants(C.lo, C.hi, C.loClosed, C.hiClosed),
      intervalOpt(-C.hi, -C.lo, C.hiClosed, C.loClosed),
      intervalOpt(C.lo - 1, C.hi + 1, C.loClosed, C.hiClosed),
    ],
    more: () => intervalOpt(C.lo + randInt(rng, -2, 2), C.hi + randInt(rng, -2, 2), chance(rng, 0.5), chance(rng, 0.5)),
    explanation:
      `Гурван хэсгээс сул гишүүнийг хасаж, x-ийн коэффициентод хуваавал` +
      `${C.a < 0 ? ' (сөрөг тул тэмдгүүд эргэнэ)' : ''} ${fmt(C.lo)} ${lop} x ${hop} ${fmt(C.hi)}.`,
    time: 30,
    check: { kind: 'ineq', inequalities: [C.line], ask: 'set' },
  });
}

/** System of two inequalities → intersection interval. */
function famSystem(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const lo = L.neg ? randInt(rng, -7, 4) : randInt(rng, 0, 6);
    const hi = lo + randInt(rng, 1, 7);
    const r1: Op = pick(rng, ['>', '≥'] as const);
    const r2: Op = pick(rng, ['<', '≤'] as const);
    const e1 = linIneq(L, rng, r1, lo, L.neg && chance(rng, 0.3));
    const e2 = linIneq(L, rng, r2, hi, L.neg && chance(rng, 0.4));
    const lc = !isStrict(r1);
    const hc = !isStrict(r2);
    const lines = [e1.line, e2.line];
    return make(rng, {
      key: `ineq.sys:${lines.join('|')}`,
      text: 'Тэнцэтгэл бишүүдийн системийг бод.',
      lines,
      system: true,
      correct: intervalOpt(lo, hi, lc, hc),
      wrong: [...bracketVariants(lo, hi, lc, hc), intervalOpt(lo, null, lc, false), intervalOpt(null, hi, false, hc)],
      more: () => intervalOpt(lo + randInt(rng, -2, 2), hi + randInt(rng, -2, 2), chance(rng, 0.5), chance(rng, 0.5)),
      explanation: `Эхнийхээс x ${r1} ${fmt(lo)}, хоёр дахиас x ${r2} ${fmt(hi)}. Ерөнхий хэсэг нь ${intervalStr(lo, hi, lc, hc)}.`,
      time: 30,
      check: { kind: 'ineq', inequalities: lines, ask: 'set' },
    });
  });
}

/** Smallest / largest integer solution, or number of integer solutions. */
function famInteger(L: Level, rng: Rng): GenQuestion {
  const ask = L.d === 2 ? pick(rng, ['min', 'max', 'count', 'count'] as const) : pick(rng, ['min', 'max'] as const);
  if (ask === 'count') {
    const C = compound(L, rng);
    const n = C.hi - C.lo + 1 - (C.loClosed ? 0 : 1) - (C.hiClosed ? 0 : 1);
    if (n <= 0) return famInteger(L, rng);
    return make(rng, {
      key: `ineq.cnt:${C.line}`,
      text: 'Давхар тэнцэтгэл биш хэдэн бүхэл шийдтэй вэ?',
      lines: [C.line],
      correct: optNum(n),
      wrong: [n + 1, n - 1, n + 2, C.hi - C.lo + 1, C.hi - C.lo].filter((v) => v > 0).map((v) => optNum(v)),
      more: nearInts(rng, n, (v) => optNum(v), { ok: (v) => v > 0 }),
      explanation: `${fmt(C.lo)} ${C.loClosed ? '≤' : '<'} x ${C.hiClosed ? '≤' : '<'} ${fmt(C.hi)} тул бүхэл шийдүүд нь ${intList(C)} — нийт ${n}.`,
      time: 30,
      check: { kind: 'ineq', inequalities: [C.line], ask: 'count' },
    });
  }
  const res: Op = ask === 'min' ? pick(rng, ['>', '≥'] as const) : pick(rng, ['<', '≤'] as const);
  const k = bound(L, rng);
  const { a, b, c, op, line } = linIneq(L, rng, res, k, L.neg && chance(rng, 0.4));
  const ans = isStrict(res) ? (ask === 'min' ? k + 1 : k - 1) : k;
  return make(rng, {
    key: `ineq.${ask}:${line}`,
    text: `Тэнцэтгэл бишийн хамгийн ${ask === 'min' ? 'бага' : 'их'} бүхэл шийдийг ол.`,
    lines: [line],
    correct: optNum(ans),
    wrong: [k, k + 1, k - 1, -ans, ask === 'min' ? ans - 1 : ans + 1].filter((v) => L.neg || v >= 0).map((v) => optNum(v)),
    more: nearInts(rng, ans, (v) => optNum(v), { ok: (v) => L.neg || v >= 0 }),
    explanation: `${rayExplain(a, b, c, op, res, k)} Иймд хамгийн ${ask === 'min' ? 'бага' : 'их'} бүхэл шийд нь ${fmt(ans)}.`,
    check: { kind: 'ineq', inequalities: [line], ask },
  });
}

function intList(C: Compound): string {
  const xs: number[] = [];
  for (let v = C.lo; v <= C.hi; v++) {
    if (v === C.lo && !C.loClosed) continue;
    if (v === C.hi && !C.hiClosed) continue;
    xs.push(v);
  }
  return xs.length <= 6 ? xs.map(fmt).join(', ') : `${fmt(xs[0])}, ${fmt(xs[1])}, …, ${fmt(xs[xs.length - 1])}`;
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generateInequalities(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [(l, r) => famRay(l, r, false), 5],
          [(l, r) => famRay(l, r, true), L.neg ? 2 : 0],
          [famInteger, 1],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [(l, r) => famRay(l, r, true), L.neg ? 3 : 0],
            [(l, r) => famRay(l, r, false), L.neg ? 1 : 3],
            [famBoth, 3],
            [famInteger, 2],
            [famCompound, L.g >= 1 ? 1 : 0],
          ])
        : weighted<Fam>(rng, [
            [famCompound, 3],
            [famSystem, 2.5],
            [famInteger, 2.5],
            [famBoth, 1.5],
            [(l, r) => famRay(l, r, true), L.neg ? 1 : 0],
          ]);
  return fam(L, rng);
}

export default generateInequalities;
