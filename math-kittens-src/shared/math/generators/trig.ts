// Тригонометр: special-angle values, right-triangle ratios, sides via 30°/45°,
// sin² + cos² = 1, degrees ↔ radians, solving sin x = a on an interval.

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Opt,
  type Rng,
  attempt,
  chance,
  deg,
  fmt,
  frac,
  isInt,
  level,
  make,
  nearInts,
  opt,
  optFrac,
  optNum,
  optSet,
  pick,
  piStr,
  randInt,
  round9,
  sqrtStr,
  weighted,
} from '../util';

export type Fn = 'sin' | 'cos' | 'tan';

/** Exact values that appear in school trigonometry, as display text. */
const VALUES: ReadonlyArray<readonly [string, number]> = [
  ['0', 0],
  ['1/2', 0.5],
  ['√2/2', Math.SQRT2 / 2],
  ['√3/2', Math.sqrt(3) / 2],
  ['1', 1],
  ['√3', Math.sqrt(3)],
  ['√3/3', Math.sqrt(3) / 3],
  ['−1/2', -0.5],
  ['−√2/2', -Math.SQRT2 / 2],
  ['−√3/2', -Math.sqrt(3) / 2],
  ['−1', -1],
  ['−√3', -Math.sqrt(3)],
  ['−√3/3', -Math.sqrt(3) / 3],
];

export function trigValue(f: Fn, a: number): number {
  const r = (a * Math.PI) / 180;
  return round9(f === 'sin' ? Math.sin(r) : f === 'cos' ? Math.cos(r) : Math.tan(r));
}

function valueText(v: number): string {
  const hit = VALUES.find(([, x]) => Math.abs(x - v) < 1e-9);
  if (!hit) throw new Error(`no exact text for ${v}`);
  return hit[0];
}
const valueOpt = (v: number): Opt => opt(valueText(v), v);

const cofn = (f: Fn): Fn => (f === 'sin' ? 'cos' : f === 'cos' ? 'sin' : 'tan');

/** sin 30°, cos 135°, … */
function famSpecial(L: Level, rng: Rng): GenQuestion {
  const obtuse = L.g === 2 && L.d >= 1 && chance(rng, 0.6);
  const f = pick(rng, ['sin', 'cos', 'tan'] as const);
  const base = pick(rng, [30, 45, 60] as const);
  const a = obtuse ? 180 - base : base;
  const v = trigValue(f, a);
  const wrongVals = [
    trigValue(cofn(f), a),
    -v,
    trigValue(f, 90 - base),
    trigValue(f === 'tan' ? 'sin' : 'tan', a),
    trigValue(f, base),
  ];
  const pool = VALUES.map(([, x]) => x).filter((x) => obtuse || x >= 0);
  return make(rng, {
    key: `trig.sp:${f},${a}`,
    text: 'Тригонометрийн функцийн утгыг ол.',
    lines: [`${f} ${a}° = ?`],
    correct: valueOpt(v),
    wrong: wrongVals.filter((x) => obtuse || x >= 0).map(valueOpt),
    more: () => valueOpt(pick(rng, pool)),
    explanation: obtuse
      ? `${f} ${a}° = ${f}(180° − ${base}°) = ${f === 'sin' ? '' : '−'}${f} ${base}° = ${valueText(v)}.`
      : `${f} ${a}° = ${valueText(v)} (тусгай өнцгийн утга).`,
    time: L.d === 0 ? 12 : undefined,
    check: { kind: 'value', expr: `${f} ${a}°` },
  });
}

interface Term {
  text: string;
  val: number;
  /** value a student gets by mixing up sin/cos */
  slip: number;
}

const TERMS: ReadonlyArray<Term> = [
  { text: '2 sin 30°', val: 1, slip: Math.sqrt(3) },
  { text: '2 cos 60°', val: 1, slip: Math.sqrt(3) },
  { text: '4 sin 30°', val: 2, slip: 2 * Math.sqrt(3) },
  { text: '6 cos 60°', val: 3, slip: 3 * Math.sqrt(3) },
  { text: 'tan 45°', val: 1, slip: 1 },
  { text: '3 tan 45°', val: 3, slip: 3 },
  { text: '√3 tan 60°', val: 3, slip: 1 },
  { text: '√3 tan 30°', val: 1, slip: 3 },
  { text: '√2 sin 45°', val: 1, slip: 1 },
  { text: '2√3 cos 30°', val: 3, slip: Math.sqrt(3) },
  { text: 'sin 90°', val: 1, slip: 0 },
  { text: 'cos 0°', val: 1, slip: 0 },
  { text: '4 cos² 30°', val: 3, slip: 1 },
  { text: '4 sin² 60°', val: 3, slip: 1 },
  { text: '2 sin² 45°', val: 1, slip: 1 },
];

