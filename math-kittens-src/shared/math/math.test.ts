import { describe, expect, it } from 'vitest';
import {
  GENERATORS,
  TOPICS,
  generateQuestion,
  makeRng,
  pickAutoDifficulty,
  questionFromCustom,
  timeForDifficulty,
  topicsForGrade,
  type CustomQuestion,
  type Difficulty,
  type Grade,
  type Question,
  type TopicId,
} from './index';
import type { Check, GenQuestion } from './util';
import { SYS_INF, SYS_NONE, SYS_ONE } from './generators/systems';
import { Q_NONE, Q_ONE, Q_TWO } from './generators/quadratic';

const GRADES: Grade[] = [6, 7, 8, 9, 10, 11, 12];
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const N = 200;
const EPS = 1e-6;

/* ===================================================================== */
/* An independent evaluator for the formatted expressions                */
/* (U+2212, ·, :, a/b, mixed numbers, decimal comma, ², ³, √, π,          */
/* implicit multiplication, sin/cos/tan in degrees).                     */
/* ===================================================================== */

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'fn'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const s = src
    .replace(/−/g, '-')
    .replace(/[·×]/g, '*')
    .replace(/÷/g, ':')
    .replace(/(\d) (?=\d{3})/g, '$1')
    .replace(/(\d),(\d)/g, '$1.$2');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    if (rest[0] === ' ') {
      i++;
      continue;
    }
    const mixed = /^(\d+) (\d+)\/(\d+)/.exec(rest);
    if (mixed) {
      out.push({ t: 'num', v: +mixed[1] + +mixed[2] / +mixed[3] });
      i += mixed[0].length;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(rest);
    if (num) {
      out.push({ t: 'num', v: parseFloat(num[0]) });
      i += num[0].length;
      continue;
    }
    const fn = /^(sin|cos|tan)/.exec(rest);
    if (fn) {
      out.push({ t: 'fn', v: fn[1] });
      i += fn[1].length;
      continue;
    }
    if (/[a-zA-Z]/.test(rest[0])) {
      out.push({ t: 'id', v: rest[0] });
      i++;
      continue;
    }
    if ('+-*:/()√²³°π'.includes(rest[0])) {
      out.push({ t: 'op', v: rest[0] });
      i++;
      continue;
    }
    throw new Error(`unexpected "${rest[0]}" in "${src}"`);
  }
  return out;
}

const TOKENS = new Map<string, Tok[]>();

function evaluate(src: string, vars: Record<string, number> = {}): number {
  let toks = TOKENS.get(src);
  if (!toks) {
    toks = tokenize(src);
    TOKENS.set(src, toks);
  }
  let p = 0;
  const isOp = (v: string) => p < toks.length && toks[p].t === 'op' && toks[p].v === v;
  const startsPrimary = () => {
    const k = toks[p];
    if (!k) return false;
    return k.t !== 'op' || k.v === '(' || k.v === '√' || k.v === 'π';
  };
  const expr = (): number => {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const o = toks[p++].v;
      const r = term();
      v = o === '+' ? v + r : v - r;
    }
    return v;
  };
  const term = (): number => {
    let v = frac();
    for (;;) {
      if (isOp('*')) {
        p++;
        v *= frac();
      } else if (isOp(':')) {
        p++;
        v /= frac();
      } else if (startsPrimary()) v *= frac();
      else break;
    }
    return v;
  };
  const frac = (): number => {
    let v = unary();
    while (isOp('/')) {
      p++;
      v /= unary();
    }
    return v;
  };
  const unary = (): number => {
    if (isOp('-')) {
      p++;
      return -unary();
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return postfix();
  };
  const postfix = (): number => {
    let v = primary();
    for (;;) {
      if (isOp('²')) {
        p++;
        v = v * v;
      } else if (isOp('³')) {
        p++;
        v = v * v * v;
      } else if (isOp('°')) p++;
      else break;
    }
    return v;
  };
  const primary = (): number => {
    const k = toks[p++];
    if (!k) throw new Error(`unexpected end of "${src}"`);
    if (k.t === 'num') return k.v;
    if (k.t === 'id') {
      if (!(k.v in vars)) throw new Error(`unknown variable ${k.v} in "${src}"`);
      return vars[k.v];
    }
    if (k.t === 'fn') {
      let sq = false;
      if (isOp('²')) {
        p++;
        sq = true;
      }
      const r = (postfix() * Math.PI) / 180;
      const v = k.v === 'sin' ? Math.sin(r) : k.v === 'cos' ? Math.cos(r) : Math.tan(r);
      return sq ? v * v : v;
    }
    if (k.v === '(') {
      const v = expr();
      if (!isOp(')')) throw new Error(`missing ) in "${src}"`);
      p++;
      return v;
    }
    if (k.v === '√') return Math.sqrt(postfix());
    if (k.v === 'π') return Math.PI;
    throw new Error(`unexpected "${k.v}" in "${src}"`);
  };
  const v = expr();
  if (p !== toks.length) throw new Error(`trailing input in "${src}"`);
  return v;
}

