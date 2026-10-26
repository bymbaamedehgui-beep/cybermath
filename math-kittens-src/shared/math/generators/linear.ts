// Шугаман тэгшитгэл: ax + b = c, a(x + b) = c, ax + b = cx + d, fractional
// coefficients and short word problems. Always built from an integer root.

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Rng,
  attempt,
  MINUS,
  chance,
  coef,
  countWord,
  fmt,
  isInt,
  lcm,
  level,
  lin,
  make,
  nearInts,
  optNum,
  pick,
  plus,
  randInt,
  randNZ,
  shift,
  weighted,
} from '../util';

function root(L: Level, rng: Rng): number {
  if (!L.neg) return randInt(rng, 1, L.d === 0 ? 10 : 15);
  return randNZ(rng, -9, 12);
}

/** Integer distractors only (they must look like the answer). */
function ints(L: Level, vals: number[]): number[] {
  return vals.filter((v) => isInt(v) && (L.neg || v >= 0));
}

function q(
  L: Level,
  rng: Rng,
  key: string,
  line: string,
  x0: number,
  wrong: number[],
  explanation: string,
  text = 'Тэгшитгэлийг бод.',
): GenQuestion {
  return make(rng, {
    key,
    text,
    lines: [line],
    correct: optNum(x0),
    wrong: ints(L, wrong).map((n) => optNum(n)),
    more: nearInts(rng, x0, (n) => optNum(n), { ok: (n) => L.neg || n >= 0 }),
    explanation,
    check: { kind: 'root', equation: line, variable: 'x' },
  });
}

/** x + b = c, x − b = c, ax = c, x : a = b */
function famSimple(L: Level, rng: Rng): GenQuestion {
  const kind = pick(rng, ['add', 'sub', 'mul', 'div'] as const);
  if (kind === 'add' || kind === 'sub') {
    return attempt(() => {
      const x = root(L, rng);
      const b = randInt(rng, 2, 20 + 10 * L.g);
      const s = kind === 'add' ? b : -b;
      const c = x + s;
      if (!L.neg && c <= 0) return null;
      const line = `x${plus(s)} = ${fmt(c)}`;
      return q(L, rng, `lin.s:${s},${c}`, line, x, [c + s, c, -x, x + 1],
        `Тоог баруун тал руу эсрэг тэмдэгтэй шилжүүлбэл x = ${fmt(c)}${plus(-s)} = ${fmt(x)}.`);
    });
  }
  const x = root(L, rng);
  const a = randInt(rng, 2, 9);
  if (kind === 'mul') {
    const c = a * x;
    const line = `${a}x = ${fmt(c)}`;
    return q(L, rng, `lin.m:${a},${c}`, line, x, [c - a, c * a, c + a, -x],
      `Хоёр талыг x-ийн коэффициентод хуваавал x = ${fmt(c)} : ${a} = ${fmt(x)}.`);
  }
  const big = a * x;
  const line = `x : ${a} = ${fmt(x)}`;
  return q(L, rng, `lin.d:${a},${x}`, line, big, [x / a, x + a, x - a, big + a],
    `x = ${fmt(x)} · ${a} = ${fmt(big)}.`);
}

/** ax + b = c */
function famAxb(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const x = root(L, rng);
    const a = L.neg && L.d >= 1 && chance(rng, 0.3) ? -randInt(rng, 2, 6) : randInt(rng, 2, 5 + 2 * L.g);
    const b = L.neg ? randNZ(rng, -20, 20) : randInt(rng, 1, 20);
    const c = a * x + b;
    if (!L.neg && c <= 0) return null;
    const line = `${lin([[a, 'x']], b)} = ${fmt(c)}`;
    return q(L, rng, `lin.axb:${a},${b},${c}`, line, x, [(c + b) / a, c - b, (c - b) * a, -x, x + 1],
      `Сул гишүүнийг баруун тал руу шилжүүлбэл ${lin([[a, 'x']])} = ${fmt(c - b)} ⇒ x = ${fmt(x)}.`);
  });
}

/** a(x + b) = c */
function famParen(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const x = root(L, rng);
    const a = (L.neg && chance(rng, 0.3) ? -1 : 1) * randInt(rng, 2, 6);
    const b = L.neg ? randNZ(rng, -9, 9) : randInt(rng, 1, 9);
    const c = a * (x + b);
    if (c === 0) return null;
    const line = `${coef(a)}${shift('x', b)} = ${fmt(c)}`;
    return q(L, rng, `lin.par:${a},${b},${c}`, line, x, [c / a + b, (c - b) / a, c - a * b, -x, x + 1],
      `Хаалтыг задалбал ${lin([[a, 'x']], a * b)} = ${fmt(c)} ⇒ ${lin([[a, 'x']])} = ${fmt(c - a * b)} ⇒ x = ${fmt(x)}.`);
  });
}

