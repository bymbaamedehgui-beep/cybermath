// Арифметик: order of operations, negatives, parentheses, powers and roots.
// Each template knows its value and the typical mistakes (left-to-right
// evaluation, sign slips, (−a)² vs −a², 2³ read as 2 · 3, √(a² + b²) = a + b).

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Rng,
  MINUS as M,
  attempt,
  chance,
  divisors,
  fmt,
  isInt,
  level,
  make,
  nearInts,
  optNum,
  pick,
  randInt,
  weighted,
} from '../util';

interface Prob {
  key: string;
  expr: string;
  val: number;
  wrong: number[];
  expl: string;
}

type Tpl = (L: Level, rng: Rng) => Prob | null;

const n = (v: number) => fmt(v);

/* ------------------------------ easy ------------------------------ */

const addMul: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 20 + 10 * L.g);
  const b = randInt(rng, 2, 9);
  const c = randInt(rng, 2, 9);
  const v = a + b * c;
  return {
    key: `am:${a},${b},${c}`,
    expr: `${a} + ${b} · ${c}`,
    val: v,
    wrong: [(a + b) * c, a + b + c, a * b + c],
    expl: `Эхлээд үржүүлнэ: ${b} · ${c} = ${b * c}, дараа нь ${a} + ${b * c} = ${v}.`,
  };
};

const subMul: Tpl = (L, rng) => {
  const b = randInt(rng, 2, 9);
  const c = randInt(rng, 2, 9);
  const a = L.neg && chance(rng, 0.3) ? randInt(rng, 2, b * c - 1) : b * c + randInt(rng, 1, 20);
  const v = a - b * c;
  return {
    key: `sm:${a},${b},${c}`,
    expr: `${a} ${M} ${b} · ${c}`,
    val: v,
    wrong: [(a - b) * c, a - b - c, b * c - a, a + b * c],
    expl: `Эхлээд үржүүлнэ: ${b} · ${c} = ${b * c}, дараа нь ${a} ${M} ${b * c} = ${n(v)}.`,
  };
};

const parMul: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 15 + 5 * L.g);
  const b = randInt(rng, 2, 12);
  const c = randInt(rng, 2, 9);
  const v = (a + b) * c;
  return {
    key: `pm:${a},${b},${c}`,
    expr: `(${a} + ${b}) · ${c}`,
    val: v,
    wrong: [a + b * c, a * c + b, a + b + c],
    expl: `Эхлээд хаалтан доторх: ${a} + ${b} = ${a + b}, дараа нь ${a + b} · ${c} = ${v}.`,
  };
};

const divAdd: Tpl = (L, rng) => {
  const b = randInt(rng, 2, 9);
  const q = randInt(rng, 2, 9 + 3 * L.g);
  const c = randInt(rng, 1, 20);
  const a = b * q;
  const v = q + c;
  return {
    key: `da:${a},${b},${c}`,
    expr: `${a} : ${b} + ${c}`,
    val: v,
    wrong: [a / (b + c), (a + c) / b, q * c, q + c + b],
    expl: `Эхлээд хуваана: ${a} : ${b} = ${q}, дараа нь ${q} + ${c} = ${v}.`,
  };
};

const addDiv: Tpl = (L, rng) => {
  const c = randInt(rng, 2, 9);
  const q = randInt(rng, 2, 9 + 3 * L.g);
  const a = randInt(rng, 2, 30);
  const b = c * q;
  const v = a + q;
  return {
    key: `ad:${a},${b},${c}`,
    expr: `${a} + ${b} : ${c}`,
    val: v,
    wrong: [(a + b) / c, a + b - c, q, a - q, a + b],
    expl: `Эхлээд хуваана: ${b} : ${c} = ${q}, дараа нь ${a} + ${q} = ${v}.`,
  };
};

const mulPar: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 9);
  const c = randInt(rng, 1, 12);
  const b = c + randInt(rng, 1, 12);
  const v = a * (b - c);
  return {
    key: `mp:${a},${b},${c}`,
    expr: `${a} · (${b} ${M} ${c})`,
    val: v,
    wrong: [a * b - c, a * b + c, a * (b + c)],
    expl: `Эхлээд хаалтан доторх: ${b} ${M} ${c} = ${b - c}, дараа нь ${a} · ${b - c} = ${v}.`,
  };
};

