// Магадлал: balls in a bag, a die, numbers 1..N, coins, two dice,
// drawing without replacement, "ядаж нэг" via the complement.

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Rng,
  Fraction,
  abl,
  attempt,
  chance,
  dat,
  frac,
  level,
  make,
  optFrac,
  pick,
  randInt,
  sampleUnique,
  weighted,
} from '../util';

const COLORS = ['улаан', 'цэнхэр', 'ногоон', 'шар', 'цагаан', 'хар'] as const;

function pQ(
  rng: Rng,
  key: string,
  text: string,
  p: Fraction,
  wrong: Array<Fraction | null>,
  explanation: string,
  time?: number,
  expr?: string,
  vars?: Record<string, number>,
): GenQuestion {
  const ok = (f: Fraction | null): f is Fraction => !!f && f.n > 0 && f.value < 1;
  const den = p.d;
  return make(rng, {
    key,
    text,
    correct: optFrac(p),
    wrong: wrong.filter(ok).map((f) => optFrac(f)),
    more: () => {
      const f = frac(Math.max(1, p.n + randInt(rng, -2, 2)), Math.max(2, den + randInt(rng, -2, 3)));
      return ok(f) ? optFrac(f) : null;
    },
    explanation,
    time,
    check: expr ? { kind: 'value', expr, vars } : undefined,
  });
}

/** Explanation tail "3/8" or "6/36 = 1/6". */
function fracShow(n: number, d: number): string {
  const f = frac(n, d);
  return f.n === n ? `${n}/${d}` : `${n}/${d} = ${f.toString()}`;
}

function famBag(L: Level, rng: Rng): GenQuestion {
  const k = L.d === 0 ? 2 : pick(rng, [2, 3]);
  const cols = sampleUnique(rng, COLORS, k);
  const counts = cols.map(() => randInt(rng, 1, 6 + 2 * L.g));
  const N = counts.reduce((s, v) => s + v, 0);
  const i = randInt(rng, 0, k - 1);
  const not = L.d >= 1 && chance(rng, 0.35);
  const m = not ? N - counts[i] : counts[i];
  const list = cols.map((c, j) => `${counts[j]} ${c}`).join(', ');
  const p = frac(m, N);
  return pQ(rng, `prob.bag:${counts.join(',')}:${cols.join(',')}:${i}:${not}`,
    `Уутанд ${list} бөмбөг байна. Санамсаргүйгээр нэг бөмбөг авахад ${cols[i]}${not ? ' биш' : ''} байх магадлалыг ол.`,
    p, [frac(N - m, N), N - m > 0 ? frac(m, N - m) : null, frac(1, N), frac(1, k), frac(m + 1, N)],
    `Нийт ${N} бөмбөгөөс ${m} нь таатай тул P = ${fracShow(m, N)}.`, undefined, not ? '(n − c) : n' : 'c : n', { n: N, c: counts[i] });
}

const DIE_EVENTS: ReadonlyArray<{ text: string; ok: (x: number) => boolean }> = [
  { text: 'тэгш тоо', ok: (x) => x % 2 === 0 },
  { text: 'сондгой тоо', ok: (x) => x % 2 === 1 },
  { text: 'анхны тоо', ok: (x) => x === 2 || x === 3 || x === 5 },
  { text: `${dat(3)} хуваагдах тоо`, ok: (x) => x % 3 === 0 },
  ...[1, 2, 3, 4].map((k) => ({ text: `${abl(k)} их тоо`, ok: (x: number) => x > k })),
  ...[3, 4, 5].map((k) => ({ text: `${abl(k)} бага тоо`, ok: (x: number) => x < k })),
  ...[2, 4].map((k) => ({ text: `${abl(k)} ихгүй тоо`, ok: (x: number) => x <= k })),
];

function famDie(L: Level, rng: Rng): GenQuestion {
  const e = pick(rng, DIE_EVENTS);
  const good = [1, 2, 3, 4, 5, 6].filter(e.ok);
  const m = good.length;
  return pQ(rng, `prob.die:${e.text}`, `Шоог нэг удаа хаяхад ${e.text} буух магадлалыг ол.`, frac(m, 6),
    [frac(6 - m, 6), m < 6 ? frac(m, 6 - m) : null, frac(1, 6), frac(m + 1, 6), frac(m - 1, 6)],
    `Таатай үр дүн: ${good.join(', ')} — ${m}, нийт 6 тул P = ${fracShow(m, 6)}.`, L.d === 0 ? 15 : undefined, 'm : 6', { m });
}

function famRange(L: Level, rng: Rng): GenQuestion {
  const N = pick(rng, [10, 12, 15, 20, 24, 30]);
  const k = pick(rng, [2, 3, 4, 5]);
  const m = Math.floor(N / k);
  return pQ(rng, `prob.rng:${N},${k}`,
    `1-ээс ${N} хүртэлх натурал тоонуудаас санамсаргүйгээр нэгийг сонгоход ${dat(k)} хуваагдах тоо гарах магадлалыг ол.`,
    frac(m, N), [frac(m + 1, N), frac(N - m, N), frac(m, N - m), frac(k, N), frac(1, N)],
    `${dat(k)} хуваагдах тоо ${m} ширхэг, нийт ${N} тул P = ${fracShow(m, N)}.`, undefined, 'm : n', { m, n: N });
}

