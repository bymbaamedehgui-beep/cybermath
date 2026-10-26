// Хувь ба харьцаа: p% of N, the whole from a part, what percent, discounts and
// raises, % change, original price, successive changes, sharing in a ratio,
// proportions.

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Opt,
  type Rng,
  attempt,
  chance,
  fmt,
  gcd,
  isInt,
  level,
  make,
  money,
  nearInts,
  opt,
  optNum,
  pick,
  randInt,
  sampleUnique,
  weighted,
} from '../util';

const PCTS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75] as const;

const pctOpt = (p: number): Opt => optNum(p, '%');
const moneyOpt = (n: number): Opt => opt(money(n), n);

function numQ(
  rng: Rng,
  key: string,
  text: string,
  val: number,
  f: (n: number) => Opt,
  wrong: number[],
  explanation: string,
  opts: { step?: number; lines?: string[]; time?: number; check?: { expr: string; vars?: Record<string, number> } } = {},
): GenQuestion {
  const ok = (n: number) => isInt(n) && n > 0;
  return make(rng, {
    key,
    text,
    lines: opts.lines,
    correct: f(val),
    wrong: wrong.filter(ok).map(f),
    more: nearInts(rng, val, f, { step: opts.step ?? 1, ok }),
    explanation,
    time: opts.time,
    check: opts.check ? { kind: 'value', ...opts.check } : undefined,
  });
}

/** N тооны p% */
function famOf(L: Level, rng: Rng): GenQuestion {
  const p = pick(rng, PCTS);
  const unit = 100 / gcd(p, 100);
  const N = unit * randInt(rng, 1, Math.max(2, Math.floor((200 + 300 * L.g) / unit)));
  const r = (N * p) / 100;
  return numQ(rng, `pct.of:${N},${p}`, `${N} тооны ${p}%-ийг ол.`, r, (n) => optNum(n),
    [(N * p) / 10, N - r, N / p, r + p, (N * p) / 1000], `${N} · ${p} : 100 = ${fmt(r)}.`,
    { check: { expr: 'n · p : 100', vars: { n: N, p } }, time: L.d === 0 ? 15 : undefined });
}

/** Тооны p% нь r. Тоог ол. */
function famWhole(L: Level, rng: Rng): GenQuestion {
  const p = pick(rng, PCTS);
  const unit = 100 / gcd(p, 100);
  const N = unit * randInt(rng, 1, Math.max(2, Math.floor((200 + 200 * L.g) / unit)));
  const r = (N * p) / 100;
  return numQ(rng, `pct.whole:${p},${r}`, `Тооны ${p}% нь ${fmt(r)}. Тэр тоог ол.`, N, (n) => optNum(n),
    [(r * p) / 100, r * p, r + (r * p) / 100, (r * 100) / (100 - p)], `${fmt(r)} : ${p} · 100 = ${fmt(N)}.`,
    { check: { expr: 'r · 100 : p', vars: { r, p } } });
}

/** a нь N тооны хэдэн хувь вэ? */
function famWhatPct(L: Level, rng: Rng): GenQuestion {
  const p = pick(rng, PCTS);
  const unit = 100 / gcd(p, 100);
  const N = unit * randInt(rng, 1, Math.max(2, Math.floor((150 + 150 * L.g) / unit)));
  const a = (N * p) / 100;
  const ctx = chance(rng, 0.5);
  const text = ctx
    ? `Ангийн ${N} сурагчийн ${fmt(a)} нь охид. Охид ангийн хэдэн хувийг эзлэх вэ?`
    : `${fmt(a)} нь ${N} тооны хэдэн хувь вэ?`;
  return numQ(rng, `pct.what:${a},${N},${ctx}`, text, p, pctOpt, [(N / a) * 100, 100 - p, a, p / 10, p + 10],
    `${fmt(a)} : ${N} · 100% = ${p}%.`, { step: 5, check: { expr: 'a : n · 100', vars: { a, n: N } } });
}