const twoProd: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 9);
  const b = randInt(rng, 2, 9);
  const c = randInt(rng, 2, 9);
  const d = randInt(rng, 2, 9);
  const minus = chance(rng, 0.4);
  if (minus && !L.neg && a * b < c * d) return null;
  const v = minus ? a * b - c * d : a * b + c * d;
  const op = minus ? M : '+';
  return {
    key: `tp:${a},${b},${op},${c},${d}`,
    expr: `${a} · ${b} ${op} ${c} · ${d}`,
    val: v,
    wrong: minus ? [(a * b - c) * d, a * b - c - d, a * (b - c) * d] : [(a * b + c) * d, a * b + c + d, a * (b + c) * d],
    expl: `Эхлээд үржвэрүүд: ${a * b} ба ${c * d}, дараа нь ${a * b} ${op} ${c * d} = ${n(v)}.`,
  };
};

const subPar: Tpl = (L, rng) => {
  const c = randInt(rng, 1, 15);
  const b = c + randInt(rng, 1, 15);
  const a = b + randInt(rng, 1, 20);
  const v = a - (b - c);
  return {
    key: `sp:${a},${b},${c}`,
    expr: `${a} ${M} (${b} ${M} ${c})`,
    val: v,
    wrong: [a - b - c, a + b - c, a - b],
    expl: `Хаалтан доторх ${b} ${M} ${c} = ${b - c}, тэгвэл ${a} ${M} ${b - c} = ${v}.`,
  };
};

/* ----------------------------- powers ----------------------------- */

const sqMul: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 9 + L.g);
  const b = randInt(rng, 2, 9);
  const c = randInt(rng, 2, 6);
  const v = a * a + b * c;
  return {
    key: `sq:${a},${b},${c}`,
    expr: `${a}² + ${b} · ${c}`,
    val: v,
    wrong: [2 * a + b * c, (a * a + b) * c, a * a + b + c],
    expl: `${a}² = ${a * a}, ${b} · ${c} = ${b * c}, нийлбэр нь ${v}.`,
  };
};

const cube: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 5);
  const b = randInt(rng, 1, a * a * a - 1);
  const plus = chance(rng, 0.4);
  const v = plus ? a ** 3 + b : a ** 3 - b;
  const op = plus ? '+' : M;
  return {
    key: `cu:${a},${op},${b}`,
    expr: `${a}³ ${op} ${b}`,
    val: v,
    wrong: plus ? [3 * a + b, a * a + b, a ** 3 - b] : [3 * a - b, a * a - b, a ** 3 + b],
    expl: `${a}³ = ${a} · ${a} · ${a} = ${a ** 3}, тэгвэл ${a ** 3} ${op} ${b} = ${n(v)}.`,
  };
};

const rootMul: Tpl = (L, rng) => {
  const r = randInt(rng, 2, 10 + 2 * L.g);
  const b = randInt(rng, 2, 9);
  const c = randInt(rng, 2, 6);
  const v = r + b * c;
  return {
    key: `rt:${r},${b},${c}`,
    expr: `√${r * r} + ${b} · ${c}`,
    val: v,
    wrong: [(r + b) * c, r + b + c, (r * r) / 2 + b * c, r * r + b * c],
    expl: `√${r * r} = ${r}, ${b} · ${c} = ${b * c}, нийлбэр нь ${v}.`,
  };
};

const parSq: Tpl = (L, rng) => {
  const a = randInt(rng, 1, 6);
  const b = randInt(rng, 1, 6);
  const s = (a + b) ** 2;
  const cs = divisors(s).filter((d) => d >= 2 && d <= 9 && d !== s);
  if (!cs.length) return null;
  const c = pick(rng, cs);
  const v = s / c;
  return {
    key: `ps:${a},${b},${c}`,
    expr: `(${a} + ${b})² : ${c}`,
    val: v,
    wrong: [(a * a + b * b) / c, (2 * (a + b)) / c, a * a + b * b, v + c],
    expl: `(${a} + ${b})² = ${a + b}² = ${s}, ${s} : ${c} = ${v}.`,
  };
};

const sqDiff: Tpl = (L, rng) => {
  const b = randInt(rng, 2, 8 + L.g);
  const a = b + randInt(rng, 1, 6);
  const v = a * a - b * b;
  return {
    key: `sd:${a},${b}`,
    expr: `${a}² ${M} ${b}²`,
    val: v,
    wrong: [(a - b) ** 2, 2 * (a - b), a * a + b * b],
    expl: `${a}² ${M} ${b}² = ${a * a} ${M} ${b * b} = ${v}.`,
  };
};

/* ---------------------------- negatives ---------------------------- */

