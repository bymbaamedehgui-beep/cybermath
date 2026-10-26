// Шугаман тэгшитгэлийн систем — the default topic. Every system is built from a
// chosen integer solution, so the answer is known exactly.

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Opt,
  type OptLike,
  type Rng,
  attempt,
  chance,
  fmt,
  gcd,
  isInt,
  lcm,
  level,
  lin,
  make,
  money,
  nearInts,
  opt,
  optNum,
  optPair,
  pick,
  pn,
  randInt,
  randNZ,
  weighted,
} from '../util';

export const SYS_ONE = 'Нэг шийдтэй';
export const SYS_NONE = 'Шийдгүй';
export const SYS_INF = 'Төгсгөлгүй олон шийдтэй';
export const SYS_TWO = 'Хоёр шийдтэй';

/** a·x + b·y = c */
export type Eq = readonly [number, number, number];

export function eqText(e: Eq): string {
  return `${lin([[e[0], 'x'], [e[1], 'y']])} = ${fmt(e[2])}`;
}

/** Unique solution by Cramer's rule, or null when det = 0. */
export function solve2(e1: Eq, e2: Eq): [number, number] | null {
  const det = e1[0] * e2[1] - e2[0] * e1[1];
  if (det === 0) return null;
  return [(e1[2] * e2[1] - e2[2] * e1[1]) / det, (e1[0] * e2[2] - e2[0] * e1[2]) / det];
}

export function classify(e1: Eq, e2: Eq): 'one' | 'none' | 'inf' {
  if (e1[0] * e2[1] - e2[0] * e1[1] !== 0) return 'one';
  const r1 = e1[0] * e2[2] - e2[0] * e1[2];
  const r2 = e1[1] * e2[2] - e2[1] * e1[2];
  return r1 === 0 && r2 === 0 ? 'inf' : 'none';
}

const eqFrom = (a: number, b: number, x: number, y: number): Eq => [a, b, a * x + b * y];
/** Order-independent signature of two equations (a swapped system is the same problem). */
const pairKey = (e1: Eq, e2: Eq) => [e1.join(','), e2.join(',')].sort().join('|');
const reduced = (e: Eq) => gcd(gcd(e[0], e[1]), e[2]) === 1;

function pickSol(L: Level, rng: Rng): [number, number] {
  if (!L.neg) {
    const m = L.d === 0 ? 8 : 10;
    return [randInt(rng, 1, m), randInt(rng, 1, m)];
  }
  const m = L.d === 2 ? 9 : 7;
  return attempt(() => {
    const x = randInt(rng, -m, m);
    const y = randInt(rng, -m, m);
    if (x === 0 && y === 0) return null;
    if (L.d < 2 && (x === 0 || y === 0)) return null;
    return [x, y] as [number, number];
  });
}

/* ------------------------------ targets ------------------------------ */

type Target = 'pair' | 'x' | 'y' | 'sum' | 'diff' | 'lin' | 'prod';

const T_EXPR: Record<Target, string> = {
  pair: 'pair',
  x: 'x',
  y: 'y',
  sum: 'x + y',
  diff: 'x − y',
  lin: '2x − y',
  prod: 'x · y',
};

const T_TEXT: Record<Target, string> = {
  pair: 'Системийг бод.',
  x: 'Системийг бодож, x-ийн утгыг ол.',
  y: 'Системийг бодож, y-ийн утгыг ол.',
  sum: '(x; y) нь системийн шийд бол x + y-ийн утгыг ол.',
  diff: '(x; y) нь системийн шийд бол x − y-ийн утгыг ол.',
  lin: '(x; y) нь системийн шийд бол 2x − y-ийн утгыг ол.',
  prod: '(x; y) нь системийн шийд бол x · y үржвэрийг ол.',
};

function tVal(t: Target, x: number, y: number): number {
  switch (t) {
    case 'x':
    case 'pair':
      return x;
    case 'y':
      return y;
    case 'sum':
      return x + y;
    case 'diff':
      return x - y;
    case 'lin':
      return 2 * x - y;
    case 'prod':
      return x * y;
  }
}

function pickTarget(L: Level, rng: Rng): Target {
  if (L.d === 0)
    return weighted<Target>(rng, [
      ['pair', 4],
      ['x', 3],
      ['y', 3],
    ]);
  if (L.d === 1)
    return weighted<Target>(rng, [
      ['pair', 3],
      ['x', 2],
      ['y', 2],
      ['sum', 2],
      ['diff', 1],
    ]);
  return weighted<Target>(rng, [
    ['pair', 2],
    ['x', 1],
    ['y', 1],
    ['sum', 2],
    ['diff', 1],
    ['lin', 2],
    ['prod', 1],
  ]);
}

/**
 * Plausible wrong solutions: swapped x/y, sign errors, and points that satisfy
 * only ONE of the two equations (a substitution slip).
 */