/** Discount or raise: new price. */
function famDiscount(L: Level, rng: Rng): GenQuestion {
  const p = pick(rng, [10, 20, 25, 30, 40, 50] as const);
  const P = pick(rng, [2000, 4000, 5000, 6000, 8000, 10000, 12000, 20000, 25000, 40000]);
  const amt = (P * p) / 100;
  const down = chance(rng, 0.65);
  const nv = down ? P - amt : P + amt;
  const item = pick(rng, ['цамц', 'ном', 'цүнх', 'малгай', 'бөмбөг']);
  const text = down
    ? `Үнэ нь ${money(P)} байсан ${item} ${p}%-иар хямдарчээ. Хямдарсан үнийг ол.`
    : `Үнэ нь ${money(P)} байсан ${item} ${p}%-иар үнэтэй болжээ. Шинэ үнийг ол.`;
  return numQ(rng, `pct.disc:${P},${p},${down},${item}`, text, nv, moneyOpt,
    [amt, down ? P + amt : P - amt, down ? P - p : P + p, (P * (100 - 2 * p)) / 100],
    `${down ? 'Хямдрал' : 'Нэмэгдэл'} ${money(P)} · ${p} : 100 = ${money(amt)}, шинэ үнэ ${money(nv)}.`,
    { step: P >= 10000 ? 500 : 100, check: { expr: `P · (100 ${down ? '−' : '+'} p) : 100`, vars: { P, p } } });
}

/** % increase / decrease from A to B. */
function famChange(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const p = pick(rng, [10, 20, 25, 40, 50, 60, 75] as const);
    const A = pick(rng, [800, 1000, 2000, 4000, 5000, 8000, 10000, 20000]);
    const up = chance(rng, 0.55);
    if (!up && p > 60) return null;
    const B = up ? (A * (100 + p)) / 100 : (A * (100 - p)) / 100;
    if (!isInt(B)) return null;
    const viaNew = (Math.abs(B - A) / B) * 100;
    return numQ(rng, `pct.chg:${A},${B}`,
      `Барааны үнэ ${money(A)}-өөс ${money(B)} болж ${up ? 'өсчээ' : 'буурчээ'}. Хэдэн хувиар ${up ? 'өссөн' : 'буурсан'} бэ?`,
      p, pctOpt, [viaNew, (B / A) * 100, 100 - p, Math.abs(B - A) / 100],
      `${up ? 'Өсөлт' : 'Бууралт'} ${money(Math.abs(B - A))}; ${fmt(Math.abs(B - A))} : ${fmt(A)} · 100% = ${p}%.`,
      { step: 5, check: { expr: up ? '(b − a) : a · 100' : '(a − b) : a · 100', vars: { a: A, b: B } } });
  });
}

/** Original price before a discount. */
function famOriginal(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const p = pick(rng, [10, 20, 25, 40, 50] as const);
    const A = pick(rng, [2000, 4000, 5000, 6000, 8000, 10000, 12000, 16000, 20000]);
    const B = (A * (100 - p)) / 100;
    const slip = (B * (100 + p)) / 100;
    if (!isInt(slip)) return null;
    return numQ(rng, `pct.orig:${p},${B}`, `${p}%-иар хямдарсны дараа барааны үнэ ${money(B)} болжээ. Анхны үнийг ол.`, A, moneyOpt,
      [slip, (B * (100 - p)) / 100, A + (A * p) / 100, B + (A * p) / 100],
      `Шинэ үнэ нь анхны үнийн ${100 - p}% тул ${fmt(B)} · 100 : ${100 - p} = ${money(A)}.`,
      { step: A >= 10000 ? 500 : 100, time: L.d === 2 ? 25 : undefined, check: { expr: 'b · 100 : (100 − p)', vars: { b: B, p } } });
  });
}