function famExpr(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const t1 = pick(rng, TERMS);
    const t2 = pick(rng, TERMS);
    if (t1 === t2) return null;
    const minus = chance(rng, 0.45);
    const v = minus ? t1.val - t2.val : t1.val + t2.val;
    if (!L.neg && v < 0) return null;
    const expr = `${t1.text} ${minus ? '−' : '+'} ${t2.text}`;
    const sg = minus ? -1 : 1;
    const wrong = [t1.slip + sg * t2.val, t1.val + sg * t2.slip, t1.val - sg * t2.val, v + 1, v - 1, v + 2].filter(
      (n) => isInt(n) && (L.neg || n >= 0),
    );
    return make(rng, {
      key: `trig.expr:${expr}`,
      text: 'Илэрхийллийн утгыг ол.',
      lines: [expr],
      correct: optNum(v),
      wrong: wrong.map((n) => optNum(n)),
      more: nearInts(rng, v, (n) => optNum(n), { ok: (n) => L.neg || n >= 0 }),
      explanation: `${t1.text} = ${fmt(t1.val)}, ${t2.text} = ${fmt(t2.val)} тул ${fmt(t1.val)} ${minus ? '−' : '+'} ${fmt(t2.val)} = ${fmt(v)}.`,
      check: { kind: 'value', expr },
    });
  });
}

const RT: ReadonlyArray<readonly [number, number, number]> = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [6, 8, 10],
  [7, 24, 25],
  [9, 12, 15],
];

/** sin/cos/tan of an acute angle of a right triangle. */
function famRatio(L: Level, rng: Rng): GenQuestion {
  const [p, q, c] = pick(rng, RT.slice(0, 3 + L.g + L.d));
  const [a, b] = chance(rng, 0.5) ? [p, q] : [q, p]; // BC = a, AC = b, AB = c
  const f = pick(rng, ['sin', 'cos', 'tan'] as const);
  const ang = pick(rng, ['A', 'B'] as const);
  const opp = ang === 'A' ? a : b;
  const adj = ang === 'A' ? b : a;
  const val = f === 'sin' ? frac(opp, c) : f === 'cos' ? frac(adj, c) : frac(opp, adj);
  const all = [frac(opp, c), frac(adj, c), frac(opp, adj), frac(adj, opp), frac(c, opp), frac(c, adj)];
  const given =
    L.d === 2
      ? pick(rng, [`AC = ${b}, AB = ${c}`, `BC = ${a}, AB = ${c}`])
      : L.d === 1 && chance(rng, 0.5)
        ? `AC = ${b}, BC = ${a}`
        : `AC = ${b}, BC = ${a}, AB = ${c}`;
  const def = f === 'sin' ? 'эсрэг катет : гипотенуз' : f === 'cos' ? 'хажуугийн катет : гипотенуз' : 'эсрэг катет : хажуугийн катет';
  const lacks = ['AB', 'AC', 'BC'].find((s) => !given.includes(s));
  const oppS = ang === 'A' ? 'BC' : 'AC';
  const adjS = ang === 'A' ? 'AC' : 'BC';
  const used = f === 'sin' ? [oppS, 'AB'] : f === 'cos' ? [adjS, 'AB'] : [oppS, adjS];
  const needs = lacks !== undefined && used.includes(lacks);
  const side = lacks === 'AB' ? c : lacks === 'AC' ? b : a;
  const pre = needs && lacks ? `Пифагорын теоремоор ${lacks} = ${side}. ` : '';
  return make(rng, {
    key: `trig.rt:${a},${b},${f},${ang},${given}`,
    text: `ABC тэгш өнцөгт гурвалжинд ∠C = 90°, ${given}.`,
    lines: [`${f} ${ang} = ?`],
    correct: optFrac(val),
    wrong: all.map((x) => optFrac(x)),
    more: () => optFrac(frac(randInt(rng, 1, c), c)),
    explanation: `${pre}${f} ${ang} = ${def} = ${val.toString()}.`,
    time: L.d === 2 ? 25 : undefined,
  });
}