export function wrongPairs(e1: Eq, e2: Eq, x: number, y: number): [number, number][] {
  const out: [number, number][] = [
    [y, x],
    [-x, y],
    [x, -y],
    [-x, -y],
  ];
  for (const [a, b, c] of [e1, e2]) {
    if (b === 0) continue;
    const st = Math.abs(b / gcd(a, b));
    for (const s of [st, -st]) {
      const nx = x + s;
      const ny = (c - a * nx) / b;
      if (isInt(ny) && Math.abs(ny) <= 20 && Math.abs(nx) <= 20) out.push([nx, ny]);
    }
  }
  return out;
}

function targetOpts(L: Level, rng: Rng, t: Target, e1: Eq, e2: Eq, x: number, y: number) {
  const okP = (p: [number, number]) => L.neg || (p[0] > 0 && p[1] > 0);
  const pairs = wrongPairs(e1, e2, x, y).filter(okP);
  if (t === 'pair') {
    return {
      correct: optPair(x, y),
      wrong: pairs.map(([a, b]) => optPair(a, b)) as OptLike[],
      more: (): OptLike => {
        const p: [number, number] = [x + randNZ(rng, -2, 2), y + randInt(rng, -2, 2)];
        return okP(p) ? optPair(p[0], p[1]) : null;
      },
    };
  }
  const v = tVal(t, x, y);
  const vals = pairs.map(([a, b]) => tVal(t, a, b));
  if (t === 'x') vals.push(y);
  else if (t === 'y') vals.push(x);
  else if (t === 'sum') vals.push(x - y);
  else if (t === 'diff') vals.push(x + y);
  else if (t === 'lin') vals.push(2 * y - x, 2 * x + y);
  const okV = (n: number) => L.neg || n > 0;
  return {
    correct: optNum(v) as Opt,
    wrong: vals.filter(okV).map((n) => optNum(n)) as OptLike[],
    more: nearInts(rng, v, (n) => optNum(n), { ok: okV }),
  };
}

/* ---------------------------- explanations ---------------------------- */

function coefEq(k: number, v: 'x' | 'y', n: number): string {
  if (k === 1) return `${v} = ${fmt(n)}`;
  return `${lin([[k, v]])} = ${fmt(n)} ⇒ ${v} = ${fmt(n / k)}`;
}

/** One-sentence elimination: "Эхнийхийг 3, хоёр дахийг 2 тоогоор үржүүлээд хасвал 11x = 33 ⇒ x = 3, тэгвэл y = −1." */
export function elimExplain(e1: Eq, e2: Eq, x: number, y: number): string {
  const plan = (i: 0 | 1) => {
    const p = Math.abs(e1[i]);
    const q = Math.abs(e2[i]);
    const l = lcm(p, q);
    return { i, m1: l / p, m2: l / q, cost: l };
  };
  const py = plan(1);
  const px = plan(0);
  const P = px.cost < py.cost ? px : py; // eliminate the cheaper variable (y on ties)
  const keep: 'x' | 'y' = P.i === 1 ? 'x' : 'y';
  const k = P.i === 1 ? 0 : 1;
  const same = Math.sign(e1[P.i]) === Math.sign(e2[P.i]);
  let A = same ? e1[k] * P.m1 - e2[k] * P.m2 : e1[k] * P.m1 + e2[k] * P.m2;
  let C = same ? e1[2] * P.m1 - e2[2] * P.m2 : e1[2] * P.m1 + e2[2] * P.m2;
  // Subtracting works in either order, so show the positive form; a sum is shown as it really comes out.
  if (A < 0 && same) {
    A = -A;
    C = -C;
  }
  const op = same ? 'хасвал' : 'нэмбэл';
  let head: string;
  if (P.m1 === 1 && P.m2 === 1) head = `Тэгшитгэлүүдийг ${op}`;
  else if (P.m1 === 1) head = `Хоёр дахийг ${P.m2} тоогоор үржүүлээд ${op}`;
  else if (P.m2 === 1) head = `Эхнийхийг ${P.m1} тоогоор үржүүлээд ${op}`;
  else head = `Эхнийхийг ${P.m1}, хоёр дахийг ${P.m2} тоогоор үржүүлээд ${op}`;
  const other = keep === 'x' ? `y = ${fmt(y)}` : `x = ${fmt(x)}`;
  return `${head} ${coefEq(A, keep, C)}, тэгвэл ${other}.`;
}

/* ------------------------------ families ------------------------------ */