/** ax + b = cx + d */
function famBoth(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const x = root(L, rng);
    const k = L.neg ? randNZ(rng, -5, 5) : randInt(rng, 1, 5);
    const c = L.neg ? randNZ(rng, -6, 7) : randInt(rng, 1, 7);
    const a = c + k;
    if (a === 0 || a === c) return null;
    const b = L.neg ? randInt(rng, -15, 15) : randInt(rng, 0, 15);
    const d = k * x + b;
    if (!L.neg && d < 0) return null;
    const line = `${lin([[a, 'x']], b)} = ${lin([[c, 'x']], d)}`;
    return q(L, rng, `lin.both:${a},${b},${c},${d}`, line, x, [(d - b) / (a + c), (d + b) / (a - c), (b - d) / (a - c), x + 1, x - 1],
      `x агуулсан гишүүдийг зүүн тал руу, тоонуудыг баруун тал руу шилжүүлбэл ${lin([[k, 'x']])} = ${fmt(d - b)} ⇒ x = ${fmt(x)}.`);
  });
}

/** a(x + b) + c = d(x + e) */
function famBothParen(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const x = root(L, rng);
    const a = randNZ(rng, L.neg ? -5 : 2, 5);
    const d = randNZ(rng, L.neg ? -4 : 1, 4);
    if (a === d || Math.abs(a) === 1) return null;
    const b = randNZ(rng, L.neg ? -6 : 1, 6);
    const e = randNZ(rng, L.neg ? -6 : 1, 6);
    const c = d * (x + e) - a * (x + b);
    if (Math.abs(c) > 25) return null;
    const lhs = `${coef(a)}${shift('x', b)}${plus(c)}`;
    const rhs = d === 1 ? lin([[1, 'x']], e) : `${coef(d)}${shift('x', e)}`;
    const line = `${lhs} = ${rhs}`;
    // forgot to multiply the second term inside the bracket: a·x + b
    const slip = (d * e - b - c) / (a - d);
    return q(L, rng, `lin.bp:${a},${b},${c},${d},${e}`, line, x, [slip, -x, (d * e + a * b + c) / (a - d), x + 1, x - 1],
      `Хаалтуудыг задалбал ${lin([[a, 'x']], a * b + c)} = ${lin([[d, 'x']], d * e)} ⇒ ${lin([[a - d, 'x']])} = ${fmt(d * e - a * b - c)} ⇒ x = ${fmt(x)}.`);
  });
}

/** x/a + x/b = c  or  (x + p)/a = (x + q)/b */
function famFrac(L: Level, rng: Rng): GenQuestion {
  if (chance(rng, 0.5)) {
    return attempt(() => {
      const a = randInt(rng, 2, 6);
      const b = randInt(rng, 2, 6);
      if (a >= b) return null;
      const l = lcm(a, b);
      const x = l * (L.neg ? randNZ(rng, -3, 3) : randInt(rng, 1, 3));
      const c = x / a + x / b;
      const minus = chance(rng, 0.3);
      const cc = minus ? x / a - x / b : c;
      if (cc === 0) return null;
      const line = `x/${a} ${minus ? MINUS : '+'} x/${b} = ${fmt(cc)}`;
      return q(L, rng, `lin.fr:${a},${b},${minus ? '-' : '+'},${cc}`, line, x,
        [cc * (a + b), cc * a * b, cc * l, -x, x + l],
        `Хоёр талыг ерөнхий хуваарь болох ${l} тоогоор үржүүлбэл ${lin([[l / a, 'x'], [(minus ? -1 : 1) * (l / b), 'x']])} = ${fmt(cc * l)} ⇒ x = ${fmt(x)}.`,
      );
    });
  }
  return attempt(() => {
    const a = randInt(rng, 2, 5);
    const b = randInt(rng, 2, 5);
    if (a === b) return null;
    const x = root(L, rng);
    const u = L.neg ? randNZ(rng, -4, 4) : randInt(rng, 1, 4);
    const p = a * u - x;
    const qq = b * u - x;
    if (p === qq || (!L.neg && (p < 0 || qq < 0))) return null;
    const num = (s: number) => (s === 0 ? 'x' : `(x${plus(s)})`);
    const line = `${num(p)}/${a} = ${num(qq)}/${b}`;
    return q(L, rng, `lin.prop:${a},${p},${b},${qq}`, line, x,
      [(a * qq - b * p) / (a - b), (a * qq + b * p) / (b - a), -x, x + 1],
      `Хөндлөн үржүүлбэл ${b}${shift('x', p)} = ${a}${shift('x', qq)} ⇒ ${lin([[b - a, 'x']])} = ${fmt(a * qq - b * p)} ⇒ x = ${fmt(x)}.`,
    );
  });
}

