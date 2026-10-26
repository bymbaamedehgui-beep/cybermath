// Геометр: rectangles, triangles, angles, Pythagoras, circles (in π),
// trapezoids, polygons, cylinder/cone volumes, similar triangles.

import type { Difficulty, Grade } from '../types';
import {
  type GenQuestion,
  type Level,
  type Opt,
  type Rng,
  attempt,
  chance,
  countWord,
  isInt,
  level,
  make,
  nearInts,
  opt,
  optNum,
  pick,
  piStr,
  randInt,
  sqrtStr,
  weighted,
} from '../util';

const CM = ' см';
const CM2 = ' см²';
const CM3 = ' см³';

/** k·π with a unit, keyed by numeric value. */
const optPi = (k: number, unit: string): Opt => opt(`${piStr(k)}${unit}`, k * Math.PI);
/** √n simplified with a unit. */
function optRoot(n: number, unit: string): Opt {
  let k = 1;
  let r = n;
  for (let f = 2; f * f <= r; f++) {
    while (r % (f * f) === 0) {
      r /= f * f;
      k *= f;
    }
  }
  return opt(`${sqrtStr(k, r)}${unit}`, Math.sqrt(n));
}

const pos = (n: number) => isInt(n) && n > 0;

function numQ(
  rng: Rng,
  key: string,
  text: string,
  val: number,
  unit: string,
  wrong: number[],
  explanation: string,
  expr?: { expr: string; vars?: Record<string, number> },
  time?: number,
): GenQuestion {
  return make(rng, {
    key,
    text,
    correct: optNum(val, unit),
    wrong: wrong.filter(pos).map((n) => optNum(n, unit)),
    more: nearInts(rng, val, (n) => optNum(n, unit), { ok: pos, spread: Math.max(3, Math.round(val / 10)) }),
    explanation,
    time,
    check: expr ? { kind: 'value', ...expr } : undefined,
  });
}

function piQ(
  rng: Rng,
  key: string,
  text: string,
  k: number,
  unit: string,
  wrong: number[],
  explanation: string,
  expr: string,
  vars: Record<string, number>,
  time?: number,
): GenQuestion {
  return make(rng, {
    key,
    text,
    correct: optPi(k, unit),
    wrong: wrong.filter(pos).map((n) => optPi(n, unit)),
    more: nearInts(rng, k, (n) => optPi(n, unit), { ok: pos, spread: Math.max(3, Math.round(k / 5)) }),
    explanation,
    time,
    check: { kind: 'value', expr, vars },
  });
}

function famRect(L: Level, rng: Rng): GenQuestion {
  const a = randInt(rng, 3, 9 + 4 * L.g);
  let b = randInt(rng, 2, 8 + 3 * L.g);
  if (a === b) b += 1;
  const area = chance(rng, 0.5);
  const S = a * b;
  const P = 2 * (a + b);
  return area
    ? numQ(rng, `geo.rectS:${a},${b}`, `Тэгш өнцөгтийн урт ${a} см, өргөн ${b} см. Талбайг ол.`, S, CM2,
        [P, a + b, 2 * S, S + a], `S = a · b = ${a} · ${b} = ${S} см².`, { expr: 'a · b', vars: { a, b } })
    : numQ(rng, `geo.rectP:${a},${b}`, `Тэгш өнцөгтийн урт ${a} см, өргөн ${b} см. Периметрийг ол.`, P, CM,
        [S, a + b, 2 * a + b, 4 * a], `P = 2(a + b) = 2(${a} + ${b}) = ${P} см.`, { expr: '2(a + b)', vars: { a, b } });
}

function famSquare(L: Level, rng: Rng): GenQuestion {
  const s = randInt(rng, 3, 10 + 3 * L.g);
  const P = 4 * s;
  return numQ(rng, `geo.sq:${P}`, `Квадратын периметр ${P} см. Талбайг ол.`, s * s, CM2, [P, 2 * s, s * 4 * 2, (P * P) / 8],
    `Тал нь ${P} : 4 = ${s} см, талбай ${s}² = ${s * s} см².`, { expr: '(p : 4)²', vars: { p: P } });
}

function famTriArea(L: Level, rng: Rng): GenQuestion {
  const [a, h] = attempt(() => {
    const a = randInt(rng, 3, 12 + 4 * L.g);
    const h = randInt(rng, 2, 10 + 2 * L.g);
    return (a * h) % 2 === 0 && a !== h ? ([a, h] as const) : null;
  });
  const S = (a * h) / 2;
  return numQ(rng, `geo.tri:${a},${h}`, `Гурвалжны суурь ${a} см, түүнд татсан өндөр ${h} см. Талбайг ол.`, S, CM2,
    [a * h, a + h, (a * h) / 4, 2 * (a + h)], `S = a · h : 2 = ${a} · ${h} : 2 = ${S} см².`, { expr: 'a · h : 2', vars: { a, h } });
}