function algebra(
  L: Level,
  rng: Rng,
  fam: string,
  e1: Eq,
  e2: Eq,
  x: number,
  y: number,
  explanation?: string,
  lines?: string[],
): GenQuestion {
  let t = pickTarget(L, rng);
  if (!L.neg && tVal(t, x, y) <= 0) t = 'sum';
  const ls = lines ?? [eqText(e1), eqText(e2)];
  const o = targetOpts(L, rng, t, e1, e2, x, y);
  let expl = explanation ?? elimExplain(e1, e2, x, y);
  if (t !== 'pair' && t !== 'x' && t !== 'y') expl += ` Иймд ${T_EXPR[t]} = ${fmt(tVal(t, x, y))}.`;
  return make(rng, {
    key: `sys.${fam}:${pairKey(e1, e2)}:${t}`,
    text: T_TEXT[t],
    lines: ls,
    system: true,
    correct: o.correct,
    wrong: o.wrong,
    more: o.more,
    explanation: expl,
    check: { kind: 'system', equations: ls, solution: [x, y], target: T_EXPR[t] },
  });
}

function maybeSwap(rng: Rng, e1: Eq, e2: Eq): [Eq, Eq] {
  return chance(rng, 0.3) ? [e2, e1] : [e1, e2];
}

/** x + y = s, x − y = d */
function famSumDiff(L: Level, rng: Rng): GenQuestion {
  let [x, y] = pickSol(L, rng);
  if (x === y) x += 1;
  if (!L.neg && x < y) [x, y] = [y, x];
  const [e1, e2] = maybeSwap(rng, [1, 1, x + y], [1, -1, x - y]);
  return algebra(L, rng, 'sumdiff', e1, e2, x, y);
}

/** Opposite coefficients of one variable: adding eliminates it. */
function famAddElim(L: Level, rng: Rng): GenQuestion {
  const cm = L.d === 0 ? 3 : 4 + L.g;
  const [e1, e2, x, y] = attempt(() => {
    const [x, y] = pickSol(L, rng);
    const b = randInt(rng, 1, L.d === 0 ? 2 : cm);
    const a1 = L.neg ? randNZ(rng, -cm, cm) : randInt(rng, 1, cm);
    const a2 = L.neg ? randNZ(rng, -cm, cm) : randInt(rng, 1, cm);
    if (a1 + a2 === 0) return null;
    let e1: Eq = eqFrom(a1, b, x, y);
    let e2: Eq = eqFrom(a2, -b, x, y);
    if (L.neg && chance(rng, 0.4)) {
      // eliminate x instead (its coefficients are opposite)
      e1 = eqFrom(b, a1, x, y);
      e2 = eqFrom(-b, a2, x, y);
    }
    if (!L.neg && (e1[2] <= 0 || e2[2] <= 0)) return null;
    if (!reduced(e1) || !reduced(e2)) return null;
    return [e1, e2, x, y] as const;
  });
  const [f1, f2] = maybeSwap(rng, e1, e2);
  return algebra(L, rng, 'add', f1, f2, x, y);
}

/** y = kx + m together with ax + by = c. */
function famSubst(L: Level, rng: Rng): GenQuestion {
  const cm = L.d === 0 ? 3 : 5;
  return attempt(() => {
    const [x, y] = pickSol(L, rng);
    const k = L.neg ? randNZ(rng, -3, 3) : randInt(rng, 1, 3);
    const m = y - k * x;
    if (Math.abs(m) > 12) return null;
    const a = L.neg ? randNZ(rng, -cm, cm) : randInt(rng, 1, cm);
    const b = L.neg ? randNZ(rng, -cm, cm) : randInt(rng, 1, cm);
    const A = a + b * k;
    if (A === 0) return null;
    const e2 = eqFrom(a, b, x, y);
    if (!L.neg && e2[2] <= 0) return null;
    if (!reduced(e2)) return null;
    const sub = `y = ${lin([[k, 'x']], m)}`;
    const expl =
      `y-ийн илэрхийллийг хоёр дахь тэгшитгэлд орлуулбал ${lin([[A, 'x']], b * m)} = ${fmt(e2[2])}` +
      ` ⇒ x = ${fmt(x)}, тэгвэл y = ${fmt(y)}.`;
    return algebra(L, rng, 'subst', [-k, 1, m], e2, x, y, expl, [sub, eqText(e2)]);
  });
}

/** General coefficients (needs multiplying one or both equations). */
function famGeneral(L: Level, rng: Rng): GenQuestion {
  const cm = L.d === 1 ? 4 : 5 + (L.g === 2 ? 1 : 0);
  const [e1, e2, x, y] = attempt(() => {
    const [x, y] = pickSol(L, rng);
    const rc = () => (L.neg ? randNZ(rng, -cm, cm) : randInt(rng, 1, cm));
    const a1 = rc(),
      b1 = rc(),
      a2 = rc(),
      b2 = rc();
    if (a1 * b2 - a2 * b1 === 0) return null;
    if (Math.abs(a1) === Math.abs(a2) && Math.abs(b1) === Math.abs(b2)) return null;
    const ex = lcm(a1, a2);
    const ey = lcm(b1, b2);
    if (L.d === 1 && Math.min(ex, ey) > 4) return null;
    if (Math.min(ex, ey) > 12) return null;
    const e1 = eqFrom(a1, b1, x, y);
    const e2 = eqFrom(a2, b2, x, y);
    if (Math.abs(e1[2]) > 60 || Math.abs(e2[2]) > 60) return null;
    if (!reduced(e1) || !reduced(e2)) return null;
    if (!L.neg && (e1[2] <= 0 || e2[2] <= 0)) return null;
    return [e1, e2, x, y] as const;
  });
  return algebra(L, rng, 'gen', e1, e2, x, y);
}

