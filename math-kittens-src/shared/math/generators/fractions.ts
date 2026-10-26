// Энгийн ба аравтын бутархай: same / different denominators, × and :, mixed
// numbers, decimals, decimal ↔ fraction, order of operations with fractions.
// Results are reduced; values above 1 are written as mixed numbers ("1 5/12").

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Opt,
  type Rng,
  Fraction,
  MINUS as M,
  attempt,
  chance,
  fmt,
  frac,
  gcd,
  isInt,
  lcm,
  level,
  make,
  nearInts,
  opt,
  optFrac,
  optNum,
  pick,
  randInt,
  sampleUnique,
  weighted,
} from '../util';

const fo = (f: Fraction): Opt => optFrac(f, true);
/** "8/12 = 2/3" or "8/7 = 1 1/7" or just "5/7". */
function show(n: number, d: number): string {
  const f = frac(n, d);
  const raw = `${n < 0 ? M : ''}${Math.abs(n)}/${d}`;
  const fin = f.toMixed();
  return raw === fin ? raw : `${raw} = ${fin}`;
}

function properFrac(rng: Rng, dmin: number, dmax: number): Fraction {
  return attempt(() => {
    const d = randInt(rng, dmin, dmax);
    const n = randInt(rng, 1, d - 1);
    return gcd(n, d) === 1 ? frac(n, d) : null;
  });
}

function fq(
  L: Level,
  rng: Rng,
  key: string,
  text: string,
  expr: string,
  res: Fraction,
  wrong: Array<Fraction | null>,
  explanation: string,
  time?: number,
): GenQuestion {
  const ok = (f: Fraction | null): f is Fraction => !!f && (L.neg || f.n >= 0);
  return make(rng, {
    key,
    text,
    lines: [expr],
    correct: fo(res),
    wrong: wrong.filter(ok).map(fo),
    more: () => {
      const f = res.add(frac(randInt(rng, -3, 3) || 1, res.d === 1 ? randInt(rng, 2, 6) : res.d));
      return ok(f) ? fo(f) : null;
    },
    explanation,
    time,
    check: { kind: 'value', expr },
  });
}

/** a/n ± b/n */
function famSame(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const n = randInt(rng, 3, 9 + 3 * L.g);
    const a = randInt(rng, 1, n - 1);
    const b = randInt(rng, 1, n - 1);
    if (gcd(a, n) !== 1 || gcd(b, n) !== 1 || a === b) return null;
    const plus = chance(rng, 0.55) || (!L.neg && a < b);
    const num = plus ? a + b : a - b;
    const op = plus ? '+' : M;
    return fq(L, rng, `fr.same:${a},${op},${b},${n}`, 'Илэрхийллийн утгыг ол.', `${a}/${n} ${op} ${b}/${n}`, frac(num, n),
      [frac(num, 2 * n), frac(plus ? a - b : a + b, n), frac(num + 1, n), frac(a * b, n)],
      `Хуваарь ижил тул хүртвэрүүдийг ${plus ? 'нэмнэ' : 'хасна'}: ${show(num, n)}.`, L.d === 0 ? 15 : undefined);
  });
}

const BASES = [
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 4],
  [2, 5],
  [3, 5],
  [4, 5],
  [5, 6],
  [3, 7],
  [3, 8],
  [5, 8],
] as const;

/** Which fraction equals a/b? */
function famEquiv(L: Level, rng: Rng): GenQuestion {
  const [a, b] = pick(rng, BASES);
  const k = randInt(rng, 2, 5 + L.g);
  const raw = (n: number, d: number) => opt(`${n}/${d}`, n / d);
  const k2 = k + 1;
  return make(rng, {
    key: `fr.eq:${a},${b},${k}`,
    text: `Аль бутархай ${a}/${b} бутархайтай тэнцүү вэ?`,
    correct: raw(k * a, k * b),
    wrong: [raw(a + k, b + k), raw(k * a, b + k), raw(k * a + 1, k * b), raw(k * a, k * b + 1), raw(k * a, k2 * b), raw(k * b, k * a)],
    more: () => raw(k * a + randInt(rng, -2, 2), k * b + randInt(rng, 1, 3)),
    explanation: `${a}/${b} бутархайн хүртвэр, хуваарийг ${k} тоогоор үржүүлбэл ${k * a}/${k * b} гарна.`,
    time: 15,
    check: { kind: 'value', expr: `${a}/${b}` },
  });
}

