// Функц ба график: values, slope, intercepts, a line read from a graph,
// parabola vertex, composition, line through two points.

import type { Difficulty, Grade, GraphSpec } from '../types';
import {
  type GenQuestion,
  type Level,
  type Opt,
  type Rng,
  attempt,
  chance,
  coef,
  fmt,
  frac,
  level,
  lin,
  make,
  minusStr,
  nearInts,
  opt,
  optFrac,
  optNum,
  optPair,
  pick,
  plus,
  pn,
  poly,
  randInt,
  randNZ,
  shift,
  weighted,
} from '../util';

const linF = (m: number, b: number) => lin([[m, 'x']], b);
/** "y = 2x + 1" as a choice, keyed by (m, b) so equal lines collapse. */
const lineOpt = (m: number, b: number): Opt => opt(`y = ${linF(m, b)}`, `line:${m},${b}`);
/** Vertex form a(x − h)² + k */
export function vertexForm(a: number, h: number, k: number): string {
  return `${coef(a)}${shift('x', -h)}²${plus(k)}`;
}
const parabOpt = (a: number, h: number, k: number): Opt => opt(`y = ${vertexForm(a, h, k)}`, `par:${a},${h},${k}`);

/** f(k) for a linear function. */
function famLinValue(L: Level, rng: Rng): GenQuestion {
  const m = L.neg ? randNZ(rng, -5, 6) : randInt(rng, 2, 6);
  const b = L.neg ? randNZ(rng, -10, 10) : randInt(rng, 1, 10);
  const k = L.neg ? randNZ(rng, -5, 6) : randInt(rng, 1, 6);
  const fx = linF(m, b);
  const v = m * k + b;
  const ok = (n: number) => L.neg || n >= 0;
  return make(rng, {
    key: `fn.lin:${m},${b},${k}`,
    text: 'Функцийн утгыг ол.',
    lines: [`f(x) = ${fx}`, `f(${fmt(k)}) = ?`],
    correct: optNum(v),
    wrong: [m * k - b, m * (k + b), m + k + b, -v, -m * k + b].filter(ok).map((n) => optNum(n)),
    more: nearInts(rng, v, (n) => optNum(n), { ok }),
    explanation: `f(${fmt(k)}) = ${coef(m) === '' ? '' : `${fmt(m)} · `}${pn(k)}${plus(b)} = ${fmt(v)}.`,
    check: { kind: 'value', expr: fx, vars: { x: k } },
  });
}

/** f(k) for a quadratic function (watch the sign of k²). */
function famQuadValue(L: Level, rng: Rng): GenQuestion {
  const a = L.d === 2 ? randNZ(rng, L.neg ? -2 : 1, 3) : 1;
  const b = L.neg ? randNZ(rng, -6, 6) : randInt(rng, 1, 6);
  const c = L.neg ? randInt(rng, -9, 9) : randInt(rng, 0, 9);
  const k = L.neg ? randNZ(rng, -4, 4) : randInt(rng, 1, 4);
  const fx = poly(a, b, c);
  const v = a * k * k + b * k + c;
  return make(rng, {
    key: `fn.quad:${a},${b},${c},${k}`,
    text: 'Функцийн утгыг ол.',
    lines: [`f(x) = ${fx}`, `f(${fmt(k)}) = ?`],
    correct: optNum(v),
    wrong: [-a * k * k + b * k + c, a * k * k - b * k + c, a * 2 * k + b * k + c, v + 2 * c]
      .filter((n) => L.neg || n >= 0)
      .map((n) => optNum(n)),
    more: nearInts(rng, v, (n) => optNum(n), { ok: (n) => L.neg || n >= 0 }),
    explanation: `f(${fmt(k)}) = ${lin([[a * k * k, '']], 0)}${plus(b * k)}${plus(c)} = ${fmt(v)}.`,
    check: { kind: 'value', expr: fx, vars: { x: k } },
  });
}