/** Intersection point of two lines y = k₁x + m₁, y = k₂x + m₂. */
function famIntersect(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const [x, y] = pickSol(L, rng);
    const k1 = L.neg ? randNZ(rng, -3, 3) : randInt(rng, 1, 3);
    const k2 = L.neg ? randNZ(rng, -3, 3) : randInt(rng, 0, 3);
    if (k1 === k2) return null;
    const m1 = y - k1 * x;
    const m2 = y - k2 * x;
    if (Math.abs(m1) > 12 || Math.abs(m2) > 12) return null;
    const lines = [`y = ${lin([[k1, 'x']], m1)}`, `y = ${lin([[k2, 'x']], m2)}`];
    const e1: Eq = [-k1, 1, m1];
    const e2: Eq = [-k2, 1, m2];
    const okP = (p: [number, number]) => L.neg || (p[0] > 0 && p[1] > 0);
    const kd = k1 - k2;
    const step = kd === 1 ? '' : ` ⇒ ${lin([[kd, 'x']])} = ${fmt(m2 - m1)}`;
    return make(rng, {
      key: `sys.meet:${[`${k1},${m1}`, `${k2},${m2}`].sort().join('|')}`,
      text: 'Хоёр шулууны огтлолцлын цэгийг ол.',
      lines,
      correct: optPair(x, y),
      wrong: wrongPairs(e1, e2, x, y)
        .filter(okP)
        .map(([a, b]) => optPair(a, b)),
      more: () => {
        const p: [number, number] = [x + randNZ(rng, -2, 2), y + randInt(rng, -2, 2)];
        return okP(p) ? optPair(p[0], p[1]) : null;
      },
      explanation: `${lin([[k1, 'x']], m1)} = ${lin([[k2, 'x']], m2)}${step} ⇒ x = ${fmt(x)}, тэгвэл y = ${fmt(y)}.`,
      check: { kind: 'system', equations: lines, solution: [x, y], target: 'pair' },
    });
  });
}

/* --------------------------- word problems --------------------------- */

interface WordSpec {
  key: string;
  text: string;
  e1: Eq;
  e2: Eq;
  x: number;
  y: number;
  ask: 'x' | 'y';
  wrong: number[];
  explanation: string;
  money?: boolean;
  step?: number;
}

function wordQ(L: Level, rng: Rng, p: WordSpec): GenQuestion {
  const val = p.ask === 'x' ? p.x : p.y;
  const f = (n: number): Opt => (p.money ? opt(money(n), n) : optNum(n));
  const step = p.step ?? 1;
  const ok = (n: number) => Number.isFinite(n) && isInt(n) && n > 0 && (!p.money || n % 50 === 0);
  return make(rng, {
    key: p.key,
    text: p.text,
    correct: f(val),
    wrong: p.wrong.filter(ok).map(f),
    more: nearInts(rng, val, f, { step, ok }),
    explanation: p.explanation,
    time: L.d === 2 ? 30 : L.d === 1 ? 22 : 15,
    check: {
      kind: 'system',
      equations: [eqText(p.e1), eqText(p.e2)],
      solution: [p.x, p.y],
      target: p.ask,
    },
  });
}