/** a/b of N */
function famOf(L: Level, rng: Rng): GenQuestion {
  const f = properFrac(rng, 2, 9);
  const N = f.d * randInt(rng, 2, 8 + 4 * L.g);
  const r = (N / f.d) * f.n;
  return make(rng, {
    key: `fr.of:${N},${f.n},${f.d}`,
    text: `${N} тооны ${f.toString()} хэсэг хэд вэ?`,
    correct: optNum(r),
    wrong: [(N * f.d) / f.n, N / f.d, N / f.n, N * f.n, N - r].filter((x) => isInt(x) && x > 0 && x !== N).map((x) => optNum(x)),
    more: nearInts(rng, r, (x) => optNum(x), { ok: (x) => x > 0 && x !== N }),
    explanation: f.n === 1 ? `${N} : ${f.d} = ${r}.` : `${N} : ${f.d} · ${f.n} = ${N / f.d} · ${f.n} = ${r}.`,
    time: 15,
    check: { kind: 'value', expr: `${N} · ${f.toString()}` },
  });
}

/** a/b ± c/d with different denominators */
function famDiff(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const dmax = 8 + 2 * L.g;
    let f1 = properFrac(rng, 2, dmax);
    const f2 = properFrac(rng, 2, dmax);
    if (f1.d === f2.d) return null;
    const l = lcm(f1.d, f2.d);
    if (l > 30 + 12 * L.g) return null;
    if (L.neg && L.d >= 1 && chance(rng, 0.3)) f1 = f1.neg();
    const plus = chance(rng, 0.55);
    const res = plus ? f1.add(f2) : f1.sub(f2);
    if (!L.neg && res.n < 0) return null;
    const op = plus ? '+' : M;
    const sg = plus ? 1 : -1;
    const n1 = (f1.n * l) / f1.d;
    const n2 = (f2.n * l) / f2.d;
    return fq(L, rng, `fr.diff:${f1},${op},${f2}`, 'Илэрхийллийн утгыг ол.', `${f1.toString()} ${op} ${f2.toString()}`, res,
      [frac(f1.n + sg * f2.n, f1.d + f2.d), frac(f1.n + sg * f2.n, f1.d * f2.d), plus ? f1.sub(f2) : f1.add(f2), frac(n1 + sg * n2 + 1, l)],
      `Ерөнхий хуваарь ${l}: ${fmt(n1)}/${l} ${op} ${n2}/${l} = ${show(n1 + sg * n2, l)}.`);
  });
}

/** a/b · c/d */
function famMul(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const intFirst = chance(rng, 0.25);
    const f1 = intFirst ? frac(randInt(rng, 2, 12)) : properFrac(rng, 2, 9 + L.g);
    const f2 = properFrac(rng, 2, 9 + L.g);
    const res = f1.mul(f2);
    if (res.d > 40) return null;
    const a = f1.n,
      b = f1.d,
      c = f2.n,
      d = f2.d;
    return fq(L, rng, `fr.mul:${f1},${f2}`, 'Илэрхийллийн утгыг ол.', `${f1.toString()} · ${f2.toString()}`, res,
      [f1.div(f2), frac(a + c, b + d), frac(a * c, b + d), intFirst ? frac(a * c, a * d) : frac(a * d, b * c).inv()],
      `Хүртвэрийг хүртвэрээр, хуваарийг хуваариар үржүүлнэ: ${show(a * c, b * d)}.`);
  });
}

