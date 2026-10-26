// Квадрат тэгшитгэл: x² = k, factored form, x² + px + q = 0 with integer roots,
// Vieta, discriminant / number of roots, rational roots with a ≠ 1, rearranging.

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Opt,
  type OptLike,
  type Rng,
  Fraction,
  attempt,
  chance,
  divisors,
  fmt,
  frac,
  gcd,
  level,
  lin,
  make,
  nearInts,
  opt,
  optFrac,
  optNum,
  optSet,
  pick,
  pn,
  poly,
  randInt,
  randNZ,
  shift,
  weighted,
} from '../util';

export const Q_TWO = 'Хоёр язгууртай';
export const Q_ONE = 'Нэг язгууртай';
export const Q_NONE = 'Бодит язгуургүй';
export const Q_INF = 'Төгсгөлгүй олон язгууртай';

/** Real roots of ax² + bx + c = 0 (ascending), or [] when D < 0. */
export function quadRoots(a: number, b: number, c: number): number[] {
  const D = b * b - 4 * a * c;
  if (D < 0) return [];
  if (D === 0) return [-b / (2 * a)];
  const s = Math.sqrt(D);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)].sort((u, v) => u - v);
}

function twoRoots(L: Level, rng: Rng, max = 9): [number, number] {
  return attempt(() => {
    const r1 = L.neg ? randNZ(rng, -max, max) : randInt(rng, 1, max);
    const r2 = L.neg ? randNZ(rng, -max, max) : randInt(rng, 1, max);
    if (r1 === r2) return null;
    return [Math.min(r1, r2), Math.max(r1, r2)] as [number, number];
  });
}

/** Other integer factor pairs (u, v) of q with u + v ≠ s — "wrong factorization" distractors. */
function otherPairs(q: number, s: number): [number, number][] {
  const out: [number, number][] = [];
  if (q === 0) return out;
  for (const d of divisors(Math.abs(q))) {
    const e = q / d;
    for (const [u, v] of [
      [d, e],
      [-d, -e],
    ] as [number, number][]) {
      if (u + v !== s && u <= v) out.push([u, v]);
    }
  }
  return out;
}

const rootsOpt = (vals: Array<number | Fraction>): Opt => optSet(vals);

function quadQ(
  rng: Rng,
  key: string,
  text: string,
  line: string,
  ask: 'roots' | 'sum' | 'product' | 'sumsq' | 'disc' | 'count' | 'max' | 'min',
  correct: Opt,
  wrong: OptLike[],
  more: (i: number) => OptLike,
  explanation: string,
  time?: number,
): GenQuestion {
  return make(rng, {
    key,
    text,
    lines: [line],
    correct,
    wrong,
    more,
    explanation,
    time,
    check: { kind: 'quad', equation: line, ask },
  });
}

/** Random root-set distractor near the given roots. */
function nearRoots(rng: Rng, rs: number[]): () => Opt {
  return () => rootsOpt(rs.map((r) => r + randInt(rng, -2, 2)));
}