const negA: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 15);
  const b = randInt(rng, 2, 9);
  const c = randInt(rng, 2, 9);
  const v = -a - b * c;
  return {
    key: `na:${a},${b},${c}`,
    expr: `${M}${a} + ${b} · (${M}${c})`,
    val: v,
    wrong: [(-a + b) * -c, -a + b * c, a - b * c, a + b * c],
    expl: `${b} · (${M}${c}) = ${n(-b * c)}, тэгвэл ${M}${a} ${M} ${b * c} = ${n(v)}.`,
  };
};

const negB: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 9);
  const b = randInt(rng, 2, 9);
  const c = randInt(rng, 1, 30);
  const v = a * b - c;
  return {
    key: `nb:${a},${b},${c}`,
    expr: `(${M}${a}) · (${M}${b}) ${M} ${c}`,
    val: v,
    wrong: [-a * b - c, a * b + c, -a * b + c],
    expl: `Сөрөг тоонуудын үржвэр эерэг: (${M}${a}) · (${M}${b}) = ${a * b}, тэгвэл ${a * b} ${M} ${c} = ${n(v)}.`,
  };
};

const negC: Tpl = (L, rng) => {
  const c = randInt(rng, 2, 9);
  const q = randInt(rng, 2, 9);
  const a = randInt(rng, 1, 20);
  const b = c * q;
  const v = -a + q;
  return {
    key: `nc:${a},${b},${c}`,
    expr: `${M}${a} ${M} ${b} : (${M}${c})`,
    val: v,
    wrong: [-a - q, a + q, (-a - b) / -c, a - q],
    expl: `${b} : (${M}${c}) = ${n(-q)}, тэгвэл ${M}${a} ${M} (${M}${q}) = ${M}${a} + ${q} = ${n(v)}.`,
  };
};

const negSq: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 9);
  const b = randInt(rng, 1, 20);
  if (chance(rng, 0.5)) {
    const v = -(a * a) + b;
    return {
      key: `ns1:${a},${b}`,
      expr: `${M}${a}² + ${b}`,
      val: v,
      wrong: [a * a + b, -2 * a + b, -(a * a) - b],
      expl: `${M}${a}² = ${M}(${a}²) = ${n(-a * a)}, тэгвэл ${n(-a * a)} + ${b} = ${n(v)}.`,
    };
  }
  const v = a * a - b;
  return {
    key: `ns2:${a},${b}`,
    expr: `(${M}${a})² ${M} ${b}`,
    val: v,
    wrong: [-(a * a) - b, -2 * a - b, a * a + b],
    expl: `(${M}${a})² = ${a * a}, тэгвэл ${a * a} ${M} ${b} = ${n(v)}.`,
  };
};

/* ------------------------------ hard ------------------------------ */

const h1: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 20);
  const b = randInt(rng, 2, 9);
  const c = randInt(rng, 1, 9);
  const d = c + randInt(rng, 1, 8);
  const v = a - b * (c - d);
  return {
    key: `h1:${a},${b},${c},${d}`,
    expr: `${a} ${M} ${b} · (${c} ${M} ${d})`,
    val: v,
    wrong: [(a - b) * (c - d), a - b * (d - c), a - b * c - d, a - b * c + d],
    expl: `${c} ${M} ${d} = ${n(c - d)}, ${b} · (${n(c - d)}) = ${n(b * (c - d))}, тэгвэл ${a} + ${b * (d - c)} = ${v}.`,
  };
};

const h2: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 7);
  const b = randInt(rng, 2, 6);
  const c = randInt(rng, 1, 9);
  const d = c + randInt(rng, 1, 6);
  const v = a * a - b * (c - d);
  return {
    key: `h2:${a},${b},${c},${d}`,
    expr: `(${M}${a})² ${M} ${b} · (${c} ${M} ${d})`,
    val: v,
    wrong: [-(a * a) - b * (c - d), a * a + b * (c - d), a * a - b * c - d, -2 * a - b * (c - d)],
    expl: `(${M}${a})² = ${a * a}, ${b} · (${n(c - d)}) = ${n(b * (c - d))}, тэгвэл ${a * a} + ${b * (d - c)} = ${v}.`,
  };
};

const TRIPLES = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [8, 6, 10],
  [4, 3, 5],
] as const;

const h3: Tpl = (L, rng) => {
  const [p, q, r] = pick(rng, TRIPLES);
  const k = randInt(rng, 2, 5);
  const m = randInt(rng, 1, 20);
  const v = r * k - m;
  return {
    key: `h3:${p},${q},${k},${m}`,
    expr: `√(${p}² + ${q}²) · ${k} ${M} ${m}`,
    val: v,
    wrong: [(p + q) * k - m, r * (k - m), r * k + m, (p * p + q * q) * k - m],
    expl: `√(${p * p} + ${q * q}) = √${r * r} = ${r}, тэгвэл ${r} · ${k} ${M} ${m} = ${n(v)}.`,
  };
};