/* ---------------------------- word problems ---------------------------- */

function wordQ(
  L: Level,
  rng: Rng,
  key: string,
  text: string,
  equation: string,
  x0: number,
  ans: number,
  answerExpr: string,
  wrong: number[],
  explanation: string,
  unit = '',
): GenQuestion {
  const ok = (n: number) => isInt(n) && n > 0;
  const f = (n: number) => optNum(n, unit);
  return make(rng, {
    key,
    text,
    correct: f(ans),
    wrong: wrong.filter(ok).map(f),
    more: nearInts(rng, ans, f, { ok }),
    explanation,
    time: L.d === 0 ? 15 : L.d === 1 ? 22 : 30,
    check: { kind: 'root', equation, variable: 'x', solution: x0, answer: answerExpr },
  });
}

/** "I thought of a number…" */
function wThink(L: Level, rng: Rng): GenQuestion {
  const x = randInt(rng, 2, 12 + 6 * L.g);
  const a = randInt(rng, 2, 6);
  const b = randInt(rng, 1, 20);
  const add = chance(rng, 0.5);
  const c = add ? a * x + b : a * x - b;
  if (c <= 0) return wThink(L, rng);
  const eq = `${a}x ${add ? '+' : MINUS} ${b} = ${c}`;
  return wordQ(L, rng, `lin.think:${a},${add ? b : -b},${c}`,
    `Нэг тоог ${a} дахин ихэсгээд ${b} ${add ? 'нэмбэл' : 'хасвал'} ${c} гарна. Тэр тоог ол.`,
    eq, x, x, 'x', [add ? c - b : c + b, add ? (c + b) / a : (c - b) / a, c / a, x + 1],
    `${eq} ⇒ ${a}x = ${add ? c - b : c + b} ⇒ x = ${x}.`);
}

/** Consecutive integers. */
function wConsec(L: Level, rng: Rng): GenQuestion {
  const n = L.d === 0 ? 2 : pick(rng, [2, 3, 3]);
  const kind = pick(rng, ['натурал', 'тэгш', 'сондгой'] as const);
  const step = kind === 'натурал' ? 1 : 2;
  let first = randInt(rng, 3, 30 + 10 * L.g);
  if (kind === 'тэгш' && first % 2) first += 1;
  if (kind === 'сондгой' && first % 2 === 0) first += 1;
  const nums = Array.from({ length: n }, (_, i) => first + i * step);
  const S = nums.reduce((s, v) => s + v, 0);
  const which = n === 2 ? pick(rng, ['бага', 'их'] as const) : pick(rng, ['бага', 'их', 'дунд'] as const);
  const ans = which === 'бага' ? nums[0] : which === 'их' ? nums[n - 1] : nums[1];
  const word = which === 'бага' ? 'Хамгийн бага' : which === 'их' ? 'Хамгийн их' : 'Дунд';
  const terms = nums.map((_, i) => (i === 0 ? 'x' : `(x + ${i * step})`)).join(' + ');
  const eq = `${terms} = ${S}`;
  const label = n === 2 ? (which === 'бага' ? 'Бага' : 'Их') : word;
  return wordQ(L, rng, `lin.consec:${n},${kind},${S},${which}`,
    `Дараалсан ${countWord(n)} ${kind} тооны нийлбэр ${S}. ${label} тоог ол.`,
    eq, first, ans, `x + ${ans - first}`, [...nums.filter((v) => v !== ans), S / n, ans + step, ans - step, ans + 1],
    `Хамгийн бага тоог x гэвэл ${eq} ⇒ x = ${first}. Тоонууд: ${nums.join(', ')}.`);
}

const ITEMS = [
  { n: 'чихэр', com: 'чихэртэй' },
  { n: 'ном', com: 'номтой' },
  { n: 'марк', com: 'марктай' },
  { n: 'харандаа', com: 'харандаатай' },
] as const;