/** x² = k, x² − k = 0, ax² = b, x² + k = 0 */
function famSquare(L: Level, rng: Rng): GenQuestion {
  const r = randInt(rng, 2, 6 + 3 * L.g);
  const kind = weighted(rng, [
    ['eq', 3],
    ['zero', 2],
    ['coef', L.g >= 1 ? 2 : 0],
    ['none', L.d === 2 && L.g >= 1 ? 1 : 0],
  ] as const);
  const sq = r * r;
  if (kind === 'none') {
    const line = `x² + ${sq} = 0`;
    return quadQ(rng, `quad.none:${sq}`, 'Тэгшитгэлийг бод.', line, 'roots', opt(Q_NONE),
      [rootsOpt([-r, r]), rootsOpt([-sq, sq]), rootsOpt([-r])], nearRoots(rng, [-r, r]),
      `x² = ${fmt(-sq)} болно. Квадрат нь сөрөг байх бодит тоо байхгүй тул бодит язгуургүй.`);
  }
  if (kind === 'coef') {
    const a = randInt(rng, 2, 5);
    const line = `${a}x² = ${a * sq}`;
    return quadQ(rng, `quad.coef:${a},${sq}`, 'Тэгшитгэлийг бод.', line, 'roots', rootsOpt([-r, r]),
      [rootsOpt([-sq, sq]), rootsOpt([r]), rootsOpt([-a * r, a * r]), (a * sq) % 2 === 0 ? rootsOpt([-(a * sq) / 2, (a * sq) / 2]) : null],
      () => rootsOpt([-(r + randNZ(rng, -2, 2)), r + randNZ(rng, -2, 2)]),
      `x² = ${a * sq} : ${a} = ${sq} ⇒ x = ±${r}.`);
  }
  const line = kind === 'eq' ? `x² = ${sq}` : `x² − ${sq} = 0`;
  return quadQ(rng, `quad.sq:${kind},${sq}`, 'Тэгшитгэлийг бод.', line, 'roots', rootsOpt([-r, r]),
    [rootsOpt([r]), rootsOpt([-sq, sq]), sq % 2 === 0 ? rootsOpt([-sq / 2, sq / 2]) : null, rootsOpt([sq])],
    () => {
      const s = r + randNZ(rng, -2, 2);
      return s > 0 ? rootsOpt([-s, s]) : null;
    },
    `${kind === 'zero' ? `x² = ${sq} ⇒ ` : ''}x = ±√${sq} = ±${r}.`);
}

/** (x − r₁)(x − r₂) = 0 and x(x − r) = 0 */
function famFactored(L: Level, rng: Rng): GenQuestion {
  let [r1, r2] = twoRoots(L, rng);
  if (chance(rng, 0.25)) r1 = 0;
  if (r1 === r2) r2 += 1;
  const line = r1 === 0 ? `x${shift('x', -r2)} = 0` : `${shift('x', -r1)}${shift('x', -r2)} = 0`;
  const zero1 = r1 === 0 ? 'x = 0' : `${lin([[1, 'x']], -r1)} = 0`;
  return quadQ(rng, `quad.fac:${r1},${r2}`, 'Тэгшитгэлийг бод.', line, 'roots', rootsOpt([r1, r2]),
    [rootsOpt([-r1, -r2]), rootsOpt([r1, -r2]), rootsOpt([-r1, r2]), rootsOpt([r2])],
    nearRoots(rng, [r1, r2]),
    `Үржвэр тэгтэй тэнцүү бол аль нэг үржигдэхүүн нь тэг: ${zero1} эсвэл ${lin([[1, 'x']], -r2)} = 0 ⇒ x = ${fmt(r1)}; ${fmt(r2)}.`);
}

/** x² + px + q = 0 with integer roots; ask roots / larger / smaller root. */
function famPQ(L: Level, rng: Rng): GenQuestion {
  const [r1, r2] = twoRoots(L, rng, L.d === 2 ? 12 : 9);
  const p = -(r1 + r2);
  const q = r1 * r2;
  const line = `${poly(1, p, q)} = 0`;
  const others = otherPairs(q, r1 + r2);
  const fact = `${shift('x', -r1)}${shift('x', -r2)}`;
  const expl = `${poly(1, p, q)} = ${fact} = 0 ⇒ x = ${fmt(r1)}; ${fmt(r2)}.`;
  const ask = weighted(rng, [
    ['roots', 2],
    ['max', 1],
    ['min', 1],
  ] as const);
  if (ask === 'roots') {
    return quadQ(rng, `quad.pq:${p},${q}`, 'Тэгшитгэлийг бод.', line, 'roots', rootsOpt([r1, r2]),
      [rootsOpt([-r1, -r2]), ...others.map((o) => rootsOpt(o)), rootsOpt([r1, -r2])], nearRoots(rng, [r1, r2]), expl);
  }
  const val = ask === 'max' ? r2 : r1;
  const oth = ask === 'max' ? r1 : r2;
  return quadQ(rng, `quad.pq${ask}:${p},${q}`, `Тэгшитгэлийн ${ask === 'max' ? 'их' : 'бага'} язгуурыг ол.`, line, ask,
    optNum(val), [optNum(oth), optNum(-val), optNum(-oth), ...others.flat().map((n) => optNum(n))],
    nearInts(rng, val, (n) => optNum(n)), expl);
}