/** Slope through two points. */
function famSlope(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const x1 = randInt(rng, L.neg ? -5 : 0, 5);
    const dx = randNZ(rng, L.d === 2 ? -4 : 1, 4);
    const m = L.d === 2 ? frac(randNZ(rng, -5, 5), Math.abs(dx)) : frac(L.neg ? randNZ(rng, -4, 4) : randInt(rng, 1, 4));
    const dy = m.mul(dx);
    if (!dy.isInt()) return null;
    const y1 = randInt(rng, L.neg ? -5 : 0, 6);
    const x2 = x1 + dx;
    const y2 = y1 + dy.n;
    if (!L.neg && (x2 < 0 || y2 < 0)) return null;
    const wrong = [
      dy.n !== 0 ? frac(dx, dy.n) : null,
      m.neg(),
      x1 + x2 !== 0 ? frac(y1 + y2, x1 + x2) : null,
      frac(dy.n),
      x1 + x2 !== 0 ? frac(dy.n, x1 + x2) : null,
    ];
    const okF = (f: ReturnType<typeof frac> | null) => (f && (L.neg || f.n > 0) ? f : null);
    return make(rng, {
      key: `fn.slope:${x1},${y1},${x2},${y2}`,
      text: `A(${fmt(x1)}; ${fmt(y1)}) ба B(${fmt(x2)}; ${fmt(y2)}) цэгүүдийг дайрсан шулууны өнцгийн коэффициентийг ол.`,
      correct: optFrac(m),
      wrong: wrong.map(okF).map((f) => (f ? optFrac(f) : null)),
      more: () => {
        const f = okF(m.add(frac(randNZ(rng, -4, 4), randInt(rng, 1, 2))));
        return f ? optFrac(f) : null;
      },
      explanation: `k = (${minusStr(y2, y1)}) : (${minusStr(x2, x1)}) = ${fmt(dy.n)} : ${pn(dx)} = ${m.toString()}.`,
      check: { kind: 'value', expr: '(b − d) : (a − c)', vars: { a: x2, b: y2, c: x1, d: y1 } },
    });
  });
}

/** Intersections with the axes and the zero of a linear function. */
function famIntercept(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const kind = pick(rng, ['x', 'y', 'zero'] as const);
    const m = L.neg ? randNZ(rng, -4, 4) : randInt(rng, 1, 4);
    // without negatives: a positive x-intercept needs b < 0, a positive y-intercept needs b > 0
    const r = L.neg ? randNZ(rng, -6, 6) : kind === 'y' ? -randInt(rng, 1, 6) : randInt(rng, 1, 6);
    const b = -m * r;
    const fx = linF(m, b);
    const okP = (p: [number, number]) => L.neg || (p[0] >= 0 && p[1] >= 0);
    const P = (p: [number, number]) => (okP(p) ? optPair(p[0], p[1]) : null);
    if (kind === 'zero') {
      return make(rng, {
        key: `fn.zero:${m},${b}`,
        text: 'Функцийн тэгийг ол.',
        lines: [`f(x) = ${fx}`],
        correct: optNum(r),
        wrong: [-r, b, -b, m].filter((n) => L.neg || n > 0).map((n) => optNum(n)),
        more: nearInts(rng, r, (n) => optNum(n), { ok: (n) => L.neg || n > 0 }),
        explanation: `${fx} = 0 ⇒ ${lin([[m, 'x']])} = ${fmt(-b)} ⇒ x = ${fmt(r)}.`,
        check: { kind: 'root', equation: `${fx} = 0` },
      });
    }
    const isX = kind === 'x';
    return make(rng, {
      key: `fn.axis${kind}:${m},${b}`,
      text: `Шулуун ${kind} тэнхлэгийг огтлох цэгийг ол.`,
      lines: [`y = ${fx}`],
      correct: isX ? optPair(r, 0) : optPair(0, b),
      wrong: isX ? [P([0, b]), P([-r, 0]), P([0, r]), P([b, 0]), P([0, -b]), P([m, 0])] : [P([b, 0]), P([0, -b]), P([r, 0]), P([0, m]), P([-r, 0]), P([0, r])],
      more: () => (isX ? P([r + randNZ(rng, -3, 3), 0]) : P([0, b + randNZ(rng, -3, 3)])),
      explanation: isX
        ? `y = 0 үед ${fx} = 0 ⇒ x = ${fmt(r)}. Цэг (${fmt(r)}; 0).`
        : `x = 0 үед y = ${fmt(b)}. Цэг (0; ${fmt(b)}).`,
      check: { kind: 'axisPoint', fx, axis: kind },
    });
  });
}