function famCoins(L: Level, rng: Rng): GenQuestion {
  const three = L.d === 2 && chance(rng, 0.5);
  if (!three) {
    const ev = pick(rng, [
      ['хоёулаа сүлд талаараа', 1],
      ['яг нэг нь сүлд талаараа', 2],
      ['ядаж нэг нь сүлд талаараа', 3],
      ['хоёулаа ижил талаараа', 2],
    ] as const);
    const p = frac(ev[1], 4);
    return pQ(rng, `prob.coin2:${ev[0]}`, `Хоёр зоосыг зэрэг хаяхад ${ev[0]} буух магадлалыг ол.`, p,
      [frac(1, 3), frac(2, 3), frac(1, 4), frac(1, 2), frac(3, 4)],
      `Боломжит 4 үр дүн: СС, СТ, ТС, ТТ (С — сүлд, Т — тоо). Таатай нь ${ev[1]} тул P = ${fracShow(ev[1], 4)}.`);
  }
  const ev = pick(rng, [
    ['гурвуулаа сүлд талаараа', 1],
    ['яг хоёр нь сүлд талаараа', 3],
    ['яг нэг нь сүлд талаараа', 3],
  ] as const);
  return pQ(rng, `prob.coin3:${ev[0]}`, `Гурван зоосыг зэрэг хаяхад ${ev[0]} буух магадлалыг ол.`, frac(ev[1], 8),
    [frac(1, 4), frac(1, 3), frac(1, 8), frac(3, 8), frac(1, 2), frac(2, 3)],
    `Боломжит үр дүн 2 · 2 · 2 = 8, таатай нь ${ev[1]} тул P = ${fracShow(ev[1], 8)}.`, 25);
}

function famDice(L: Level, rng: Rng): GenQuestion {
  const pairs: [number, number][] = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) pairs.push([a, b]);
  const kind = L.d === 2 ? pick(rng, ['eq', 'gt', 'same'] as const) : pick(rng, ['eq', 'eq', 'same'] as const);
  let text: string;
  let m: number;
  let key: string;
  if (kind === 'same') {
    text = 'Хоёр шоог зэрэг хаяхад хоёуланд нь ижил тоо буух магадлалыг ол.';
    m = 6;
    key = 'prob.dsame';
  } else if (kind === 'eq') {
    const s = randInt(rng, 3, 11);
    m = pairs.filter(([a, b]) => a + b === s).length;
    text = `Хоёр шоог зэрэг хаяхад буусан тоонуудын нийлбэр ${s} байх магадлалыг ол.`;
    key = `prob.dsum:${s}`;
  } else {
    const s = randInt(rng, 7, 10);
    m = pairs.filter(([a, b]) => a + b > s).length;
    text = `Хоёр шоог зэрэг хаяхад буусан тоонуудын нийлбэр ${abl(s)} их байх магадлалыг ол.`;
    key = `prob.dgt:${s}`;
  }
  return pQ(rng, key, text, frac(m, 36), [frac(1, 11), frac(m + 1, 36), frac(m - 1, 36), frac(m, 12), frac(1, 6), frac(1, 36)],
    `Нийт 6 · 6 = 36 үр дүнгээс ${m} нь таатай тул P = ${fracShow(m, 36)}.`, L.d === 2 ? 25 : undefined);
}

function famNoReplace(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const [c1, c2] = sampleUnique(rng, COLORS, 2);
    const r = randInt(rng, 2, 6 + L.g);
    const w = randInt(rng, 1, 6);
    const N = r + w;
    const p = frac(r * (r - 1), N * (N - 1));
    if (p.n === 0) return null;
    return pQ(rng, `prob.norep:${r},${w}:${c1},${c2}`,
      `Уутанд ${r} ${c1}, ${w} ${c2} бөмбөг байна. Буцааж хийхгүйгээр хоёр бөмбөг ээлжлэн авахад хоёулаа ${c1} байх магадлалыг ол.`,
      p, [frac(r * r, N * N), frac(r * r, N * (N - 1)), frac(r, N), frac(r - 1, N - 1), frac(r * (r - 1), N * N)],
      `P = ${r}/${N} · ${r - 1}/${N - 1} = ${fracShow(r * (r - 1), N * (N - 1))}.`, 30, 'r/n · (r − 1)/(n − 1)', { r, n: N });
  });
}

function famAtLeast(L: Level, rng: Rng): GenQuestion {
  if (chance(rng, 0.5)) {
    const n = randInt(rng, 2, L.d === 2 ? 4 : 3);
    const t = 2 ** n;
    return pQ(rng, `prob.atl:${n}`, `Зоосыг ${n} удаа хаяхад ядаж нэг удаа сүлд буух магадлалыг ол.`, frac(t - 1, t),
      [frac(1, t), frac(n, t), frac(1, 2), frac(t - 2, t), frac(n, n + 1)],
      `Нэг ч удаа сүлд буухгүй байх магадлал 1/${t} тул P = 1 − 1/${t} = ${frac(t - 1, t).toString()}.`, 25, `1 − 1/${t}`);
  }
  return pQ(rng, 'prob.atl6', 'Шоог 2 удаа хаяхад ядаж нэг удаа 6 буух магадлалыг ол.', frac(11, 36),
    [frac(1, 3), frac(1, 36), frac(25, 36), frac(10, 36), frac(1, 6)],
    'Нэг ч удаа 6 буухгүй байх магадлал 5/6 · 5/6 = 25/36 тул P = 1 − 25/36 = 11/36.', 30, '1 − (5/6)²');
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generateProbability(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famBag, 3],
          [famDie, 3],
          [famRange, 1],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famBag, 2],
            [famRange, 2],
            [famCoins, 2],
            [famDice, 2],
            [famDie, 1],
          ])
        : weighted<Fam>(rng, [
            [famNoReplace, 3],
            [famAtLeast, 3],
            [famDice, 2],
            [famCoins, 1.5],
            [famBag, grade <= 7 ? 1 : 0],
          ]);
  return fam(L, rng);
}

export default generateProbability;