/** a/b : c/d */
function famDiv(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const f1 = chance(rng, 0.2) ? frac(randInt(rng, 2, 9)) : properFrac(rng, 2, 9 + L.g);
    const f2 = properFrac(rng, 2, 9 + L.g);
    if (f1.eq(f2)) return null;
    const res = f1.div(f2);
    if (res.d > 40 || res.n > 60) return null;
    return fq(L, rng, `fr.div:${f1},${f2}`, 'Илэрхийллийн утгыг ол.', `${f1.toString()} : ${f2.toString()}`, res,
      [f1.mul(f2), f2.div(f1), frac(f1.n * f2.n, f1.d + f2.d), res.add(frac(1, res.d === 1 ? 2 : res.d))],
      `Хуваагчийг урвуу бутархайгаар солиод үржүүлнэ: ${f1.toString()} · ${f2.inv().toString()} = ${show(f1.n * f2.d, f1.d * f2.n)}.`);
  });
}

/* ------------------------------ decimals ------------------------------ */

function decQ(
  L: Level,
  rng: Rng,
  key: string,
  expr: string,
  r: number,
  wrong: number[],
  explanation: string,
  places: number,
): GenQuestion {
  const scale = 10 ** places;
  const ok = (x: number) => Number.isFinite(x) && x !== r && (L.neg || x >= 0) && isInt(x * 1000);
  return make(rng, {
    key,
    text: 'Илэрхийллийн утгыг ол.',
    lines: [expr],
    correct: optNum(r),
    wrong: wrong.filter(ok).map((x) => optNum(x)),
    more: (i) => {
      const x = Math.round((r + (randInt(rng, -3, 3) || 1) * (i < 20 ? 1 : 10) / scale) * scale) / scale;
      return ok(x) ? optNum(x) : null;
    },
    explanation,
    check: { kind: 'value', expr },
  });
}

function famDecimal(L: Level, rng: Rng): GenQuestion {
  const kind = L.d === 0 ? pick(rng, ['add', 'sub'] as const) : pick(rng, ['add', 'sub', 'mul', 'mul', 'div'] as const);
  if (kind === 'add' || kind === 'sub') {
    return attempt(() => {
      const p1 = L.d === 0 ? 1 : randInt(rng, 1, 2);
      const p2 = randInt(rng, 1, 2);
      const xi = randInt(rng, 11, 99) * (p1 === 1 ? 10 : 1); // in hundredths
      const yi = randInt(rng, 11, 99) * (p2 === 1 ? 10 : 1);
      if (xi % 10 === 0 && p1 === 2) return null;
      const add = kind === 'add';
      if (!add && !L.neg && xi <= yi) return null;
      const r = (add ? xi + yi : xi - yi) / 100;
      const x = xi / 100;
      const y = yi / 100;
      const mis = (add ? Math.round(x * 10 ** p1) + Math.round(y * 10 ** p2) : Math.round(x * 10 ** p1) - Math.round(y * 10 ** p2)) / 10 ** Math.max(p1, p2);
      const op = add ? '+' : M;
      return decQ(L, rng, `fr.dec:${x},${op},${y}`, `${fmt(x)} ${op} ${fmt(y)}`, r,
        [mis, r + 0.1, r - 0.1, r * 10, r + 1, r - 1],
        `Таслалыг таслалын доор бичиж ${add ? 'нэмбэл' : 'хасвал'} ${fmt(r)}.`, 2);
    });
  }
  if (kind === 'mul') {
    const xi = randInt(rng, 2, 25);
    const yi = randInt(rng, 2, 9);
    const intY = chance(rng, 0.3);
    const x = xi / 10;
    const y = intY ? yi : yi / 10;
    const r = Math.round(xi * yi * (intY ? 10 : 1)) / 100;
    const places = intY ? 1 : 2;
    return decQ(L, rng, `fr.dmul:${x},${y}`, `${fmt(x)} · ${fmt(y)}`, r, [r * 10, r / 10, x + y, r + 0.1],
      `Таслалгүйгээр ${xi} · ${yi} = ${xi * yi}, үржигдэхүүнүүдэд таслалаас хойш нийт ${places} орон байгаа тул ${fmt(r)}.`, places);
  }
  const yj = randInt(rng, 2, 9);
  const r = randInt(rng, 2, 12);
  const y = yj / 10;
  const x = (r * yj) / 10;
  return decQ(L, rng, `fr.ddiv:${x},${y}`, `${fmt(x)} : ${fmt(y)}`, r, [r / 10, r * 10, r + 1, r / 100],
    `Хоёуланг нь 10 дахин ихэсгэвэл ${r * yj} : ${yj} = ${r}.`, 1);
}