/** Numeric reading of a choice: single number, ordered pair, or unordered set. */
type Parsed = { kind: 'num' | 'pair' | 'set'; vals: number[] };

function parseChoice(s: string): Parsed | null {
  let t = s.trim();
  if (/[<>≤≥=∞[\]]/.test(t)) return null;
  t = t.replace(/\s*см[²³]?/g, '').replace(/[₮%°]/g, '').trim();
  if (/[Ѐ-ӿ]/.test(t)) return null;
  if (/[a-zA-Z]/.test(t)) return null;
  if (/^\(.*;.*\)$/.test(t)) {
    const [a, b] = t.slice(1, -1).split(';');
    return { kind: 'pair', vals: [evaluate(a), evaluate(b)] };
  }
  if (t.includes(';')) {
    return { kind: 'set', vals: t.split(';').map((x) => evaluate(x)).sort((a, b) => a - b) };
  }
  if (t.startsWith('±')) {
    const v = evaluate(t.slice(1));
    return { kind: 'set', vals: [-v, v] };
  }
  return { kind: 'num', vals: [evaluate(t)] };
}

const num = (s: string): number => {
  const p = parseChoice(s);
  if (!p || p.kind !== 'num') throw new Error(`not a number choice: "${s}"`);
  return p.vals[0];
};

const close = (a: number, b: number) => Math.abs(a - b) < EPS * Math.max(1, Math.abs(a), Math.abs(b));

function choiceKey(s: string): string {
  const p = parseChoice(s);
  if (!p) return 's:' + s.replace(/\s+/g, ' ').trim();
  // sets with one element and plain numbers are the same value
  const kind = p.kind === 'set' && p.vals.length === 1 ? 'num' : p.kind;
  return `${kind}:${p.vals.map((v) => Math.round(v * 1e6) / 1e6).join(',')}`;
}

function sides(eq: string, vars: Record<string, number>): number {
  const parts = eq.split('=');
  if (parts.length !== 2) throw new Error(`not an equation: "${eq}"`);
  return evaluate(parts[0], vars) - evaluate(parts[1], vars);
}

/* ------------------------------ checks ------------------------------ */

function linCoeffs(eq: string, extra: Record<string, number> = {}): [number, number, number] {
  const f = (x: number, y: number) => sides(eq, { ...extra, x, y });
  const c0 = f(0, 0);
  const a = f(1, 0) - c0;
  const b = f(0, 1) - c0;
  expect(close(f(2, -3), 2 * a - 3 * b + c0), `non-linear equation "${eq}"`).toBe(true);
  return [a, b, -c0];
}