/** "Ах дүүгээсээ 3 дахин олон чихэртэй…" */
function wSiblings(L: Level, rng: Rng): GenQuestion {
  const it = pick(rng, ITEMS);
  const [older, abl, olderDat] = pick(rng, [
    ['Ах', 'дүүгээсээ', 'ахад'],
    ['Эгч', 'дүүгээсээ', 'эгчид'],
  ] as const);
  const k = randInt(rng, 2, 5);
  const y = randInt(rng, 3, 10 + 5 * L.g);
  const T = (k + 1) * y;
  const askYoung = chance(rng, 0.6);
  const ans = askYoung ? y : k * y;
  const eq = `x + ${k}x = ${T}`;
  return wordQ(L, rng, `lin.sib:${older},${it.n},${k},${T},${askYoung ? 'y' : 'o'}`,
    `${older} ${abl} ${k} дахин олон ${it.com}. Хоёулаа нийт ${T} ${it.com}. ${askYoung ? 'Дүү' : older} хэдэн ${it.com} вэ?`,
    eq, y, ans, askYoung ? 'x' : `${k}x`, askYoung ? [k * y, T / k, T / 2, y + 1] : [y, T / k, T / 2, T - y + k],
    `Дүүд x ${it.n} байна гэвэл ${eq} ⇒ ${k + 1}x = ${T} ⇒ x = ${y}; ${olderDat} ${k * y}.`);
}

/** Rectangle: length is d more than width, perimeter P. */
function wRect(L: Level, rng: Rng): GenQuestion {
  const w = randInt(rng, 2, 12 + 4 * L.g);
  const d = randInt(rng, 1, 8);
  const P = 2 * (2 * w + d);
  const askW = chance(rng, 0.6);
  const ans = askW ? w : w + d;
  const eq = `2(x + x + ${d}) = ${P}`;
  return wordQ(L, rng, `lin.rect:${w},${d},${askW ? 'w' : 'l'}`,
    `Тэгш өнцөгтийн урт нь өргөнөөсөө ${d} см-ээр их, периметр нь ${P} см. ${askW ? 'Өргөнийг' : 'Уртыг'} ол.`,
    eq, w, ans, askW ? 'x' : `x + ${d}`, askW ? [w + d, P / 2 - d, (P - d) / 2, P / 4] : [w, P / 2 - w, (P + d) / 4, P / 4 + d],
    `Өргөнийг x гэвэл ${eq} ⇒ 4x = ${P - 2 * d} ⇒ x = ${w}; урт нь ${w + d} см.`, ' см');
}

/** "In how many years will the mother be k times older?" */
function wAge(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const k = pick(rng, [2, 3]);
    const c = randInt(rng, 3, 12);
    const t = randInt(rng, 1, 14);
    const m = k * (c + t) - t;
    if (m - c < 20 || m > 50) return null;
    const [P, ch, abl] = pick(rng, [
      ['Ээж', 'охин', 'охиноосоо'],
      ['Аав', 'хүү', 'хүүгээсээ'],
    ] as const);
    const eq = `${m} + x = ${k}(${c} + x)`;
    return wordQ(L, rng, `lin.age:${P},${m},${c},${k}`,
      `${P} ${m} настай, ${ch} нь ${c} настай. Хэдэн жилийн дараа ${P.toLowerCase()} ${abl} ${k} дахин их настай болох вэ?`,
      eq, t, t, 'x', [m - k * c, m - c, Math.round(m / k) - c, t + 1],
      `${eq} ⇒ ${m} + x = ${k * c} + ${k}x ⇒ ${k === 2 ? `x = ${t}` : `${k - 1}x = ${m - k * c} ⇒ x = ${t}`}.`);
  });
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generateLinear(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famSimple, L.g === 0 ? 3 : 1],
          [famAxb, 4],
          [famParen, L.g >= 1 ? 1 : 0],
          [wThink, 1.5],
          [wSiblings, 1],
          [wConsec, 1],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famAxb, 1],
            [famParen, 3],
            [famBoth, 3],
            [famFrac, L.g >= 1 ? 1 : 0],
            [wThink, 1],
            [wConsec, 1],
            [wSiblings, 1],
            [wRect, 1],
          ])
        : weighted<Fam>(rng, [
            [famBoth, 1],
            [famBothParen, 3],
            [famFrac, 3],
            [wRect, 1],
            [wAge, 1.5],
            [wConsec, 1],
          ]);
  return fam(L, rng);
}

export default generateLinear;