const DEC: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 8], [3, 8], [5, 8], [7, 8],
  [1, 20], [3, 20], [7, 20], [9, 20], [3, 2], [9, 4], [7, 4], [1, 25], [3, 25], [6, 5],
];

/** decimal ↔ fraction */
function famConvert(L: Level, rng: Rng): GenQuestion {
  const [n, d] = pick(rng, L.d === 0 ? DEC.slice(0, 7) : DEC);
  const f = frac(n, d);
  const dec = n / d;
  const others = sampleUnique(rng, DEC.filter(([a, b]) => a / b !== dec), 4).map(([a, b]) => frac(a, b));
  const ds = fmt(dec);
  if (chance(rng, 0.5)) {
    const digits = ds.replace(/^\d+,/, '');
    const wrongPow = frac(Number(ds.replace(',', '')), 10 ** Math.max(1, digits.length - 1));
    return make(rng, {
      key: `fr.d2f:${n},${d}`,
      text: 'Аравтын бутархайг энгийн бутархайгаар илэрхийл.',
      lines: [`${ds} = ?`],
      correct: fo(f),
      wrong: [wrongPow, ...others].map(fo),
      explanation: `${ds} = ${Number(ds.replace(',', ''))}/${10 ** digits.length} = ${f.toMixed()}.`,
      time: 20,
      check: { kind: 'value', expr: ds },
    });
  }
  const concat = Number(`0.${n}${d}`);
  const swapped = Number(`0.${d}${n}`);
  const naive = Number(`${n}.${d}`);
  return make(rng, {
    key: `fr.f2d:${n},${d}`,
    text: 'Энгийн бутархайг аравтын бутархайгаар бич.',
    lines: [`${f.toMixed()} = ?`],
    correct: optNum(dec),
    wrong: [concat, swapped, naive, ...others.map((o) => o.value)].filter((x) => x !== dec).map((x) => optNum(x)),
    explanation: `${f.toString()} = ${n} : ${d} = ${ds}.`,
    time: 20,
    check: { kind: 'value', expr: f.toMixed() },
  });
}

/* ---------------------------- mixed numbers ---------------------------- */

const MD = [2, 3, 4, 5, 6, 8] as const;

function mixedNum(rng: Rng, wmax: number): Fraction {
  return attempt(() => {
    const q = pick(rng, MD);
    const p = randInt(rng, 1, q - 1);
    if (gcd(p, q) !== 1) return null;
    return frac(randInt(rng, 1, wmax) * q + p, q);
  });
}

const whole = (f: Fraction) => Math.floor(f.n / f.d);
const part = (f: Fraction) => f.sub(whole(f));