/** Which equation is drawn? */
function famGraphLine(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const m = L.neg ? randNZ(rng, -3, 3) : randInt(rng, 1, 3);
    const b = randInt(rng, L.neg ? -4 : 0, 4);
    if (m === b) return null;
    let x1 = [1, 2, -1, -2].find((x) => Math.abs(m * x + b) <= 5);
    if (x1 === undefined) return null;
    if (b === 0) x1 = 2;
    const y1 = m * x1 + b;
    const pts: [number, number][] = [
      [0, b],
      [x1, y1],
    ];
    const graph: GraphSpec = { kind: 'line', m, b, points: pts, xRange: [-6, 6], yRange: [-6, 6] };
    return make(rng, {
      key: `fn.graph:${m},${b}`,
      text: 'Графикт дүрсэлсэн шулууны тэгшитгэлийг ол.',
      graph,
      correct: lineOpt(m, b),
      wrong: [b !== 0 ? lineOpt(b, m) : null, L.neg ? lineOpt(-m, b) : null, L.neg && b !== 0 ? lineOpt(m, -b) : null, lineOpt(m, b + m), lineOpt(m + 1, b), m > 1 ? lineOpt(m - 1, b) : null],
      more: () => lineOpt(L.neg ? randNZ(rng, -3, 3) : randInt(rng, 1, 3), randInt(rng, L.neg ? -4 : 0, 4)),
      explanation: `Шулуун (0; ${fmt(b)}) ба (${fmt(x1)}; ${fmt(y1)}) цэгүүдийг дайрна: b = ${fmt(b)}, k = ${fmt(m)}.`,
      check: { kind: 'through', points: pts },
    });
  });
}

/** Line through two points (equation). */
function famTwoPoints(L: Level, rng: Rng): GenQuestion {
  return attempt(() => {
    const m = L.neg ? randNZ(rng, -4, 4) : randInt(rng, 1, 4);
    const b = randInt(rng, L.neg ? -6 : 0, 6);
    const x1 = randInt(rng, L.neg ? -3 : 0, 3);
    const x2 = x1 + randInt(rng, 1, 3);
    const y1 = m * x1 + b;
    const y2 = m * x2 + b;
    if (x1 === 0) return null;
    return make(rng, {
      key: `fn.two:${x1},${y1},${x2},${y2}`,
      text: `A(${fmt(x1)}; ${fmt(y1)}) ба B(${fmt(x2)}; ${fmt(y2)}) цэгүүдийг дайрсан шулууны тэгшитгэлийг ол.`,
      correct: lineOpt(m, b),
      wrong: [lineOpt(m, y1), lineOpt(-m, b), lineOpt(m, y1 + m * x1), b !== 0 ? lineOpt(m, -b) : null, lineOpt(m + 1, b - x1)],
      more: () => lineOpt(m + randNZ(rng, -2, 2), b + randInt(rng, -3, 3)),
      explanation: `k = (${minusStr(y2, y1)}) : (${minusStr(x2, x1)}) = ${fmt(m)}, b = ${fmt(y1)} − ${pn(m)} · ${pn(x1)} = ${fmt(b)}.`,
      time: 30,
      check: {
        kind: 'through',
        points: [
          [x1, y1],
          [x2, y2],
        ],
      },
    });
  });
}

/** Vertex of y = a(x − h)² + k or y = x² + bx + c. */
function famVertex(L: Level, rng: Rng): GenQuestion {
  if (L.d < 2 || chance(rng, 0.4)) {
    const a = pick(rng, L.neg ? [1, 2, -1, -2, 3] : [1, 2, 3]);
    const h = randNZ(rng, L.neg ? -6 : 1, 6);
    const k = L.neg ? randInt(rng, -6, 6) : randInt(rng, 0, 6);
    const fx = vertexForm(a, h, k);
    return make(rng, {
      key: `fn.vtx:${a},${h},${k}`,
      text: 'Параболын оройн координатыг ол.',
      lines: [`y = ${fx}`],
      correct: optPair(h, k),
      wrong: [optPair(-h, k), k !== 0 ? optPair(h, -k) : null, optPair(k, h), optPair(-h, -k), optPair(h, a + k), optPair(h + 1, k), optPair(h, k + 1)].filter(
        (o) => o && (L.neg || !o.text.includes('−')),
      ),
      more: () => optPair(h + randNZ(rng, -2, 2), k + randInt(rng, -2, 2)),
      explanation: `y = a(x − h)² + k хэлбэрийн параболын орой (h; k) тул (${fmt(h)}; ${fmt(k)}).`,
      check: { kind: 'vertex', fx },
    });
  }
  const h = randNZ(rng, -5, 5);
  const b = -2 * h;
  const c = randInt(rng, -8, 8);
  const k = c - h * h;
  const fx = poly(1, b, c);
  return make(rng, {
    key: `fn.vtx2:${b},${c}`,
    text: 'Параболын оройн координатыг ол.',
    lines: [`y = ${fx}`],
    correct: optPair(h, k),
    wrong: [optPair(-h, c + h * h), optPair(h, c), optPair(-h, k), optPair(h, c + h * h), optPair(b, c)],
    more: () => optPair(h + randNZ(rng, -2, 2), k + randInt(rng, -2, 2)),
    explanation: `Оройн абсцисс x = −b/(2a) = ${fmt(h)}, ординат y = ${pn(h)}²${plus(b * h)}${plus(c)} = ${fmt(k)}.`,
    time: 30,
    check: { kind: 'vertex', fx },
  });
}