/** Vieta: sum, product, sum of squares. */
function famVieta(L: Level, rng: Rng): GenQuestion {
  if (L.d < 2 || chance(rng, 0.4)) {
    const [r1, r2] = twoRoots(L, rng);
    const p = -(r1 + r2);
    const q = r1 * r2;
    if (p === 0 || p === q || p === -q) return famVieta(L, rng);
    const line = `${poly(1, p, q)} = 0`;
    const ask = L.d === 2 && L.g >= 1 ? 'sumsq' : pick(rng, ['sum', 'product'] as const);
    if (ask === 'sumsq') {
      const S = -p;
      const v = S * S - 2 * q;
      return quadQ(rng, `quad.vss:${p},${q}`, 'Тэгшитгэлийг бодолгүйгээр язгууруудын квадратуудын нийлбэрийг ол.', line,
        'sumsq', optNum(v), [optNum(S * S + 2 * q), optNum(S * S - q), optNum(S * S), optNum(q * q - 2 * S)],
        nearInts(rng, v, (n) => optNum(n)),
        `Виетийн теоремоор нийлбэр ${fmt(S)}, үржвэр ${fmt(q)}. Квадратуудын нийлбэр ${pn(S)}² − 2 · ${pn(q)} = ${fmt(v)}.`);
    }
    const isSum = ask === 'sum';
    const v = isSum ? -p : q;
    return quadQ(rng, `quad.v${ask}:${p},${q}`,
      `Тэгшитгэлийг бодолгүйгээр язгууруудын ${isSum ? 'нийлбэрийг' : 'үржвэрийг'} ол.`, line, ask, optNum(v),
      isSum ? [optNum(p), optNum(q), optNum(-q)] : [optNum(-q), optNum(p), optNum(-p)],
      nearInts(rng, v, (n) => optNum(n)),
      `Виетийн теоремоор язгууруудын ${isSum ? `нийлбэр −b/a = ${fmt(v)}` : `үржвэр c/a = ${fmt(v)}`}.`);
  }
  // a ≠ 1: answers are fractions
  return attempt(() => {
    const a = randInt(rng, 2, 5);
    const b = randNZ(rng, -12, 12);
    const c = randNZ(rng, -10, 10);
    if (b * b - 4 * a * c <= 0 || gcd(gcd(a, b), c) > 1) return null;
    const S = frac(-b, a);
    const P = frac(c, a);
    if (S.isInt() && P.isInt()) return null;
    const line = `${poly(a, b, c)} = 0`;
    const isSum = chance(rng, 0.5);
    const v = isSum ? S : P;
    const wrong = isSum ? [frac(b, a), frac(-b), P, frac(c, -a)] : [frac(-c, a), frac(c), S, frac(a, c)];
    return quadQ(rng, `quad.va${isSum ? 's' : 'p'}:${a},${b},${c}`,
      `Тэгшитгэлийг бодолгүйгээр язгууруудын ${isSum ? 'нийлбэрийг' : 'үржвэрийг'} ол.`, line, isSum ? 'sum' : 'product',
      optFrac(v), wrong.map((f) => optFrac(f)),
      () => optFrac(v.add(frac(randNZ(rng, -3, 3), a))),
      `Виетийн теоремоор ${isSum ? `нийлбэр −b/a = ${fmt(-b)}/${a}` : `үржвэр c/a = ${fmt(c)}/${a}`} = ${v.toString()}.`);
  });
}