function famMixed(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const kind = pick(rng, ['add', 'sub', 'mul', 'div'] as const);
    const m1 = mixedNum(rng, kind === 'mul' || kind === 'div' ? 3 : 5);
    const m2 = mixedNum(rng, kind === 'mul' || kind === 'div' ? 2 : 4);
    if (m1.eq(m2)) return null;
    const w1 = whole(m1),
      w2 = whole(m2),
      r1 = part(m1),
      r2 = part(m2);
    let res: Fraction;
    let wrong: Array<Fraction | null>;
    let op: string;
    if (kind === 'add') {
      op = '+';
      res = m1.add(m2);
      wrong = [frac(r1.n + r2.n, r1.d + r2.d).add(w1 + w2), frac(w1 + w2).add(r1.mul(r2)), res.add(1), res.sub(1)];
    } else if (kind === 'sub') {
      if (m1.value <= m2.value) return null;
      op = M;
      res = m1.sub(m2);
      const borrow = frac(w1 - w2).add(r1.sub(r2).value < 0 ? r2.sub(r1) : r1.sub(r2));
      wrong = [borrow, m1.add(m2), res.add(1), frac(w1 - w2)];
    } else if (kind === 'mul') {
      op = '·';
      res = m1.mul(m2);
      wrong = [frac(w1 * w2).add(r1.mul(r2)), m1.add(m2), frac(w1 * w2), res.sub(1)];
    } else {
      op = ':';
      res = m1.div(m2);
      wrong = [m1.mul(m2), m2.div(m1), frac(w1, w2).add(r1.div(r2)), res.add(1)];
    }
    if (res.d > 48 || Math.abs(res.value) > 30 || res.n <= 0) return null;
    const expr = `${m1.toMixed()} ${op} ${m2.toMixed()}`;
    return fq(L, rng, `fr.mix:${expr}`, 'Илэрхийллийн утгыг ол.', expr, res, wrong,
      `Зөв биш бутархай болговол ${m1.toString()} ${op} ${m2.toString()} = ${res.toString()}${res.isInt() || res.value < 1 ? '' : ` = ${res.toMixed()}`}.`,
      30);
  });
}

/** Order of operations with fractions. */
function famCombo(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const f1 = properFrac(rng, 2, 6);
    const f2 = properFrac(rng, 2, 6);
    const f3 = properFrac(rng, 2, 6);
    const kind = pick(rng, ['A', 'B', 'C'] as const);
    let expr: string;
    let res: Fraction;
    let wrong: Fraction[];
    let expl: string;
    const [a, b, c] = [f1.toString(), f2.toString(), f3.toString()];
    if (kind === 'A') {
      const s = f1.add(f2);
      res = s.div(f3);
      expr = `(${a} + ${b}) : ${c}`;
      wrong = [f1.add(f2.div(f3)), s.mul(f3), f1.add(f2).add(f3)];
      expl = `Хаалтан доторх ${a} + ${b} = ${s.toString()}, дараа нь ${s.toString()} : ${c} = ${res.toMixed()}.`;
    } else if (kind === 'B') {
      const p = f1.mul(f2);
      res = p.add(f3);
      expr = `${a} · ${b} + ${c}`;
      wrong = [f1.mul(f2.add(f3)), f1.add(f2).add(f3), p.sub(f3)];
      expl = `Эхлээд үржвэр ${a} · ${b} = ${p.toString()}, дараа нь ${p.toString()} + ${c} = ${res.toMixed()}.`;
    } else {
      const p = f2.mul(f3);
      res = f1.sub(p);
      expr = `${a} ${M} ${b} · ${c}`;
      wrong = [f1.sub(f2).mul(f3), f1.add(p), f1.sub(f2).sub(f3)];
      expl = `Эхлээд үржвэр ${b} · ${c} = ${p.toString()}, дараа нь ${a} ${M} ${p.toString()} = ${res.toMixed()}.`;
    }
    if (res.d > 36 || (!L.neg && res.n < 0) || res.n === 0) return null;
    return fq(L, rng, `fr.combo:${expr}`, 'Илэрхийллийн утгыг ол.', expr, res, wrong, expl, 30);
  });
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generateFractions(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famSame, 3],
          [famEquiv, 2],
          [famOf, 2],
          [famDecimal, 2],
          [famConvert, 1],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famDiff, 3],
            [famMul, 2],
            [famDiv, 2],
            [famDecimal, 2],
            [famConvert, 1.5],
          ])
        : weighted<Fam>(rng, [
            [famMixed, 4],
            [famCombo, 3],
            [famDiff, 1],
            [famDecimal, 1],
          ]);
  return fam(L, rng);
}

export default generateFractions;
