import { describe, expect, it, vi } from 'vitest';

vi.mock('../math', () => {
  let n = 0;
  const make = () => {
    n += 1;
    return {
      id: `q${n}`,
      key: `k${n}`,
      topic: 'systems',
      difficulty: 'medium',
      grade: 9,
      text: 'Системийг бод.',
      lines: ['x + y = 5', 'x − y = 1'],
      system: true,
      choices: ['(3; 2)', '(2; 3)', '(4; 1)', '(1; 4)'],
      answer: n % 4,
      explanation: 'x = 3, y = 2',
      timeSuggested: 20,
    };
  };
  return {
    generateQuestion: make,
    questionFromCustom: (c: any) => ({ ...make(), text: c.text, choices: c.choices, answer: c.answer, custom: true }),
  };
});

import { applyAction, createGame, DEFAULT_SETTINGS, forfeit, nextDeadline, pendingActorId, setEngineRng, tick } from './engine';
import { planBot } from './bot';
import { makeView } from './view';
import type { BotLevel, GameState, SeatInfo } from './types';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seats(n: number, level: BotLevel = 'medium'): SeatInfo[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: i, isBot: true, botLevel: level }));
}

function totalCards(s: GameState) {
  let held = 0;
  const ph = s.phase;
  if (ph.kind === 'rescue' || ph.kind === 'insert') held = 1;
  if (ph.kind === 'math' && ph.math.purpose === 'explode') held = 1;
  return s.deck.length + s.discard.length + s.players.reduce((a, p) => a + p.hand.length, 0) + held;
}

function bombsInPlay(s: GameState) {
  let n = s.deck.filter((c) => c.type === 'explode').length;
  const ph = s.phase;
  if (ph.kind === 'rescue' || ph.kind === 'insert') n += 1;
  if (ph.kind === 'math' && ph.math.purpose === 'explode') n += 1;
  return n;
}

function simulate(n: number, seed: number, level: BotLevel, settings = DEFAULT_SETTINGS) {
  const rnd = mulberry32(seed);
  setEngineRng(rnd);
  let now = 1_000_000;
  const s = createGame(seats(n, level), settings, now);
  const initial = totalCards(s);
  let steps = 0;
  while (s.phase.kind !== 'over' && steps < 20000) {
    steps++;
    const actor = pendingActorId(s)!;
    const plan = planBot(s, actor, now, rnd);
    if (plan && plan.action) {
      now = Math.max(now, plan.at);
      applyAction(s, plan.action, now);
    } else {
      now = Math.max(now, nextDeadline(s) ?? now);
      tick(s, now);
    }
    expect(totalCards(s)).toBe(initial);
    for (const p of s.players) {
      expect(p.hand.some((c) => c.type === 'explode')).toBe(false);
      if (!p.alive) expect(p.hand.length).toBe(0);
    }
    if ((s.phase as { kind: string }).kind !== 'over') {
      expect(bombsInPlay(s)).toBe(s.players.filter((p) => p.alive).length - 1);
      expect(s.players[s.current].alive).toBe(true);
    }
  }
  return { s, steps };
}