/** Which parabola is drawn? */
function famGraphParabola(L: Level, rng: Rng): GenQuestion {
  const a = L.neg && chance(rng, 0.4) ? -1 : 1;
  const h = randNZ(rng, -3, 3);
  const k = randNZ(rng, -4, 4);
  const pts: [number, number][] = [
    [h, k],
    [h - 1, k + a],
    [h + 1, k + a],
  ];
  return make(rng, {
    key: `fn.gpar:${a},${h},${k}`,
    text: 'Графикт дүрсэлсэн параболын тэгшитгэлийг ол.',
    graph: { kind: 'parabola', a, h, k, points: [[h, k]], xRange: [-6, 6], yRange: [-6, 6] },
    correct: parabOpt(a, h, k),
    wrong: [parabOpt(a, -h, k), parabOpt(a, h, -k), parabOpt(-a, h, k), parabOpt(a, k, h), parabOpt(a, -h, -k)],
    more: () => parabOpt(a, h + randNZ(rng, -2, 2), k + randInt(rng, -2, 2)),
    explanation: `Параболын орой (${fmt(h)}; ${fmt(k)}), салаа нь ${a > 0 ? 'дээшээ' : 'доошоо'} тул y = ${vertexForm(a, h, k)}.`,
    check: { kind: 'through', points: pts },
  });
}

/** f(g(k)) */
function famCompose(L: Level, rng: Rng): GenQuestion {
  const m = randNZ(rng, -3, 4);
  const b = randInt(rng, -6, 6);
  const quadG = chance(rng, 0.6);
  const ga = quadG ? 1 : randNZ(rng, -3, 3);
  const gc = randInt(rng, -5, 5);
  const fx = linF(m, b);
  const gx = quadG ? poly(1, 0, gc) : linF(ga, gc);
  const g = (x: number) => (quadG ? x * x + gc : ga * x + gc);
  const f = (x: number) => m * x + b;
  const k = randNZ(rng, -3, 3);
  const swap = chance(rng, 0.35);
  const inner = swap ? f(k) : g(k);
  const v = swap ? g(inner) : f(inner);
  const other = swap ? f(g(k)) : g(f(k));
  const outerName = swap ? 'g' : 'f';
  const innerName = swap ? 'f' : 'g';
  const outerExpr = swap ? gx : fx;
  return make(rng, {
    key: `fn.comp:${fx}|${gx}|${k}|${swap ? 'gf' : 'fg'}`,
    text: 'Нийлмэл функцийн утгыг ол.',
    lines: [`f(x) = ${fx}`, `g(x) = ${gx}`, `${outerName}(${innerName}(${fmt(k)})) = ?`],
    correct: optNum(v),
    wrong: [other, f(k) * g(k), f(k) + g(k), inner].map((n) => optNum(n)),
    more: nearInts(rng, v, (n) => optNum(n), { spread: 4 }),
    explanation: `${innerName}(${fmt(k)}) = ${fmt(inner)}, ${outerName}(${fmt(inner)}) = ${fmt(v)}.`,
    time: 30,
    check: { kind: 'value', expr: outerExpr.replace(/x/g, `(${swap ? fx : gx})`), vars: { x: k } },
  });
}

type Fam = (L: Level, rng: Rng) => GenQuestion;

export function generateFunctions(grade: Grade, difficulty: Difficulty, rng: Rng): GenQuestion {
  const L = level(grade, difficulty);
  const fam =
    L.d === 0
      ? weighted<Fam>(rng, [
          [famLinValue, 4],
          [famIntercept, 3],
          [famGraphLine, L.g >= 1 ? 2 : 1],
        ])
      : L.d === 1
        ? weighted<Fam>(rng, [
            [famQuadValue, 2],
            [famSlope, 2],
            [famGraphLine, 2],
            [famIntercept, 1],
            [famVertex, L.g >= 1 ? 2 : 0.5],
            [famGraphParabola, L.g >= 1 ? 1 : 0],
          ])
        : weighted<Fam>(rng, [
            [famCompose, 2],
            [famVertex, 2],
            [famSlope, 1.5],
            [famTwoPoints, 2],
            [famGraphParabola, 1],
            [famQuadValue, 1],
          ]);
  return fam(L, rng);
}

export default generateFunctions;