/** Two numbers from their sum and difference (or a linear combination). */
function wNumbers(L: Level, rng: Rng): GenQuestion {
  if (L.d < 2) {
    const y = randInt(rng, 2, 12 + 6 * L.g);
    const d = randInt(rng, 1, 10 + 4 * L.g);
    const x = y + d;
    const s = x + y;
    const big = chance(rng, 0.5);
    return wordQ(L, rng, {
      key: `sys.wnum:${s},${d}:${big ? 'x' : 'y'}`,
      text: `Хоёр тооны нийлбэр ${s}, ялгавар ${d}. ${big ? 'Их' : 'Бага'} тоог ол.`,
      e1: [1, 1, s],
      e2: [1, -1, d],
      x,
      y,
      ask: big ? 'x' : 'y',
      wrong: big ? [y, s + d, s - d, d] : [x, s - d, s + d, d],
      explanation: `Их тоог x, бага тоог y гэвэл x + y = ${s}, x − y = ${d}. Нэмбэл 2x = ${s + d} ⇒ x = ${x}, y = ${y}.`,
    });
  }
  return attempt(() => {
    const x = randInt(rng, 4, 20);
    const y = randInt(rng, 3, 20);
    const k = randInt(rng, 2, 4);
    const s = x + y;
    const r = k * x - y;
    if (r <= 0) return null;
    const first = chance(rng, 0.6);
    return wordQ(L, rng, {
      key: `sys.wnum2:${s},${k},${r}:${first ? 'x' : 'y'}`,
      text:
        `Хоёр тооны нийлбэр ${s}. Эхний тоог ${k} дахин ихэсгээд хоёр дахь тоог хасвал ${r} гарна. ` +
        `${first ? 'Эхний' : 'Хоёр дахь'} тоог ол.`,
      e1: [1, 1, s],
      e2: [k, -1, r],
      x,
      y,
      ask: first ? 'x' : 'y',
      wrong: first ? [y, (s + r) / k, (s + r) / 2, x + 1] : [x, s - (s + r) / k, y + 1, r - s],
      explanation: `x + y = ${s}, ${k}x − y = ${r}. Нэмбэл ${k + 1}x = ${s + r} ⇒ x = ${x}, y = ${y}.`,
    });
  });
}

/** Тахиа, туулай: heads and legs. */
function wAnimals(L: Level, rng: Rng): GenQuestion {
  const c = randInt(rng, 2, 8 + 4 * L.d);
  const r = randInt(rng, 2, 6 + 4 * L.d);
  const heads = c + r;
  const legs = 2 * c + 4 * r;
  const askR = chance(rng, 0.5);
  return wordQ(L, rng, {
    key: `sys.animals:${heads},${legs}:${askR ? 'y' : 'x'}`,
    text: `Хашаанд тахиа, туулай байна. Тэд нийт ${heads} толгой, ${legs} хөлтэй. Хэдэн ${askR ? 'туулай' : 'тахиа'} байна вэ?`,
    e1: [1, 1, heads],
    e2: [2, 4, legs],
    x: c,
    y: r,
    ask: askR ? 'y' : 'x',
    wrong: askR ? [c, legs / 4, heads - legs / 4, r + 1] : [r, legs / 4, legs / 2 - heads, legs / 2 - c],
    explanation: `Тахиаг x, туулайг y гэвэл x + y = ${heads}, 2x + 4y = ${legs}. Эндээс x = ${c}, y = ${r}.`,
  });
}

const GOODS: ReadonlyArray<{ a: string; b: string; ag: string; bg: string; pa: number[]; pb: number[] }> = [
  { a: 'дэвтэр', b: 'үзэг', ag: 'Дэвтрийн', bg: 'үзгийн', pa: [400, 500, 600, 700, 800, 900, 1000, 1200], pb: [200, 300, 400, 500, 600] },
  { a: 'ном', b: 'дэвтэр', ag: 'Номын', bg: 'дэвтрийн', pa: [3000, 4000, 5000, 6000, 8000], pb: [500, 600, 800, 1000, 1500] },
  { a: 'харандаа', b: 'баллуур', ag: 'Харандааны', bg: 'баллуурын', pa: [200, 300, 400, 500], pb: [100, 150, 200, 250, 300] },
  { a: 'бялуу', b: 'ундаа', ag: 'Бялууны', bg: 'ундааны', pa: [2000, 2500, 3000, 3500, 4000], pb: [1000, 1200, 1500, 1800, 2000] },
  { a: 'талх', b: 'сүү', ag: 'Талхны', bg: 'сүүний', pa: [1500, 2000, 2500, 3000], pb: [1800, 2200, 2400, 2800, 3200] },
];

/** Prices of two goods from two receipts. */
function wShop(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const g = pick(rng, GOODS);
    const pa = pick(rng, g.pa);
    const pb = pick(rng, g.pb);
    if (pa === pb) return null;
    const cm = 3 + L.d;
    const a1 = randInt(rng, 1, cm),
      b1 = randInt(rng, 1, cm),
      a2 = randInt(rng, 1, cm),
      b2 = randInt(rng, 1, cm);
    if (a1 * b2 - a2 * b1 === 0) return null;
    if (L.d === 0 && Math.min(a1, b1, a2, b2) > 1) return null;
    const s1 = a1 * pa + b1 * pb;
    const s2 = a2 * pa + b2 * pb;
    const askA = chance(rng, 0.5);
    const val = askA ? pa : pb;
    const step = gcd(pa, pb) >= 100 ? 100 : 50;
    const e1: Eq = [a1, b1, s1];
    const e2: Eq = [a2, b2, s2];
    return wordQ(L, rng, {
      key: `sys.shop:${g.a}:${e1.join(',')}|${e2.join(',')}:${askA ? 'x' : 'y'}`,
      text:
        `${a1} ${g.a}, ${b1} ${g.b} нийт ${money(s1)} үнэтэй. ${a2} ${g.a}, ${b2} ${g.b} нийт ${money(s2)} үнэтэй. ` +
        `Нэг ${askA ? g.a : g.b} хэдэн төгрөг вэ?`,
      e1,
      e2,
      x: pa,
      y: pb,
      ask: askA ? 'x' : 'y',
      wrong: [askA ? pb : pa, val + step, val - step, s1 / (a1 + b1), s2 / (a2 + b2)],
      money: true,
      step,
      explanation:
        `${g.ag} үнийг x, ${g.bg} үнийг y гэвэл ${eqText(e1)}, ${eqText(e2)}. ` +
        `Эндээс x = ${fmt(pa)}, y = ${fmt(pb)}.`,
    });
  });
}