function famAngles(L: Level, rng: Rng): GenQuestion {
  const kind = L.d === 0 ? pick(rng, ['two', 'two', 'iso']) : pick(rng, ['two', 'iso', 'isoBase']);
  if (kind === 'two') {
    const al = 5 * randInt(rng, 4, 16);
    const be = 5 * randInt(rng, 4, 16);
    const ga = 180 - al - be;
    if (ga <= 10) return famAngles(L, rng);
    return numQ(rng, `geo.ang:${al},${be}`, `Гурвалжны хоёр өнцөг ${al}° ба ${be}°. Гурав дахь өнцгийг ол.`, ga, '°',
      [al + be, 360 - al - be, 180 - al, 90 - Math.abs(al - be)], `180° − ${al}° − ${be}° = ${ga}°.`,
      { expr: '180 − a − b', vars: { a: al, b: be } });
  }
  if (kind === 'iso') {
    const top = 2 * randInt(rng, 10, 70);
    const base = (180 - top) / 2;
    return numQ(rng, `geo.iso:${top}`, `Адил хажуут гурвалжны оройн өнцөг ${top}°. Суурийн өнцгийг ол.`, base, '°',
      [180 - top, top, top / 2, 90 - top], `Суурийн өнцгүүд тэнцүү: (180° − ${top}°) : 2 = ${base}°.`,
      { expr: '(180 − t) : 2', vars: { t: top } });
  }
  const base = randInt(rng, 20, 80);
  const top = 180 - 2 * base;
  return numQ(rng, `geo.isoB:${base}`, `Адил хажуут гурвалжны суурийн өнцөг ${base}°. Оройн өнцгийг ол.`, top, '°',
    [180 - base, 2 * base, 90 - base, 360 - 2 * base], `Оройн өнцөг 180° − 2 · ${base}° = ${top}°.`,
    { expr: '180 − 2b', vars: { b: base } });
}

const TRIPLES: ReadonlyArray<readonly [number, number, number]> = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [8, 15, 17],
  [9, 12, 15],
  [7, 24, 25],
  [12, 16, 20],
  [20, 21, 29],
];

function famPythag(L: Level, rng: Rng): GenQuestion {
  const [a, b, c] = pick(rng, TRIPLES.slice(0, 4 + 2 * L.g));
  const [p, q] = chance(rng, 0.5) ? [a, b] : [b, a];
  const kind = L.d === 0 ? 'hyp' : pick(rng, ['hyp', 'leg', 'leg', L.d === 2 ? 'diag' : 'leg']);
  if (kind === 'hyp') {
    return make(rng, {
      key: `geo.hyp:${p},${q}`,
      text: `Тэгш өнцөгт гурвалжны катетууд ${p} см ба ${q} см. Гипотенузыг ол.`,
      correct: optNum(c, CM),
      wrong: [optNum(p + q, CM), optNum(c * c, CM), optNum(c + 1, CM), optNum(Math.abs(q - p) + c, CM), optNum(2 * c, CM)],
      more: nearInts(rng, c, (n) => optNum(n, CM), { ok: pos }),
      explanation: `c² = ${p}² + ${q}² = ${p * p} + ${q * q} = ${c * c} ⇒ c = ${c} см.`,
      check: { kind: 'value', expr: '√(a² + b²)', vars: { a: p, b: q } },
    });
  }
  if (kind === 'diag') {
    return make(rng, {
      key: `geo.diag:${p},${q}`,
      text: `Тэгш өнцөгтийн талууд ${p} см ба ${q} см. Диагоналийг ол.`,
      correct: optNum(c, CM),
      wrong: [optNum(p + q, CM), optNum(2 * (p + q), CM), optNum(c * c, CM), optNum(p * q, CM)],
      more: nearInts(rng, c, (n) => optNum(n, CM), { ok: pos }),
      explanation: `Диагональ нь тэгш өнцөгт гурвалжны гипотенуз: √(${p * p} + ${q * q}) = ${c} см.`,
      check: { kind: 'value', expr: '√(a² + b²)', vars: { a: p, b: q } },
    });
  }
  return make(rng, {
    key: `geo.leg:${c},${p}`,
    text: `Тэгш өнцөгт гурвалжны гипотенуз ${c} см, нэг катет ${p} см. Нөгөө катетыг ол.`,
    correct: optNum(q, CM),
    wrong: [optNum(c - p, CM), optRoot(c * c + p * p, CM), optNum(c + p, CM), optNum(q + 1, CM)],
    more: nearInts(rng, q, (n) => optNum(n, CM), { ok: pos }),
    explanation: `b² = ${c}² − ${p}² = ${c * c} − ${p * p} = ${q * q} ⇒ b = ${q} см.`,
    check: { kind: 'value', expr: '√(c² − a²)', vars: { c, a: p } },
  });
}