function classifySys(e1: number[], e2: number[]): 'one' | 'none' | 'inf' {
  const det = e1[0] * e2[1] - e2[0] * e1[1];
  if (Math.abs(det) > EPS) return 'one';
  const r1 = e1[0] * e2[2] - e2[0] * e1[2];
  const r2 = e1[1] * e2[2] - e2[1] * e1[2];
  return Math.abs(r1) < EPS && Math.abs(r2) < EPS ? 'inf' : 'none';
}

function quadCoeffs(eq: string): [number, number, number] {
  const f = (x: number) => sides(eq, { x });
  const c = f(0);
  const a = (f(1) + f(-1)) / 2 - c;
  const b = (f(1) - f(-1)) / 2;
  expect(close(f(2), 4 * a + 2 * b + c), `not quadratic "${eq}"`).toBe(true);
  expect(Math.abs(a) > EPS, `a = 0 in "${eq}"`).toBe(true);
  return [a, b, c];
}

function compileIneq(lines: string[]): (x: number) => boolean {
  const chains = lines.map((line) => {
    const parts = line.split(/\s*([<>≤≥])\s*/);
    return { exprs: parts.filter((_, i) => i % 2 === 0), ops: parts.filter((_, i) => i % 2 === 1) };
  });
  return (x) =>
    chains.every(({ exprs, ops }) => {
      const vals = exprs.map((e) => evaluate(e, { x }));
      return ops.every((op, i) => {
        const a = vals[i];
        const b = vals[i + 1];
        return op === '<' ? a < b - 1e-12 : op === '>' ? a > b + 1e-12 : op === '≤' ? a <= b + 1e-12 : a >= b - 1e-12;
      });
    });
}

function setPredicate(s: string): (x: number) => boolean {
  const ray = /^x ([<>≤≥]) (.+)$/.exec(s);
  if (ray) {
    const k = evaluate(ray[2]);
    const op = ray[1];
    return (x) => (op === '<' ? x < k : op === '>' ? x > k : op === '≤' ? x <= k : x >= k);
  }
  const iv = /^([[(])(.+); (.+)([\])])$/.exec(s);
  if (!iv) throw new Error(`cannot parse solution set "${s}"`);
  const lo = iv[2].includes('∞') ? -Infinity : evaluate(iv[2]);
  const hi = iv[3].includes('∞') ? Infinity : evaluate(iv[3]);
  const lc = iv[1] === '[';
  const hc = iv[4] === ']';
  return (x) => (lc ? x >= lo : x > lo) && (hc ? x <= hi : x < hi);
}

const GRID = Array.from({ length: 321 }, (_, i) => -40 + i * 0.25);

function rhsOfY(choice: string): string {
  const m = /^y = (.+)$/.exec(choice);
  if (!m) throw new Error(`not a "y = …" choice: ${choice}`);
  return m[1];
}