/** Tickets for adults and children. */
function wTickets(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const pa = pick(rng, [3000, 4000, 5000, 6000, 8000, 10000]);
    const pc = pick(rng, [1000, 1500, 2000, 2500, 3000]);
    if (pc >= pa) return null;
    const na = randInt(rng, 1, 4 + 2 * L.d);
    const nc = randInt(rng, 1, 5 + 2 * L.d);
    const n = na + nc;
    const S = na * pa + nc * pc;
    const place = pick(rng, ['Музейн', 'Циркийн', 'Кино театрын', 'Концертын']);
    const kids = chance(rng, 0.55);
    const e1: Eq = [1, 1, n];
    const e2: Eq = [pa, pc, S];
    return wordQ(L, rng, {
      key: `sys.tickets:${place},${pa},${pc},${n},${S}:${kids ? 'y' : 'x'}`,
      text:
        `${place} тасалбар том хүнд ${money(pa)}, хүүхдэд ${money(pc)}. ${n} тасалбарт нийт ${money(S)} төлжээ. ` +
        `${kids ? 'Хүүхдийн' : 'Том хүний'} хэдэн тасалбар авсан бэ?`,
      e1,
      e2,
      x: na,
      y: nc,
      ask: kids ? 'y' : 'x',
      wrong: kids ? [na, nc + 1, nc - 1, S / pa] : [nc, na + 1, na - 1, S / pa],
      explanation: `Том хүний тасалбарыг x, хүүхдийнхийг y гэвэл ${eqText(e1)}, ${eqText(e2)}. Эндээс x = ${na}, y = ${nc}.`,
    });
  });
}

/** Banknotes of two values. */
function wNotes(L: Level, rng: Rng): GenQuestion {
  const [v1, v2] = pick(rng, [
    [100, 500],
    [500, 1000],
    [1000, 5000],
    [5000, 10000],
    [1000, 10000],
  ] as const);
  const n1 = randInt(rng, 1, 5 + 2 * L.d);
  const n2 = randInt(rng, 1, 5 + 2 * L.d);
  const n = n1 + n2;
  const S = n1 * v1 + n2 * v2;
  const askBig = chance(rng, 0.5);
  const e1: Eq = [1, 1, n];
  const e2: Eq = [v1, v2, S];
  return wordQ(L, rng, {
    key: `sys.notes:${v1},${v2},${n},${S}:${askBig ? 'y' : 'x'}`,
    text:
      `Хэтэвчинд ${money(v1)}-ийн ба ${money(v2)}-ийн нийт ${n} дэвсгэрт байна. Нийт мөнгө ${money(S)} бол ` +
      `${money(askBig ? v2 : v1)}-ийн дэвсгэрт хэдэн ширхэг вэ?`,
    e1,
    e2,
    x: n1,
    y: n2,
    ask: askBig ? 'y' : 'x',
    wrong: askBig ? [n1, S / v2, n2 + 1, n2 - 1] : [n2, S / v2, n1 + 1, n1 - 1],
    explanation:
      `${money(v1)}-ийнхийг x, ${money(v2)}-ийнхийг y гэвэл ${eqText(e1)}, ${eqText(e2)}. ` +
      `Эндээс x = ${n1}, y = ${n2}.`,
  });
}

const FAMILY = [
  { P: 'Аав', ch: 'хүү', abl: 'хүүгээсээ', Ch: 'Хүү', pg: 'Аавын', cg: 'хүүгийнхийг', dmin: 24, dmax: 34 },
  { P: 'Ээж', ch: 'охин', abl: 'охиноосоо', Ch: 'Охин', pg: 'Ээжийн', cg: 'охиныхыг', dmin: 22, dmax: 32 },
  { P: 'Өвөө', ch: 'ач', abl: 'ачаасаа', Ch: 'Ач', pg: 'Өвөөгийн', cg: 'ачийнхыг', dmin: 50, dmax: 60 },
] as const;