/** Side opposite 30°, adjacent to 30°, hypotenuse with 45°. */
function famSide(L: Level, rng: Rng): GenQuestion {
  const kind = L.d === 2 ? pick(rng, ['adj30', 'hyp45', 'opp30'] as const) : pick(rng, ['opp30', 'opp30', 'hyp45'] as const);
  const unit = ' см';
  if (kind === 'hyp45') {
    const k = randInt(rng, 2, 12);
    return make(rng, {
      key: `trig.h45:${k}`,
      text: `Тэгш өнцөгт гурвалжны нэг катет ${k} см, хурц өнцөг нь 45°. Гипотенузыг ол.`,
      correct: opt(sqrtStr(k, 2) + unit, k * Math.SQRT2),
      wrong: [optNum(2 * k, unit), optNum(k, unit), opt(sqrtStr(k, 3) + unit, k * Math.sqrt(3)), opt(sqrtStr(2 * k, 2) + unit, 2 * k * Math.SQRT2)],
      explanation: `Хоёр катет тэнцүү, гипотенуз = катет · √2 = ${sqrtStr(k, 2)} см.`,
    });
  }
  const c = 2 * randInt(rng, 2, 12);
  const h = c / 2;
  if (kind === 'opp30') {
    return make(rng, {
      key: `trig.o30:${c}`,
      text: `Тэгш өнцөгт гурвалжны гипотенуз ${c} см, нэг хурц өнцөг нь 30°. Энэ өнцгийн эсрэг катетыг ол.`,
      correct: optNum(h, unit),
      wrong: [optNum(2 * c, unit), opt(sqrtStr(h, 3) + unit, h * Math.sqrt(3)), optNum(c, unit), opt(sqrtStr(h, 2) + unit, h * Math.SQRT2)],
      explanation: `30°-ын эсрэг катет гипотенузын хагас: ${c} · sin 30° = ${c} · 1/2 = ${h} см.`,
      check: { kind: 'value', expr: 'c · sin 30°', vars: { c } },
    });
  }
  return make(rng, {
    key: `trig.a30:${c}`,
    text: `Тэгш өнцөгт гурвалжны гипотенуз ${c} см, нэг хурц өнцөг нь 30°. Энэ өнцгийн хажуугийн катетыг ол.`,
    correct: opt(sqrtStr(h, 3) + unit, h * Math.sqrt(3)),
    wrong: [optNum(h, unit), opt(sqrtStr(c, 3) + unit, c * Math.sqrt(3)), opt(sqrtStr(h, 2) + unit, h * Math.SQRT2), optNum(2 * c, unit)],
    explanation: `Хажуугийн катет = ${c} · cos 30° = ${c} · √3/2 = ${sqrtStr(h, 3)} см.`,
    time: 25,
    check: { kind: 'value', expr: 'c · cos 30°', vars: { c } },
  });
}

/** sin α given → cos α or tan α (α acute). */
function famIdentity(L: Level, rng: Rng): GenQuestion {
  const [p, q, c] = pick(rng, RT.slice(0, 3 + L.g));
  const [a, b] = chance(rng, 0.5) ? [p, q] : [q, p];
  const givenSin = chance(rng, 0.5);
  const askTan = L.d === 2 && chance(rng, 0.5);
  const g = givenSin ? frac(a, c) : frac(b, c);
  const other = givenSin ? frac(b, c) : frac(a, c);
  const want = askTan ? frac(a, b) : other;
  const [gName, oName] = givenSin ? ['sin', 'cos'] : ['cos', 'sin'];
  const ask = askTan ? 'tan' : oName;
  const wrong = askTan
    ? [frac(b, a), g, other, frac(c, b)]
    : [frac(1).sub(g), other.mul(other), g, other.inv()];
  return make(rng, {
    key: `trig.id:${gName},${g.toString()},${ask}`,
    text: 'α нь хурц өнцөг. Утгыг ол.',
    lines: [`${gName} α = ${g.toString()}`, `${ask} α = ?`],
    correct: optFrac(want),
    wrong: wrong.map((x) => optFrac(x)),
    more: () => optFrac(frac(randInt(rng, 1, c - 1), c)),
    explanation: askTan
      ? `${oName} α = √(1 − ${gName}² α) = ${other.toString()}, tan α = sin α : cos α = ${want.toString()}.`
      : `${oName} α = √(1 − ${gName}² α) = √(1 − ${g.mul(g).toString()}) = ${want.toString()}.`,
    time: L.d === 2 ? 25 : undefined,
    check: { kind: 'value', expr: askTan ? `${a}/${b}` : `√(1 − (${g.n}/${g.d})²)` },
  });
}

const STD_ANGLES = [30, 45, 60, 90, 120, 135, 150, 180, 210, 240, 270, 300, 315, 330, 360] as const;