function famCircle(L: Level, rng: Rng): GenQuestion {
  const kind = pick(rng, ['C', 'S', L.d >= 1 ? 'Cd' : 'C', L.d >= 1 ? 'Sd' : 'S'] as const);
  const r = randInt(rng, 2, 9 + 2 * L.g);
  if (kind === 'C')
    return piQ(rng, `geo.C:${r}`, `Тойргийн радиус ${r} см. Тойргийн уртыг ол.`, 2 * r, CM, [r, r * r, 4 * r],
      `C = 2πr = 2π · ${r} = ${2 * r}π см.`, '2πr', { r });
  if (kind === 'S')
    return piQ(rng, `geo.S:${r}`, `Дугуйн радиус ${r} см. Дугуйн талбайг ол.`, r * r, CM2, [2 * r, 4 * r * r, r],
      `S = πr² = π · ${r}² = ${r * r}π см².`, 'πr²', { r });
  const d = 2 * r;
  if (kind === 'Cd')
    return piQ(rng, `geo.Cd:${d}`, `Тойргийн диаметр ${d} см. Тойргийн уртыг ол.`, d, CM, [2 * d, r, r * r],
      `C = πd = ${d}π см.`, 'πd', { d });
  return piQ(rng, `geo.Sd:${d}`, `Дугуйн диаметр ${d} см. Дугуйн талбайг ол.`, r * r, CM2, [d * d, d, 2 * d],
    `r = ${d} : 2 = ${r} см, S = πr² = ${r * r}π см².`, 'π(d : 2)²', { d });
}

function famTrapezoid(L: Level, rng: Rng): GenQuestion {
  const [a, b, h] = attempt(() => {
    const a = randInt(rng, 2, 10 + 2 * L.g);
    const b = a + randInt(rng, 1, 8);
    const h = randInt(rng, 2, 9);
    return ((a + b) * h) % 2 === 0 ? ([a, b, h] as const) : null;
  });
  const S = ((a + b) * h) / 2;
  return numQ(rng, `geo.trap:${a},${b},${h}`, `Трапецийн суурь ${a} см ба ${b} см, өндөр ${h} см. Талбайг ол.`, S, CM2,
    [(a + b) * h, (a * b * h) / 2, a * h, a + b + h], `S = (a + b) · h : 2 = (${a} + ${b}) · ${h} : 2 = ${S} см².`,
    { expr: '(a + b) · h : 2', vars: { a, b, h } });
}

const POLY_N = [5, 6, 8, 9, 10, 12] as const;

function famPolygon(L: Level, rng: Rng): GenQuestion {
  const kind = L.d === 2 ? pick(rng, ['each', 'sides'] as const) : pick(rng, ['sum', 'sum', 'each'] as const);
  if (kind === 'sum') {
    const n = pick(rng, [5, 6, 7, 8, 9, 10, 12] as const);
    const S = (n - 2) * 180;
    const name = countWord(n);
    return numQ(rng, `geo.psum:${n}`, `${name[0].toUpperCase()}${name.slice(1)} өнцөгтийн дотоод өнцгүүдийн нийлбэрийг ол.`, S, '°',
      [n * 180, (n - 1) * 180, (n - 3) * 180, 360], `(n − 2) · 180° = (${n} − 2) · 180° = ${S}°.`,
      { expr: '(n − 2) · 180', vars: { n } });
  }
  const n = pick(rng, POLY_N);
  const A = 180 - 360 / n;
  if (kind === 'each') {
    return numQ(rng, `geo.peach:${n}`, `Зөв ${countWord(n)} өнцөгтийн нэг дотоод өнцгийг ол.`, A, '°',
      [360 / n, (n - 2) * 180, 180 - 180 / n, A - 10], `(${n} − 2) · 180° : ${n} = ${A}°.`,
      { expr: '(n − 2) · 180 : n', vars: { n } });
  }
  return numQ(rng, `geo.psides:${n}`, `Зөв олон өнцөгтийн нэг дотоод өнцөг ${A}°. Энэ олон өнцөгт хэдэн талтай вэ?`, n, '',
    [n + 1, n - 1, n + 2, 360 / A], `Гадаад өнцөг 180° − ${A}° = ${180 - A}°, талын тоо 360° : ${180 - A}° = ${n}.`,
    { expr: '360 : (180 − a)', vars: { a: A } });
}