/** Ages: sum and difference. */
function wAgesSum(L: Level, rng: Rng): GenQuestion {
  const f = pick(rng, FAMILY);
  const c = randInt(rng, 4, 15);
  const d = randInt(rng, f.dmin, f.dmax);
  const p = c + d;
  const s = p + c;
  const askChild = chance(rng, 0.65);
  return wordQ(L, rng, {
    key: `sys.ages:${f.P},${s},${d}:${askChild ? 'y' : 'x'}`,
    text:
      `${f.P}, ${f.ch} хоёрын насны нийлбэр ${s}. ${f.P} ${f.abl} ${d} насаар ах. ` +
      `${askChild ? f.Ch : f.P} хэдэн настай вэ?`,
    e1: [1, 1, s],
    e2: [1, -1, d],
    x: p,
    y: c,
    ask: askChild ? 'y' : 'x',
    wrong: askChild ? [p, s - d, s / 2, d] : [c, s + d, s - c - 1, d],
    explanation: `${f.pg} насыг x, ${f.cg} y гэвэл x + y = ${s}, x − y = ${d}. Хасвал 2y = ${s - d} ⇒ y = ${c}, x = ${p}.`,
  });
}

/** Ages: "k₁ times older now, k₂ times older in t years". */
function wAgesRatio(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const f = pick(rng, FAMILY.slice(0, 2));
    const [k1, k2] = pick(rng, [
      [4, 3],
      [4, 2],
      [6, 3],
      [5, 4],
    ] as const);
    const c = randInt(rng, 3, 14);
    const t = (c * (k1 - k2)) / (k2 - 1);
    const p = k1 * c;
    if (!isInt(t) || t < 2 || t > 20 || p - c < 20 || p > 60) return null;
    const askChild = chance(rng, 0.75);
    const e1: Eq = [1, -k1, 0];
    const e2: Eq = [1, -k2, (k2 - 1) * t];
    return wordQ(L, rng, {
      key: `sys.ageratio:${f.P},${k1},${k2},${t}:${askChild ? 'y' : 'x'}`,
      text:
        `${f.P} ${f.abl} ${k1} дахин их настай. ${t} жилийн дараа ${k2} дахин их настай болно. ` +
        `${askChild ? f.Ch : f.P} одоо хэдэн настай вэ?`,
      e1,
      e2,
      x: p,
      y: c,
      ask: askChild ? 'y' : 'x',
      wrong: askChild ? [c + t, t, p, c + 1] : [p + t, c, k2 * c, p - k1],
      explanation:
        `${f.pg} насыг x, ${f.cg} y гэвэл x = ${k1}y, x + ${t} = ${k2}(y + ${t}). ` +
        (k1 - k2 === 1
          ? `Орлуулбал y = ${(k2 - 1) * t}, x = ${p}.`
          : `Орлуулбал ${k1 - k2}y = ${(k2 - 1) * t} ⇒ y = ${c}, x = ${p}.`),
    });
  });
}

/* ------------------------ number of solutions ------------------------ */

function famCount(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const kind = pick(rng, ['one', 'none', 'inf'] as const);
    const cm = 4 + L.g;
    const rc = () => (L.neg ? randNZ(rng, -cm, cm) : randInt(rng, 1, cm));
    const a1 = rc(),
      b1 = rc();
    const c1 = L.neg ? randInt(rng, -12, 12) : randInt(rng, 1, 15);
    const e1: Eq = [a1, b1, c1];
    if (!reduced(e1)) return null;
    const k = L.neg ? pick(rng, [2, 3, -1, -2]) : pick(rng, [2, 3]);
    let e2: Eq;
    if (kind === 'inf') e2 = [k * a1, k * b1, k * c1];
    else if (kind === 'none') e2 = [k * a1, k * b1, k * c1 + randNZ(rng, -5, 5)];
    else e2 = [k * a1, k * b1 + randNZ(rng, -2, 2), k * c1 + randInt(rng, -3, 3)];
    if (e2[1] === 0) return null;
    if (!L.neg && (e2[1] < 0 || e2[2] <= 0)) return null;
    if (classify(e1, e2) !== kind) return null;
    const [f1, f2] = maybeSwap(rng, e1, e2);
    const lines = [eqText(f1), eqText(f2)];
    const correct = kind === 'one' ? SYS_ONE : kind === 'none' ? SYS_NONE : SYS_INF;
    const explanation =
      kind === 'one'
        ? 'x, y-ийн коэффициентууд пропорциональ биш тул шулуунууд огтлолцоно: систем нэг шийдтэй.'
        : kind === 'none'
          ? 'Коэффициентууд пропорциональ боловч сул гишүүд пропорциональ биш тул шулуунууд параллель: систем шийдгүй.'
          : 'Нэг тэгшитгэлийг тоогоор үржүүлэхэд нөгөө нь гарна. Шулуунууд давхцах тул систем төгсгөлгүй олон шийдтэй.';
    return make(rng, {
      key: `sys.count:${pairKey(f1, f2)}`,
      text: 'Систем хэдэн шийдтэй вэ?',
      lines,
      system: true,
      correct,
      wrong: [SYS_ONE, SYS_NONE, SYS_INF, SYS_TWO].filter((s) => s !== correct),
      explanation,
      check: { kind: 'systemCount', equations: lines },
    });
  });
}