function discText(a: number, b: number, c: number): string {
  const D = b * b - 4 * a * c;
  const t = 4 * a * c;
  return `D = ${pn(b)}² − 4 · ${pn(a)} · ${pn(c)} = ${fmt(b * b)}${t >= 0 ? ` − ${fmt(t)}` : ` + ${fmt(-t)}`} = ${fmt(D)}`;
}

function randQuad(L: Level, rng: Rng): [number, number, number] {
  return attempt(() => {
    const a = L.neg ? randNZ(rng, -3, 3) : randInt(rng, 1, 3);
    const b = L.neg ? randNZ(rng, -9, 9) : randNZ(rng, -9, 9);
    const c = L.neg ? randNZ(rng, -9, 9) : randInt(rng, 1, 9);
    if (gcd(gcd(a, b), c) > 1) return null;
    return [a, b, c] as [number, number, number];
  });
}

/** Discriminant value. */
function famDisc(L: Level, rng: Rng): GenQuestion {
  const [a, b, c] = randQuad(L, rng);
  const D = b * b - 4 * a * c;
  const line = `${poly(a, b, c)} = 0`;
  return quadQ(rng, `quad.disc:${a},${b},${c}`, 'Квадрат тэгшитгэлийн дискриминантыг ол.', line, 'disc', optNum(D),
    [optNum(b * b + 4 * a * c), optNum(4 * a * c - b * b), optNum(b * b - 2 * a * c), optNum(b - 4 * a * c), optNum(b * b - a * c)],
    nearInts(rng, D, (n) => optNum(n), { spread: 6 }),
    `${discText(a, b, c)}.`);
}

/** Number of real roots by the discriminant. */
function famCount(L: Level, rng: Rng): GenQuestion {
  const kind = pick(rng, ['two', 'one', 'none'] as const);
  const [a, b, c] = attempt(() => {
    if (kind === 'one') {
      const k = L.neg ? randNZ(rng, -2, 2) : randInt(rng, 1, 2);
      const r = randNZ(rng, -6, 6);
      return [k, -2 * k * r, k * r * r] as [number, number, number];
    }
    const t = randQuad(L, rng);
    const D = t[1] * t[1] - 4 * t[0] * t[2];
    if (kind === 'two' ? D <= 0 : D >= 0) return null;
    return t;
  });
  const D = b * b - 4 * a * c;
  const correct = D > 0 ? Q_TWO : D === 0 ? Q_ONE : Q_NONE;
  const line = `${poly(a, b, c)} = 0`;
  const tail = D > 0 ? '> 0 тул хоёр язгууртай' : D === 0 ? 'тул нэг язгууртай' : '< 0 тул бодит язгуургүй';
  return quadQ(rng, `quad.count:${a},${b},${c}`, 'Тэгшитгэл хэдэн бодит язгууртай вэ?', line, 'count', opt(correct),
    [Q_TWO, Q_ONE, Q_NONE, Q_INF].filter((s) => s !== correct).map((s) => opt(s)), () => null,
    `${discText(a, b, c)} ${tail}.`);
}

/** (px − q)(x − s) = 0 expanded: rational roots q/p and s. */
function famRational(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const p = randInt(rng, 2, 5);
    const q = L.neg ? randNZ(rng, -9, 9) : randInt(rng, 1, 9);
    const s = L.neg ? randNZ(rng, -6, 6) : randInt(rng, 1, 6);
    if (gcd(p, q) !== 1) return null;
    const a = p;
    const b = -(p * s + q);
    const c = q * s;
    if (b === 0) return null;
    const r1 = frac(q, p);
    const r2 = frac(s);
    const D = b * b - 4 * a * c;
    const sd = Math.round(Math.sqrt(D));
    const line = `${poly(a, b, c)} = 0`;
    return quadQ(rng, `quad.rat:${a},${b},${c}`, 'Тэгшитгэлийг бод.', line, 'roots', rootsOpt([r1, r2]),
      [rootsOpt([r1.neg(), r2.neg()]), rootsOpt([frac(q), r2]), rootsOpt([frac(p, q), r2]), rootsOpt([r1, r2.neg()]), rootsOpt([r1.neg(), r2])],
      () => rootsOpt([r1.add(randNZ(rng, -1, 1)), r2.add(randInt(rng, -1, 1))]),
      `D = ${fmt(D)}, √D = ${sd}, x = (${fmt(-b)} ± ${sd}) : ${2 * a} ⇒ x = ${optSet([r1, r2], '', false).text}.`,
      30);
  });
}