function famRadians(L: Level, rng: Rng): GenQuestion {
  const a = pick(rng, L.d === 0 ? STD_ANGLES.slice(0, 8) : STD_ANGLES);
  const r = frac(a, 180);
  if (chance(rng, 0.5)) {
    const inv = r.n !== r.d && r.n !== 1 ? frac(r.d, r.n) : null;
    return make(rng, {
      key: `trig.d2r:${a}`,
      text: `${a}° өнцгийг радианаар илэрхийл.`,
      correct: opt(piStr(r), r.value * Math.PI),
      wrong: [inv, r.mul(2), r.div(2), r.add(frac(1, 6)), r.sub(frac(1, 6))].map((x) =>
        x && x.n > 0 ? opt(piStr(x), x.value * Math.PI) : null,
      ),
      more: () => {
        const b = pick(rng, STD_ANGLES);
        return opt(piStr(frac(b, 180)), (b / 180) * Math.PI);
      },
      explanation: `${a}° · π/180° = ${piStr(r)}.`,
      time: L.d === 0 ? 15 : undefined,
      check: { kind: 'value', expr: `${a}π : 180` },
    });
  }
  return make(rng, {
    key: `trig.r2d:${a}`,
    text: `${piStr(r)} радиан хэдэн градус вэ?`,
    correct: optNum(a, '°'),
    wrong: [a / 2, 2 * a, 180 - a, (180 * r.d) / r.n].filter((x) => isInt(x) && x > 0 && x <= 720).map((x) => optNum(x, '°')),
    more: () => optNum(pick(rng, STD_ANGLES), '°'),
    explanation: `${piStr(r)} · 180°/π = ${deg(a)}.`,
    time: L.d === 0 ? 15 : undefined,
    check: { kind: 'value', expr: `${r.n} · 180 : ${r.d}` },
  });
}

const EQS: ReadonlyArray<readonly [Fn, number]> = [
  ['sin', 0.5],
  ['sin', Math.sqrt(3) / 2],
  ['sin', Math.SQRT2 / 2],
  ['cos', 0.5],
  ['cos', -0.5],
  ['cos', Math.sqrt(3) / 2],
  ['cos', -Math.SQRT2 / 2],
  ['tan', 1],
  ['tan', Math.sqrt(3)],
  ['tan', -1],
  ['sin', -0.5],
];

/** All integer-degree solutions of f(x) = v on [lo; hi]. */
export function solveTrig(f: Fn, v: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let x = lo; x <= hi; x++) {
    if (f === 'tan' && x % 180 === 90) continue;
    if (Math.abs(trigValue(f, x) - v) < 1e-9) out.push(x);
  }
  return out;
}

function famSolve(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const [f, v] = pick(rng, EQS);
    const hi = chance(rng, 0.5) ? 180 : 360;
    const sols = solveTrig(f, v, 0, hi);
    if (sols.length === 0) return null;
    const full = solveTrig(f, v, 0, 360);
    const cof = solveTrig(cofn(f), v, 0, hi);
    const negs = solveTrig(f, -v, 0, hi);
    const S = (xs: number[]) => (xs.length ? optSet(xs, '°') : null);
    return make(rng, {
      key: `trig.solve:${f},${round9(v)},${hi}`,
      text: `[0°; ${hi}°] хэрчимд тэгшитгэлийг бод.`,
      lines: [`${f} x = ${valueText(v)}`],
      correct: optSet(sols, '°'),
      wrong: [S([sols[0]]), S(cof), S(negs), full.length !== sols.length ? S(full) : null, S(sols.map((x) => (x + 180) % 360)), S([sols[0], 360 - sols[0]])],
      more: () => S([pick(rng, STD_ANGLES)]),
      explanation: `[0°; ${hi}°] хэрчимд ${f} x = ${valueText(v)} байх өнцгүүд: ${optSet(sols, '°').text}.`,
      time: 30,
    });
  });
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generateTrig(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const hi = L.g === 2;
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famSpecial, 4],
          [famRadians, hi ? 2 : 0],
          [famRatio, 2],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famExpr, 2],
            [famRatio, 2],
            [famSide, 2],
            [famIdentity, L.g >= 1 ? 1.5 : 0],
            [famRadians, hi ? 1 : 0],
            [famSpecial, hi ? 1 : 0.5],
          ])
        : weighted<Fam>(rng, [
            [famSolve, hi ? 3 : 0],
            [famIdentity, 2],
            [famSide, 2],
            [famRatio, 2],
            [famExpr, 1],
            [famSpecial, L.g >= 1 ? 1 : 0],
          ]);
  return fam(L, rng);
}

export default generateTrig;