function verify(q: GenQuestion, label: string): void {
  const c = q.check as Check;
  const correct = q.choices[q.answer];
  const wrong = q.choices.filter((_, i) => i !== q.answer);
  const msg = `${label}: ${q.text} | ${(q.lines ?? []).join(' ; ')} | ${q.choices.join(' / ')} → ${correct}`;
  switch (c.kind) {
    case 'value': {
      const v = evaluate(c.expr, c.vars ?? {});
      expect(close(num(correct), v), msg).toBe(true);
      break;
    }
    case 'root': {
      const variable = c.variable ?? 'x';
      if (c.solution !== undefined) {
        expect(Math.abs(sides(c.equation, { [variable]: c.solution })) < EPS, msg).toBe(true);
        const want = evaluate(c.answer ?? variable, { [variable]: c.solution });
        expect(close(num(correct), want), msg).toBe(true);
      } else {
        expect(Math.abs(sides(c.equation, { [variable]: num(correct) })) < EPS, msg).toBe(true);
        for (const w of wrong) expect(Math.abs(sides(c.equation, { [variable]: num(w) })) > EPS, msg).toBe(true);
      }
      break;
    }
    case 'system': {
      const [x0, y0] = c.solution;
      // substitute the solution into both equations
      for (const e of c.equations) expect(Math.abs(sides(e, { x: x0, y: y0 })) < EPS, `${msg} [${e}]`).toBe(true);
      // and confirm it is the unique solution
      const [e1, e2] = c.equations.map((e) => linCoeffs(e));
      expect(classifySys(e1, e2), msg).toBe('one');
      if (c.target === 'pair') {
        const p = parseChoice(correct);
        expect(p?.kind, msg).toBe('pair');
        expect(close(p!.vals[0], x0) && close(p!.vals[1], y0), msg).toBe(true);
      } else {
        expect(close(num(correct), evaluate(c.target, { x: x0, y: y0 })), msg).toBe(true);
      }
      break;
    }
    case 'systemCount': {
      const [e1, e2] = c.equations.map((e) => linCoeffs(e));
      const kind = classifySys(e1, e2);
      expect(correct, msg).toBe(kind === 'one' ? SYS_ONE : kind === 'none' ? SYS_NONE : SYS_INF);
      break;
    }
    case 'systemParam': {
      const kindAt = (v: number) => {
        const [e1, e2] = c.equations.map((e) => linCoeffs(e, { [c.param]: v }));
        return classifySys(e1, e2);
      };
      expect(kindAt(num(correct)), msg).toBe(c.want);
      for (const w of wrong) expect(kindAt(num(w)), msg).not.toBe(c.want);
      break;
    }
    case 'quad': {
      const [a, b, cc] = quadCoeffs(c.equation);
      const D = b * b - 4 * a * cc;
      const roots = D < -EPS ? [] : Math.abs(D) < EPS ? [-b / (2 * a)] : [(-b - Math.sqrt(D)) / (2 * a), (-b + Math.sqrt(D)) / (2 * a)].sort((u, v) => u - v);
      if (c.ask === 'roots') {
        if (correct === Q_NONE) expect(roots.length, msg).toBe(0);
        else {
          const p = parseChoice(correct)!;
          const vals = p.vals.slice().sort((u, v) => u - v);
          expect(vals.length, msg).toBe(roots.length);
          vals.forEach((v, i) => expect(close(v, roots[i]), msg).toBe(true));
          // every listed root really satisfies the equation
          for (const v of vals) expect(Math.abs(sides(c.equation, { x: v })) < 1e-6, msg).toBe(true);
        }
      } else if (c.ask === 'count') {
        expect(correct, msg).toBe(roots.length === 2 ? Q_TWO : roots.length === 1 ? Q_ONE : Q_NONE);
      } else {
        const want =
          c.ask === 'sum' ? -b / a : c.ask === 'product' ? cc / a : c.ask === 'sumsq' ? (b / a) ** 2 - (2 * cc) / a : c.ask === 'disc' ? D : c.ask === 'max' ? roots[roots.length - 1] : roots[0];
        if (c.ask === 'max' || c.ask === 'min') expect(roots.length, msg).toBe(2);
        if (c.ask === 'sum' || c.ask === 'product' || c.ask === 'sumsq') expect(D >= 0, msg).toBe(true);
        expect(close(num(correct), want), msg).toBe(true);
      }
      break;
    }
    case 'ineq': {
      const truth = compileIneq(c.inequalities);
      if (c.ask === 'set') {
        const pred = setPredicate(correct);
        const bad = GRID.filter((x) => pred(x) !== truth(x));
        expect(bad, msg).toEqual([]);
        for (const w of wrong) {
          const pw = setPredicate(w);
          expect(GRID.some((x) => pw(x) !== truth(x)), `${msg} (wrong "${w}" is also correct)`).toBe(true);
        }
      } else {
        const ints: number[] = [];
        for (let x = -200; x <= 200; x++) if (truth(x)) ints.push(x);
        expect(ints.length > 0, msg).toBe(true);
        if (c.ask === 'min') {
          expect(ints[0] > -200, msg).toBe(true);
          expect(num(correct), msg).toBe(ints[0]);
        } else if (c.ask === 'max') {
          expect(ints[ints.length - 1] < 200, msg).toBe(true);
          expect(num(correct), msg).toBe(ints[ints.length - 1]);
        } else {
          expect(ints[0] > -200 && ints[ints.length - 1] < 200, msg).toBe(true);
          expect(num(correct), msg).toBe(ints.length);
        }
      }
      break;
    }
    case 'through': {
      const passes = (s: string) => c.points.every(([x, y]) => close(evaluate(rhsOfY(s), { x }), y));
      expect(passes(correct), msg).toBe(true);
      for (const w of wrong) expect(passes(w), `${msg} (wrong "${w}" also fits)`).toBe(false);
      break;
    }
    case 'vertex': {
      const p = parseChoice(correct)!;
      expect(p.kind, msg).toBe('pair');
      const [h, k] = p.vals;
      const f = (x: number) => evaluate(c.fx, { x });
      expect(close(f(h), k), msg).toBe(true);
      expect(close(f(h - 1), f(h + 1)), msg).toBe(true);
      expect(close(f(h - 1), k), msg).toBe(false);
      break;
    }
    case 'axisPoint': {
      const p = parseChoice(correct)!;
      expect(p.kind, msg).toBe('pair');
      const [px, py] = p.vals;
      if (c.axis === 'x') {
        expect(close(py, 0) && close(evaluate(c.fx, { x: px }), 0), msg).toBe(true);
      } else {
        expect(close(px, 0) && close(evaluate(c.fx, { x: 0 }), py), msg).toBe(true);
      }
      break;
    }
  }
}