describe('engine', () => {
  it('deals 5 cards including one rescue to every player', () => {
    setEngineRng(mulberry32(1));
    for (let n = 2; n <= 5; n++) {
      const s = createGame(seats(n), DEFAULT_SETTINGS, 0);
      for (const p of s.players) {
        expect(p.hand.length).toBe(5);
        expect(p.hand.filter((c) => c.type === 'rescue').length).toBeGreaterThanOrEqual(1);
        expect(p.hand.some((c) => c.type === 'explode')).toBe(false);
      }
      expect(s.deck.filter((c) => c.type === 'explode').length).toBe(n - 1);
    }
  });

  it('bot-only games always finish with exactly one winner and keep invariants', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const n = 2 + (seed % 4);
      const level: BotLevel = (['easy', 'medium', 'hard'] as const)[seed % 3];
      const { s, steps } = simulate(n, seed, level);
      expect(s.phase.kind).toBe('over');
      expect(steps).toBeLessThan(20000);
      const alive = s.players.filter((p) => p.alive);
      expect(alive.length).toBe(1);
      expect(s.winnerId).toBe(alive[0].id);
      const places = s.players.map((p) => p.place).sort();
      expect(places).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  it('works with math on every action card and a turn timer', () => {
    for (let seed = 200; seed < 230; seed++) {
      const { s } = simulate(4, seed, 'medium', { ...DEFAULT_SETTINGS, mathOnActions: true, turnTimeLimit: 30 });
      expect(s.phase.kind).toBe('over');
    }
  });

  it('rejects out-of-turn and invalid actions', () => {
    setEngineRng(mulberry32(7));
    const s = createGame(seats(3), DEFAULT_SETTINGS, 0);
    expect(() => applyAction(s, { type: 'draw', playerId: 'p1' }, 0)).toThrow();
    const rescue = s.players[0].hand.find((c) => c.type === 'rescue')!;
    expect(() => applyAction(s, { type: 'play', playerId: 'p0', cardId: rescue.id }, 0)).toThrow();
    expect(() => applyAction(s, { type: 'answer', playerId: 'p0', choice: 0 }, 0)).toThrow();
  });

  it('hides secrets in views', () => {
    setEngineRng(mulberry32(9));
    let now = 0;
    const s = createGame(seats(2), DEFAULT_SETTINGS, now);
    // Force a bomb on top and draw it.
    const bomb = s.deck.findIndex((c) => c.type === 'explode');
    s.deck.unshift(...s.deck.splice(bomb, 1));
    applyAction(s, { type: 'draw', playerId: 'p0' }, now);
    expect(s.phase.kind).toBe('math');
    const v1 = makeView(s, 'p1', now);
    expect(v1.phase.kind).toBe('math');
    expect(JSON.stringify(v1)).not.toContain('"answer":');
    expect(v1.hand.length).toBe(5);
    const v0 = makeView(s, 'p0', now);
    expect(v0.players[1].handCount).toBe(5);
    expect(JSON.stringify(v0.players)).not.toContain('"hand"');
    // Answer correctly, hide it at position 3, other player must not learn the position.
    now += 5000;
    const m = (s.phase as any).math;
    applyAction(s, { type: 'answer', playerId: 'p0', choice: m.question.answer }, now);
    expect(s.phase.kind).toBe('insert');
    applyAction(s, { type: 'insert', playerId: 'p0', position: 3 }, now);
    expect(s.deck[3].type).toBe('explode');
    const ins1 = makeView(s, 'p1', now).events.find((e) => e.type === 'inserted') as any;
    const ins0 = makeView(s, 'p0', now).events.find((e) => e.type === 'inserted') as any;
    expect(ins1.position).toBe(-1);
    expect(ins0.position).toBe(3);
    expect(s.players[1].id).toBe(makeView(s, 'p1', now).currentId);
  });

  it('wrong answer uses the rescue card, then eliminates without one', () => {
    setEngineRng(mulberry32(11));
    let now = 0;
    const s = createGame(seats(2), DEFAULT_SETTINGS, now);
    const putBombOnTop = () => {
      const bomb = s.deck.findIndex((c) => c.type === 'explode');
      s.deck.unshift(...s.deck.splice(bomb, 1));
    };
    putBombOnTop();
    applyAction(s, { type: 'draw', playerId: 'p0' }, now);
    now += 3000;
    let m = (s.phase as any).math;
    applyAction(s, { type: 'answer', playerId: 'p0', choice: (m.question.answer + 1) % 4 }, now);
    expect(s.phase.kind).toBe('rescue');
    applyAction(s, { type: 'useRescue', playerId: 'p0' }, now);
    expect(s.players[0].hand.some((c) => c.type === 'rescue')).toBe(false);
    applyAction(s, { type: 'insert', playerId: 'p0', position: 0 }, now);
    // p1 draws the bomb, times out, uses their rescue automatically and hides it again.
    applyAction(s, { type: 'draw', playerId: 'p1' }, now);
    now = (s.phase as any).math.deadline;
    tick(s, now);
    expect(s.phase.kind).toBe('rescue');
    // p1 hides it on top; p0 (no rescue left in hand unless drawn) draws it and fails.
    applyAction(s, { type: 'useRescue', playerId: 'p1' }, now);
    applyAction(s, { type: 'insert', playerId: 'p1', position: 0 }, now);
    s.players[0].hand = s.players[0].hand.filter((c) => c.type !== 'rescue');
    applyAction(s, { type: 'draw', playerId: 'p0' }, now);
    now += 3000;
    m = (s.phase as any).math;
    applyAction(s, { type: 'answer', playerId: 'p0', choice: (m.question.answer + 1) % 4 }, now);
    expect(s.phase.kind).toBe('over');
    expect(s.winnerId).toBe('p1');
  });

  it('forfeit keeps the game consistent', () => {
    setEngineRng(mulberry32(21));
    const s = createGame(seats(3), DEFAULT_SETTINGS, 0);
    forfeit(s, 'p0', 0);
    expect(s.players[0].alive).toBe(false);
    expect(s.deck.filter((c) => c.type === 'explode').length).toBe(1);
    expect(s.players[s.current].alive).toBe(true);
    forfeit(s, 'p2', 0);
    expect(s.phase.kind).toBe('over');
    expect(s.winnerId).toBe('p1');
  });
});