/** Needs rearranging first: x² = px + q, (x − h)² = k², x(x + p) = q. */
function famRearrange(L: Level, rng: Rng): GenQuestion {
  const kind = pick(rng, ['move', 'square', 'prod'] as const);
  if (kind === 'square') {
    const h = randNZ(rng, L.neg ? -6 : 1, 6);
    const k = randInt(rng, 1, 6);
    const line = `${shift('x', -h)}² = ${k * k}`;
    return quadQ(rng, `quad.sqr:${h},${k}`, 'Тэгшитгэлийг бод.', line, 'roots', rootsOpt([h - k, h + k]),
      [rootsOpt([h - k * k, h + k * k]), rootsOpt([-h - k, -h + k]), rootsOpt([h + k]), rootsOpt([-h - k * k, -h + k * k])],
      nearRoots(rng, [h - k, h + k]),
      `${lin([[1, 'x']], -h)} = ±${k} ⇒ x = ${fmt(h - k)}; ${fmt(h + k)}.`);
  }
  return attempt(() => {
    const [r1, r2] = twoRoots(L, rng, 8);
    const S = r1 + r2;
    const P = r1 * r2;
    if (S === 0 || P === 0) return null;
    if (kind === 'move') {
      const line = `x² = ${lin([[S, 'x']], -P)}`;
      return quadQ(rng, `quad.mv:${S},${P}`, 'Тэгшитгэлийг бод.', line, 'roots', rootsOpt([r1, r2]),
        [rootsOpt([-r1, -r2]), ...otherPairs(P, S).map((o) => rootsOpt(o)), rootsOpt([r1, -r2])],
        nearRoots(rng, [r1, r2]),
        `Бүх гишүүнийг зүүн тал руу шилжүүлбэл ${poly(1, -S, P)} = 0 ⇒ x = ${fmt(r1)}; ${fmt(r2)}.`);
    }
    // x(x + p) = q  ⇔  x² + px − q = 0
    const p = -S;
    const q = -P;
    if (q <= 0) return null;
    const line = `x${shift('x', p)} = ${q}`;
    return quadQ(rng, `quad.prod:${p},${q}`, 'Тэгшитгэлийг бод.', line, 'roots', rootsOpt([r1, r2]),
      [rootsOpt([q, q - p]), rootsOpt([-r1, -r2]), rootsOpt([0, -p]), rootsOpt([r1, -r2])],
      nearRoots(rng, [r1, r2]),
      `Хаалтыг задалж бүгдийг зүүн тал руу шилжүүлбэл ${poly(1, p, -q)} = 0 ⇒ x = ${fmt(r1)}; ${fmt(r2)}.`);
  });
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generateQuadratic(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famSquare, 4],
          [famFactored, 4],
          [famPQ, L.g >= 1 ? 1.5 : 0.5],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famPQ, 4],
            [famVieta, 2],
            [famDisc, L.g >= 1 ? 1.5 : 0.5],
            [famCount, L.g >= 1 ? 1.5 : 0.5],
            [famFactored, 1],
            [famSquare, 1],
          ])
        : weighted<Fam>(rng, [
            [famPQ, L.g >= 1 ? 1 : 3],
            [famRational, L.g >= 1 ? 3 : 1],
            [famRearrange, 3],
            [famVieta, L.g >= 1 ? 2 : 0.5],
            [famCount, 1],
            [famDisc, 1],
            [famSquare, 0.5],
          ]);
  return fam(L, rng);
}

export default generateQuadratic;