const h4: Tpl = (L, rng) => {
  const b = randInt(rng, 1, 8);
  const a = b + randInt(rng, 2, 6);
  const s = (a - b) ** 2;
  const cs = divisors(s).filter((x) => x >= 2 && x < s);
  if (!cs.length) return null;
  const c = pick(rng, cs);
  const d = randInt(rng, 2, 6);
  const e = randInt(rng, 2, 6);
  const v = s / c + d * e;
  return {
    key: `h4:${a},${b},${c},${d},${e}`,
    expr: `(${a} ${M} ${b})² : ${c} + ${d} · ${e}`,
    val: v,
    wrong: [(a * a - b * b) / c + d * e, (s / c + d) * e, s / (c + d) * e, s / c + d + e],
    expl: `(${a} ${M} ${b})² = ${s}, ${s} : ${c} = ${s / c}, ${d} · ${e} = ${d * e}, нийлбэр нь ${v}.`,
  };
};

const h5: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 6);
  const b = randInt(rng, 2, 4);
  const cube = b ** 3;
  const cs = divisors(cube).filter((x) => x >= 2 && x <= 16);
  if (!cs.length) return null;
  const c = pick(rng, cs);
  const t = cube / c;
  const v = -(a * a) - t;
  return {
    key: `h5:${a},${b},${c}`,
    expr: `${M}${a}² + (${M}${b})³ : ${c}`,
    val: v,
    wrong: [a * a - t, -(a * a) + t, a * a + t, -(a * a) - cube],
    expl: `${M}${a}² = ${n(-a * a)}, (${M}${b})³ = ${n(-cube)}, ${n(-cube)} : ${c} = ${n(-t)}, нийлбэр нь ${n(v)}.`,
  };
};

const h6: Tpl = (L, rng) => {
  const a = randInt(rng, 2, 3);
  const b = randInt(rng, 2, 5);
  const c = randInt(rng, 2, 8);
  const ds = divisors(c * c).filter((x) => x >= 2 && x <= 16);
  if (!ds.length) return null;
  const d = pick(rng, ds);
  const v = a ** 3 * b - (c * c) / d;
  return {
    key: `h6:${a},${b},${c},${d}`,
    expr: `${a}³ · ${b} ${M} ${c}² : ${d}`,
    val: v,
    wrong: [(a ** 3 * b - c * c) / d, 3 * a * b - (2 * c) / d, a ** 3 * b - c * c * d, a * a * b - (c * c) / d],
    expl: `${a}³ · ${b} = ${a ** 3 * b}, ${c}² : ${d} = ${(c * c) / d}, ялгавар нь ${n(v)}.`,
  };
};

export function generateArithmetic(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const tpl =
    L.d === 0
      ? weighted<Tpl>(rng, [
          [addMul, 2],
          [subMul, 2],
          [parMul, 2],
          [divAdd, 1.5],
          [addDiv, 1.5],
          [mulPar, 1],
          [subPar, 1],
          [negB, L.neg ? 1 : 0],
          [negA, L.neg ? 1 : 0],
        ])
      : L.d === 1
        ? weighted<Tpl>(rng, [
            [twoProd, 1.5],
            [sqMul, 2],
            [cube, 1.5],
            [rootMul, 1.5],
            [parSq, 1],
            [sqDiff, 1],
            [negA, L.neg ? 1.5 : 0],
            [negB, L.neg ? 1 : 0],
            [negC, L.neg ? 1.5 : 0],
            [negSq, L.neg ? 1.5 : 0],
          ])
        : weighted<Tpl>(rng, [
            [h1, 2],
            [h2, L.neg ? 2 : 0],
            [h3, 2],
            [h4, 2],
            [h5, grade >= 8 ? 1.5 : 0],
            [h6, 1.5],
            [negSq, 1],
          ]);
  const p = attempt(() => tpl(L, rng));
  const ok = (v: number) => isInt(v) && (L.neg || v >= 0);
  return make(rng, {
    key: `ar.${p.key}`,
    text: 'Илэрхийллийн утгыг ол.',
    lines: [p.expr],
    correct: optNum(p.val),
    wrong: p.wrong.filter(ok).map((v) => optNum(v)),
    more: nearInts(rng, p.val, (v) => optNum(v), { ok, spread: 4 }),
    explanation: p.expl,
    time: L.d === 0 ? 12 : L.d === 1 ? 20 : 25,
    check: { kind: 'value', expr: p.expr },
  });
}

export default generateArithmetic;