/** Parameter value that makes the system have no / infinitely many solutions. */
function famParam(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const cm = 4 + L.g;
    const rc = () => (L.neg ? randNZ(rng, -cm, cm) : randInt(rng, 1, cm));
    const a = rc(),
      b = rc();
    const c = L.neg ? randNZ(rng, -12, 12) : randInt(rng, 1, 12);
    const base: Eq = [a, b, c];
    if (!reduced(base)) return null;
    const m = L.neg ? pick(rng, [2, 3, -2, -1, -3]) : pick(rng, [2, 3]);
    const okK = (n: number) => isInt(n) && n !== 0;
    if (chance(rng, 0.6)) {
      // kx + (m·b)y = c₁  with c₁ ≠ m·c  → no solution when k = m·a
      const K = m * a;
      const b1 = m * b;
      const c1 = m * c + randNZ(rng, -4, 4);
      if (c1 === 0 || (!L.neg && c1 < 0)) return null;
      const lines = [`${lin([[1, 'kx'], [b1, 'y']])} = ${fmt(c1)}`, eqText(base)];
      return make(rng, {
        key: `sys.param:${K},${b1},${c1}|${base.join(',')}`,
        text: 'k параметрийн ямар утгад систем шийдгүй вэ?',
        lines,
        system: true,
        correct: optNum(K),
        wrong: [a, -K, a / m, (c1 * a) / c, K + m].filter(okK).map((n) => optNum(n)),
        more: nearInts(rng, K, (n) => optNum(n), { ok: (n) => n !== 0 }),
        explanation:
          `Шийдгүй байхын тулд x, y-ийн коэффициентууд пропорциональ, сул гишүүд пропорциональ биш байна: ` +
          `k : ${pn(a)} = ${pn(b1)} : ${pn(b)} ⇒ k = ${fmt(K)}.`,
        check: { kind: 'systemParam', equations: lines, param: 'k', want: 'none' },
      });
    }
    // (m·a)x + (m·b)y = M → infinitely many when M = m·c
    const M = m * c;
    const lines = [eqText(base), `${lin([[m * a, 'x'], [m * b, 'y']])} = m`];
    return make(rng, {
      key: `sys.paramInf:${base.join(',')}|${m}`,
      text: 'm параметрийн ямар утгад систем төгсгөлгүй олон шийдтэй вэ?',
      lines,
      system: true,
      correct: optNum(M),
      wrong: [c, -M, M + m, c + m, M - c].filter(okK).map((n) => optNum(n)),
      more: nearInts(rng, M, (n) => optNum(n), { ok: (n) => n !== 0 }),
      explanation: `Эхний тэгшитгэлийг ${pn(m)} тоогоор үржүүлэхэд хоёр дахийн зүүн тал гарна, иймд m = ${pn(m)} · ${pn(c)} = ${fmt(M)}.`,
      check: { kind: 'systemParam', equations: lines, param: 'm', want: 'inf' },
    });
  });
}

/* ------------------------------- entry ------------------------------- */

type Fam = (L: Level, rng: Rng) => GenQuestion;

function famWordEasy(L: Level, rng: Rng): GenQuestion {
  return weighted<Fam>(rng, [
    [wNumbers, 3],
    [wAnimals, 2],
    [wAgesSum, 2],
    [wShop, 1],
  ])(L, rng);
}

function famWord(L: Level, rng: Rng): GenQuestion {
  return weighted<Fam>(rng, [
    [wNumbers, 1],
    [wAnimals, 2],
    [wShop, 2],
    [wTickets, 2],
    [wNotes, 2],
    [wAgesSum, 1],
  ])(L, rng);
}

function famWordHard(L: Level, rng: Rng): GenQuestion {
  return weighted<Fam>(rng, [
    [wNumbers, 1.5],
    [wAnimals, 1],
    [wShop, 2],
    [wTickets, 1.5],
    [wNotes, 1],
    [wAgesRatio, 2],
  ])(L, rng);
}

export function generateSystems(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famSumDiff, 3],
          [famAddElim, 2],
          [famSubst, 2],
          [famWordEasy, 3],
          [famIntersect, L.g >= 1 ? 1 : 0],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famAddElim, 2],
            [famSubst, 2],
            [famGeneral, 2],
            [famIntersect, 1],
            [famWord, 4],
            [famCount, 1],
          ])
        : weighted<Fam>(rng, [
            [famGeneral, 3],
            [famSubst, 1],
            [famWordHard, 4],
            [famCount, 1.5],
            [famParam, 1.5],
          ]);
  return fam(L, rng);
}

export default generateSystems;