function famCylinder(L: Level, rng: Rng): GenQuestion {
  const r = randInt(rng, 2, 6 + L.g);
  const h = randInt(rng, 2, 10);
  return piQ(rng, `geo.cyl:${r},${h}`, `Цилиндрийн суурийн радиус ${r} см, өндөр ${h} см. Эзлэхүүнийг ол.`, r * r * h, CM3,
    [2 * r * h, r * h * h, r * h, 2 * r * r * h], `V = πr²h = π · ${r}² · ${h} = ${r * r * h}π см³.`, 'πr²h', { r, h }, 25);
}

function famCone(L: Level, rng: Rng): GenQuestion {
  const tri = chance(rng, 0.5);
  const [r, h] = tri
    ? pick(rng, [
        [3, 4],
        [6, 8],
        [5, 12],
        [4, 3],
        [9, 12],
      ] as const)
    : attempt(() => {
        const r = randInt(rng, 2, 6 + L.g);
        const h = randInt(rng, 2, 12);
        return (r * r * h) % 3 === 0 ? ([r, h] as const) : null;
      });
  const V = (r * r * h) / 3;
  const l = Math.sqrt(r * r + h * h);
  return piQ(rng, `geo.cone:${r},${h}`, `Конусын суурийн радиус ${r} см, өндөр ${h} см. Эзлэхүүнийг ол.`, V, CM3,
    [r * r * h, (r * h) / 3, isInt(l) ? r * l : 0, (r * r * h) / 2], `V = πr²h : 3 = π · ${r}² · ${h} : 3 = ${V}π см³.`,
    'πr²h : 3', { r, h }, 30);
}

function famSimilar(L: Level, rng: Rng): GenQuestion {
  if (L.d === 2 && chance(rng, 0.5)) {
    const [p, q] = pick(rng, [
      [1, 2],
      [2, 3],
      [1, 3],
      [3, 4],
      [2, 5],
    ] as const);
    const S1 = p * p * randInt(rng, 1, 4) * (p === 1 ? 2 : 1);
    const S2 = (S1 * q * q) / (p * p);
    return numQ(rng, `geo.simS:${p},${q},${S1}`,
      `Төсөөтэй хоёр гурвалжны харгалзах талууд ${p} : ${q} харьцаатай. Бага гурвалжны талбай ${S1} см² бол их гурвалжны талбайг ол.`,
      S2, CM2, [(S1 * q) / p, S1 + (q - p), (S1 * q * q * q) / (p * p * p), S1 * q],
      `Талбайн харьцаа нь талуудын харьцааны квадрат: ${S1} · ${q * q}/${p * p} = ${S2} см².`,
      { expr: 's · (q / p)²', vars: { s: S1, q, p } }, 30);
  }
  return attempt(() => {
    const k = pick(rng, [2, 3, 2, 4]);
    const ab = randInt(rng, 2, 8);
    const bc = randInt(rng, 2, 9);
    if (ab === bc) return null;
    const de = k * ab;
    const ef = k * bc;
    return numQ(rng, `geo.sim:${ab},${de},${bc}`,
      `ABC ба DEF гурвалжнууд төсөөтэй. AB = ${ab} см, BC = ${bc} см, DE = ${de} см. EF талын уртыг ол.`, ef, CM,
      [bc + (de - ab), (de * ab) / bc, de + bc, k * ab + 1], `Төсөөтэйн коэффициент ${de} : ${ab} = ${k}, EF = ${k} · ${bc} = ${ef} см.`,
      { expr: 'c · e : a', vars: { a: ab, c: bc, e: de } });
  });
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generateGeometry(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famRect, 3],
          [famTriArea, 2],
          [famAngles, 3],
          [famCircle, 1],
          [famSquare, 1],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famPythag, grade >= 7 ? 3 : 1],
            [famCircle, 2],
            [famTrapezoid, 2],
            [famPolygon, 2],
            [famSquare, 1],
            [famAngles, 1],
            [famSimilar, grade >= 8 ? 1.5 : 0.5],
          ])
        : weighted<Fam>(rng, [
            [famCylinder, 2],
            [famCone, grade >= 9 ? 2 : 0.5],
            [famSimilar, 2],
            [famPythag, 1.5],
            [famPolygon, 2],
            [famCircle, 1],
          ]);
  return fam(L, rng);
}

export default generateGeometry;