/** Two successive changes. */
function famSuccessive(L: Level, rng: Rng): GenQuestion {
  if (chance(rng, 0.45)) {
    const p = pick(rng, [10, 20, 30, 50] as const);
    const c = (p * p) / 100;
    const upFirst = chance(rng, 0.5);
    const correct = `${fmt(c)}%-иар буурсан`;
    const k1 = fmt(1 + p / 100);
    const k2 = fmt(1 - p / 100);
    return make(rng, {
      key: `pct.succ2:${p},${upFirst}`,
      text: `Барааны үнийг эхлээд ${p}%-иар ${upFirst ? 'нэмээд' : 'бууруулаад'}, дараа нь ${p}%-иар ${upFirst ? 'бууруулжээ' : 'нэмжээ'}. Үнэ эцэстээ хэрхэн өөрчлөгдсөн бэ?`,
      correct,
      wrong: ['Өөрчлөгдөөгүй', `${fmt(c)}%-иар өссөн`, `${fmt(p / 10)}%-иар буурсан`, `${fmt(2 * c)}%-иар буурсан`],
      more: () => `${pick(rng, [1, 2, 3, 5, 6, 8, 10, 12])}%-иар буурсан`,
      explanation: `${upFirst ? `${k1} · ${k2}` : `${k2} · ${k1}`} = ${fmt(1 - c / 100)} тул үнэ ${fmt(c)}%-иар буурсан.`,
      time: 25,
    });
  }
  return attempt(() => {
    const P = pick(rng, [10000, 20000, 40000, 50000]);
    const p1 = pick(rng, [10, 20, 25, 50] as const);
    const p2 = pick(rng, [10, 20, 25, 50] as const);
    const up1 = chance(rng, 0.5);
    const s1 = up1 ? 1 : -1;
    const s2 = -s1;
    const v = (P * (100 + s1 * p1) * (100 + s2 * p2)) / 10000;
    if (!isInt(v)) return null;
    const additive = (P * (100 + s1 * p1 + s2 * p2)) / 100;
    if (additive === v) return null;
    return numQ(rng, `pct.succ:${P},${s1 * p1},${s2 * p2}`,
      `${money(P)}-ийн барааны үнийг ${p1}%-иар ${up1 ? 'нэмээд' : 'хямдруулаад'}, дараа нь ${p2}%-иар ${up1 ? 'хямдруулжээ' : 'нэмжээ'}. Эцсийн үнэ хэд вэ?`,
      v, moneyOpt, [additive, (P * (100 + s2 * p2)) / 100, (P * (100 + s1 * p1)) / 100, P],
      `${money(P)} → ${money((P * (100 + s1 * p1)) / 100)} → ${money(v)}.`,
      { step: 100, time: 30, check: { expr: 'P · (100 + a) · (100 + b) : 10000', vars: { P, a: s1 * p1, b: s2 * p2 } } });
  });
}

const NAMES = ['Бат', 'Сараа', 'Болд', 'Номин', 'Тэмүүлэн', 'Анужин', 'Ганаа', 'Солонго'] as const;
const THINGS = [
  { n: 'чихэр', acc: 'чихрийг' },
  { n: 'алим', acc: 'алимыг' },
  { n: 'дэвтэр', acc: 'дэвтрийг' },
  { n: 'харандаа', acc: 'харандааг' },
] as const;