/* --------------------------- structural rules --------------------------- */

const FORBIDDEN: Array<[RegExp, string]> = [
  [/NaN/, 'NaN'],
  [/undefined/, 'undefined'],
  [/Infinity/, 'Infinity'],
  [/\bnull\b/, 'null'],
  [/\[object/, '[object'],
  [/\+ −/, '+ −'],
  [/− −/, '− −'],
  [/\+ \+/, '+ +'],
  [/--/, '--'],
  [/(^|[\s(=+−·:;,{])1[a-z]/, '1x at term start'],
  [/(^|[^\d,])0[a-z]/, '0x'],
  [/[+−] 0(?![,\d])/, '+ 0'],
  [/−0(?![,\d])/, '−0'],
  [/-\d/, 'ASCII minus before a digit'],
  [/\s-\s/, 'ASCII minus'],
  [/\d\.\d/, 'decimal point instead of comma'],
  [/\*/, '*'],
  [/\^/, '^'],
  [/(^|= |\()\+(?!∞)/, 'leading +'],
  [/ {2}/, 'double space'],
];

function stringProblems(q: { text: string; lines?: string[]; choices: string[]; explanation: string }): string[] {
  const out: string[] = [];
  for (const s of [q.text, ...(q.lines ?? []), ...q.choices, q.explanation]) {
    for (const [re, name] of FORBIDDEN) if (re.test(s)) out.push(`forbidden ${name} in "${s}"`);
  }
  return out;
}

/** All rule violations of one question (empty = fine). Collected first so the hot loop stays fast. */
function structureProblems(q: Question, topic: TopicId, grade: Grade, difficulty: Difficulty): string[] {
  const out: string[] = [];
  const req = (ok: boolean, what: string) => {
    if (!ok) out.push(what);
  };
  req(q.topic === topic && q.grade === grade && q.difficulty === difficulty, 'topic/grade/difficulty mismatch');
  req(typeof q.id === 'string' && q.id.length > 0, 'empty id');
  req(q.key.startsWith(topic + ':'), `key "${q.key}" without topic prefix`);
  req(Array.isArray(q.choices) && q.choices.length === 4, 'not 4 choices');
  req(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `answer ${q.answer}`);
  for (const c of q.choices) {
    req(typeof c === 'string' && c.trim().length > 0, 'empty choice');
    req(c.length <= 32, `long choice "${c}"`);
  }
  req(new Set(q.choices.map((c) => c.replace(/\s+/g, ' ').trim())).size === 4, `duplicate choice text: ${q.choices.join(' / ')}`);
  let keys: string[] = [];
  try {
    keys = q.choices.map(choiceKey);
  } catch (e) {
    out.push(`unparseable choice in ${q.choices.join(' / ')}: ${(e as Error).message}`);
  }
  if (keys.length) req(new Set(keys).size === 4, `same value twice: ${q.choices.join(' / ')}`);
  req(q.text.trim().length > 0, 'empty text');
  req(q.text.length <= 150, `text too long (${q.text.length}): ${q.text}`);
  req(q.explanation.trim().length > 0, 'empty explanation');
  const band = { easy: [10, 15], medium: [18, 22], hard: [25, 30] }[difficulty];
  req(q.timeSuggested >= 10 && q.timeSuggested <= 30, `time ${q.timeSuggested}`);
  req(q.timeSuggested >= band[0] && q.timeSuggested <= band[1], `time ${q.timeSuggested} outside ${difficulty} band`);
  if (q.system) req((q.lines ?? []).length >= 2, 'system without lines');
  for (const l of q.lines ?? []) req(l.trim().length > 0, 'empty line');
  if (q.graph) {
    const nums = [q.graph.m, q.graph.b, q.graph.a, q.graph.h, q.graph.k].filter((v) => v !== undefined) as number[];
    for (const v of nums) req(Number.isFinite(v) && Math.abs(v) <= 6, `graph value ${v}`);
  }
  out.push(...stringProblems(q));
  return out.map((m) => `${topic}/${grade}/${difficulty} ${q.key}: ${m}`);
}

/* ================================ tests ================================ */

describe('generateQuestion — structure for every topic × grade × difficulty', () => {
  for (const t of TOPICS) {
    it(`${t.id}`, () => {
      const problems: string[] = [];
      for (const grade of GRADES) {
        for (const difficulty of DIFFS) {
          const rng = makeRng(grade * 7919 + DIFFS.indexOf(difficulty) * 104729 + t.id.length);
          for (let i = 0; i < N; i++) {
            const q = generateQuestion({ grade, topic: t.id, difficulty, rng });
            problems.push(...structureProblems(q, t.id, grade, difficulty));
          }
        }
      }
      expect(problems.slice(0, 10)).toEqual([]);
    }, 120_000);
  }
});

describe('independent math verification', () => {
  const MUST_CHECK: TopicId[] = ['systems', 'linear', 'quadratic', 'inequalities', 'fractions', 'arithmetic'];
  for (const t of TOPICS) {
    it(`${t.id}`, () => {
      let checked = 0;
      let total = 0;
      for (const grade of GRADES) {
        for (const difficulty of DIFFS) {
          const rng = makeRng(31337 + grade * 101 + DIFFS.indexOf(difficulty) * 7 + t.id.length * 13);
          for (let i = 0; i < N; i++) {
            const g = GENERATORS[t.id](grade, difficulty, rng);
            total++;
            if (MUST_CHECK.includes(t.id)) expect(g.check, `${t.id} ${g.key} has no check`).toBeDefined();
            if (g.check) {
              verify(g, `${t.id}/${grade}/${difficulty} ${g.key}`);
              checked++;
            }
          }
        }
      }
      expect(total).toBe(GRADES.length * DIFFS.length * N);
      if (MUST_CHECK.includes(t.id)) expect(checked).toBe(total);
      else expect(checked).toBeGreaterThan(0);
    }, 120_000);
  }
});

describe('evaluator sanity (the test oracle itself)', () => {
  it('parses school notation', () => {
    expect(evaluate('12 + 3 · 4')).toBe(24);
    expect(evaluate('−3²')).toBe(-9);
    expect(evaluate('(−3)²')).toBe(9);
    expect(close(evaluate('5/6 : 10/9'), 0.75)).toBe(true);
    expect(close(evaluate('2 1/3 + 1 3/4'), 49 / 12)).toBe(true);
    expect(close(evaluate('2,5 + 1,75'), 4.25)).toBe(true);
    expect(close(evaluate('2x − y', { x: 3, y: 1 }), 5)).toBe(true);
    expect(close(evaluate('√(3² + 4²) · 2'), 10)).toBe(true);
    expect(close(evaluate('2 sin 30° + tan 45°'), 2)).toBe(true);
    expect(close(evaluate('4 cos² 30°'), 3)).toBe(true);
    expect(close(evaluate('2π/3'), (2 * Math.PI) / 3)).toBe(true);
    expect(close(evaluate('6√3'), 6 * Math.sqrt(3))).toBe(true);
    expect(close(evaluate('30 000'), 30000)).toBe(true);
    expect(choiceKey('1/2')).toBe(choiceKey('0,5'));
    expect(choiceKey('±3')).toBe(choiceKey('−3; 3'));
  });
});

describe('answer position', () => {
  it('is roughly uniform', () => {
    const rng = makeRng(2024);
    const counts = [0, 0, 0, 0];
    const total = 12000;
    for (let i = 0; i < total; i++) {
      const grade = GRADES[i % GRADES.length];
      const q = generateQuestion({ grade, topic: 'mixed', difficulty: 'auto', rng });
      counts[q.answer]++;
    }
    for (const c of counts) expect(Math.abs(c - total / 4)).toBeLessThan(total * 0.025);
  });

  it('is uniform for the default topic too', () => {
    const rng = makeRng(99);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) counts[generateQuestion({ grade: 9, topic: 'systems', difficulty: 'medium', rng }).answer]++;
    for (const c of counts) expect(Math.abs(c - 2000)).toBeLessThan(200);
  });
});

describe('options', () => {
  it('mixed picks only topics of the grade', () => {
    for (const grade of GRADES) {
      const allowed = new Set(topicsForGrade(grade));
      const seen = new Set<string>();
      const rng = makeRng(grade);
      for (let i = 0; i < 600; i++) {
        const q = generateQuestion({ grade, topic: 'mixed', difficulty: 'medium', rng });
        expect(allowed.has(q.topic as TopicId), `${q.topic} at grade ${grade}`).toBe(true);
        seen.add(q.topic);
      }
      expect(seen.size).toBe(allowed.size);
    }
  });

  it('auto difficulty is about 35 / 45 / 20', () => {
    const rng = makeRng(7);
    const c = { easy: 0, medium: 0, hard: 0 };
    for (let i = 0; i < 20000; i++) c[pickAutoDifficulty(rng)]++;
    expect(Math.abs(c.easy / 20000 - 0.35)).toBeLessThan(0.02);
    expect(Math.abs(c.medium / 20000 - 0.45)).toBeLessThan(0.02);
    expect(Math.abs(c.hard / 20000 - 0.2)).toBeLessThan(0.02);
    const rng2 = makeRng(8);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(generateQuestion({ grade: 9, topic: 'systems', difficulty: 'auto', rng: rng2 }).difficulty);
    expect(seen.size).toBe(3);
  });

  it('defaults: systems, grade 9, medium takes 20 seconds', () => {
    expect(timeForDifficulty('easy')).toBe(15);
    expect(timeForDifficulty('medium')).toBe(20);
    expect(timeForDifficulty('hard')).toBe(30);
  });

  it('is deterministic for a seeded rng and keys identify the problem', () => {
    const a = generateQuestion({ grade: 9, topic: 'systems', difficulty: 'medium', rng: makeRng(5) });
    const b = generateQuestion({ grade: 9, topic: 'systems', difficulty: 'medium', rng: makeRng(5) });
    expect(a.key).toBe(b.key);
    expect(a.text).toBe(b.text);
    expect(a.choices).toEqual(b.choices);
    for (const t of TOPICS) {
      const byKey = new Map<string, string>();
      const rng = makeRng(77);
      for (let i = 0; i < 1500; i++) {
        const q = generateQuestion({ grade: GRADES[i % 7], topic: t.id, difficulty: DIFFS[i % 3], rng });
        // equation order inside a system does not make a different problem
        const sig = `${q.text}|${[...(q.lines ?? [])].sort().join('|')}|${q.choices[q.answer]}|${q.graph ? JSON.stringify(q.graph) : ''}`;
        const prev = byKey.get(q.key);
        if (prev !== undefined) expect(sig, `key collision ${q.key}`).toBe(prev);
        else byKey.set(q.key, sig);
      }
    }
  });

  it('avoidKeys makes generateQuestion pick a different problem', () => {
    for (let s = 1; s <= 60; s++) {
      const topic = TOPICS[s % TOPICS.length].id;
      const first = generateQuestion({ grade: 10, topic, difficulty: 'medium', rng: makeRng(s) });
      const again = generateQuestion({ grade: 10, topic, difficulty: 'medium', rng: makeRng(s), avoidKeys: [first.key] });
      expect(again.key, topic).not.toBe(first.key);
    }
  });

  it('never uses Math.random when an rng is passed', () => {
    const orig = Math.random;
    Math.random = () => {
      throw new Error('Math.random used');
    };
    try {
      const rng = makeRng(1);
      for (const t of TOPICS) for (const d of DIFFS) generateQuestion({ grade: 9, topic: t.id, difficulty: d, rng });
      generateQuestion({ grade: 8, topic: 'mixed', difficulty: 'auto', rng });
      questionFromCustom({ id: 'c', text: 't', choices: ['1', '2', '3', '4'], answer: 0, difficulty: 'easy' }, 7, rng);
    } finally {
      Math.random = orig;
    }
  });
});

describe('questionFromCustom', () => {
  const c: CustomQuestion = {
    id: 'teacher-1',
    text: '2 + 2 = ?',
    choices: ['3', '4', '5', '22'],
    answer: 1,
    difficulty: 'easy',
  };

  it('keeps the right answer after shuffling', () => {
    const rng = makeRng(3);
    const pos = [0, 0, 0, 0];
    for (let i = 0; i < 400; i++) {
      const q = questionFromCustom(c, 6, rng);
      expect(q.choices[q.answer]).toBe('4');
      expect([...q.choices].sort()).toEqual([...c.choices].sort());
      pos[q.answer]++;
    }
    for (const p of pos) expect(p).toBeGreaterThan(60);
  });

  it('fills the defaults', () => {
    const q = questionFromCustom(c, 8, makeRng(1));
    expect(q.custom).toBe(true);
    expect(q.topic).toBe('custom');
    expect(q.grade).toBe(8);
    expect(q.explanation).toBe('Зөв хариулт: 4');
    expect(q.timeSuggested).toBe(timeForDifficulty('easy'));
    expect(q.key).toBe('custom:teacher-1');
    expect(q.id.length).toBeGreaterThan(0);
  });

  it('respects topic, explanation and time overrides', () => {
    const q = questionFromCustom({ ...c, topic: 'arithmetic', explanation: 'Хоёр дээр хоёрыг нэмбэл 4.', time: 25, difficulty: 'hard' }, 9, makeRng(2));
    expect(q.topic).toBe('arithmetic');
    expect(q.explanation).toBe('Хоёр дээр хоёрыг нэмбэл 4.');
    expect(q.timeSuggested).toBe(25);
    expect(q.difficulty).toBe('hard');
    const q2 = questionFromCustom({ ...c, difficulty: 'medium' }, 9, makeRng(2));
    expect(q2.timeSuggested).toBe(20);
  });
});