/** Share T in the ratio a : b (or a : b : c). */
function famShare(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const three = L.d === 2 && chance(rng, 0.5);
    const parts = three
      ? [randInt(rng, 1, 5), randInt(rng, 1, 5), randInt(rng, 1, 5)]
      : [randInt(rng, 1, 7), randInt(rng, 1, 7)];
    if (new Set(parts).size !== parts.length) return null;
    if (parts.reduce((g, v) => gcd(g, v), 0) !== 1) return null;
    const sum = parts.reduce((s, v) => s + v, 0);
    const u = randInt(rng, 2, 6 + 3 * L.g);
    const T = sum * u;
    const ix = randInt(rng, 0, parts.length - 1);
    const ans = parts[ix] * u;
    const who = sampleUnique(rng, NAMES, parts.length);
    const th = pick(rng, THINGS);
    const names = who.length === 2 ? `${who[0]}, ${who[1]} хоёр` : `${who[0]}, ${who[1]}, ${who[2]} гурав`;
    const others = parts.filter((_, i) => i !== ix).map((p) => p * u);
    return numQ(rng, `pct.share:${parts.join(':')},${T},${ix},${th.n},${who.join(',')}`,
      `${T} ${th.acc} ${names} ${parts.join(' : ')} харьцаагаар хуваажээ. ${who[ix]} хэдэн ${th.n} авсан бэ?`,
      ans, (n) => optNum(n), [...others, u, T / parts.length, T - ans],
      `Нэг хэсэг ${T} : ${sum} = ${u}, ${who[ix]} ${parts[ix]} · ${u} = ${ans} ${th.n} авсан.`,
      { check: { expr: 't · k : s', vars: { t: T, k: parts[ix], s: sum } } });
  });
}

/** Proportion x : b = c : d. */
function famProportion(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const x = randInt(rng, 2, 12 + 4 * L.g);
    const b = randInt(rng, 2, 12);
    const k = pick(rng, [2, 3, 4, 5, 6]);
    const c = x * k;
    const d = b * k;
    if (x === b || c > 99 || d > 99) return null;
    const pos = randInt(rng, 0, 1);
    const line = pos === 0 ? `x : ${b} = ${c} : ${d}` : `${b} : x = ${d} : ${c}`;
    const wrong = [(b * d) / c, b + c - d, (c * d) / b, x + 1, d - c];
    return make(rng, {
      key: `pct.prop:${line}`,
      text: 'Пропорцоос x-ийг ол.',
      lines: [line],
      correct: optNum(x),
      wrong: wrong.filter((n) => isInt(n) && n > 0).map((n) => optNum(n)),
      more: nearInts(rng, x, (n) => optNum(n), { ok: (n) => n > 0 }),
      explanation: `Пропорцын үндсэн чанараар x · ${d} = ${b} · ${c} ⇒ x = ${b * c} : ${d} = ${x}.`,
      check: { kind: 'root', equation: line },
    });
  });
}

/** Rectangle with sides in ratio a : b and perimeter P → area. */
function famRatioRect(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const a = randInt(rng, 2, 5);
    const b = randInt(rng, 1, 4);
    if (a <= b || gcd(a, b) !== 1) return null;
    const u = randInt(rng, 1, 4 + L.g);
    const P = 2 * (a + b) * u;
    const S = a * b * u * u;
    const u2 = P / (a + b);
    return numQ(rng, `pct.rect:${a},${b},${P}`,
      `Тэгш өнцөгтийн урт, өргөний харьцаа ${a} : ${b}, периметр нь ${P} см. Талбайг ол.`, S, (n) => optNum(n, ' см²'),
      [a * b * u2 * u2, a * b * u, P, 2 * a * b * u * u],
      `Урт + өргөн = ${P / 2} см, нэг хэсэг ${P / 2} : ${a + b} = ${u} см. Урт ${a * u}, өргөн ${b * u} ⇒ S = ${S} см².`,
      { time: 30, check: { expr: 'a · b · (p : (2(a + b)))²', vars: { a, b, p: P } } });
  });
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generatePercent(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famOf, 4],
          [famDiscount, 2],
          [famShare, 2],
          [famWhatPct, 1],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famWhole, 2],
            [famWhatPct, 2],
            [famDiscount, 2],
            [famChange, 2],
            [famProportion, 2],
            [famShare, 1],
          ])
        : weighted<Fam>(rng, [
            [famOriginal, 3],
            [famSuccessive, 3],
            [famChange, 1.5],
            [famShare, 1.5],
            [famRatioRect, 2],
          ]);
  return fam(L, rng);
}

export default generatePercent;
