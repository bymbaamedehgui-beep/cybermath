// Computer opponents. A bot only uses what a real player could know:
// its own hand, public counts, and the top cards it has peeked at itself.

import type { CardType } from '../cards';
import { explodesInDeck, pendingActorId } from './engine';
import type { BotLevel, GameAction, GameState, PlayerState } from './types';

export interface BotPlan {
  /** When to perform the action (same clock as the game state). null action = let the timer run out. */
  at: number;
  action: GameAction | null;
}

const ACCURACY: Record<BotLevel, number> = { easy: 0.5, medium: 0.72, hard: 0.88 };
const THINK: Record<BotLevel, [number, number]> = {
  easy: [0.45, 0.9],
  medium: [0.3, 0.75],
  hard: [0.18, 0.5],
};
const SMART: Record<BotLevel, number> = { easy: 0.35, medium: 0.7, hard: 1 };

export const BOT_NAMES = ['Хөвсгөр', 'Цоохор', 'Шаргал', 'Бамбар', 'Мишээл', 'Сүүдэр', 'Тараг', 'Боов'];

function between(rnd: () => number, a: number, b: number) {
  return a + (b - a) * rnd();
}

function richestOpponent(state: GameState, me: PlayerState): PlayerState | undefined {
  let best: PlayerState | undefined;
  for (const p of state.players) {
    if (p.id === me.id || !p.alive || p.hand.length === 0) continue;
    if (!best || p.hand.length > best.hand.length) best = p;
  }
  return best;
}

function decideTurn(state: GameState, me: PlayerState, level: BotLevel, rnd: () => number): GameAction {
  const smart = SMART[level];
  const top = state.memory[me.id]?.top ?? [];
  const find = (t: CardType) => me.hand.find((c) => c.type === t);
  const play = (cardId: string, targetId?: string): GameAction => ({ type: 'play', playerId: me.id, cardId, targetId });
  const draw: GameAction = { type: 'draw', playerId: me.id };
  const others = state.players.filter((p) => p.alive && p.id !== me.id);
  const danger = explodesInDeck(state) / Math.max(1, state.deck.length);

  if (top[0] === 'explode') {
    for (const t of ['attack', 'skip', 'reverse', 'shuffle'] as CardType[]) {
      const c = find(t);
      if (c && rnd() < 0.55 + 0.45 * smart) return play(c.id);
    }
    return draw;
  }
  if (state.playsThisTurn >= 3) return draw;

  const rich = richestOpponent(state, me);
  const steal = find('steal');
  if (top.length > 0) {
    // Known safe top card: grab something first, then draw.
    if (steal && rich && rnd() < 0.5) return play(steal.id, rich.id);
    return draw;
  }
  const attack = find('attack');
  if (state.turnsRemaining > 1 && attack && rnd() < 0.45 + 0.45 * smart) return play(attack.id);
  const future = find('future');
  if (future && danger > 0.1 && rnd() < 0.3 + 0.45 * smart) return play(future.id);
  if (steal && rich && rnd() < 0.45) return play(steal.id, rich.id);
  const challenge = find('challenge');
  if (challenge && others.length && rnd() < 0.35) {
    const target = rich && rnd() < 0.6 ? rich : others[Math.floor(rnd() * others.length)];
    return play(challenge.id, target.id);
  }
  const dbl = find('double');
  if (dbl && rnd() < 0.3) return play(dbl.id);
  if (danger > 0.22) {
    const dodge = find('skip') ?? find('reverse') ?? (rnd() < 0.5 ? attack : undefined);
    if (dodge && rnd() < 0.25 + 0.35 * smart) return play(dodge.id);
    const shuffle = find('shuffle');
    if (shuffle && danger > 0.35 && rnd() < 0.15) return play(shuffle.id);
  }
  return draw;
}

export function planBot(
  state: GameState,
  botId: string,
  now: number,
  rnd: () => number = Math.random,
  levelOverride?: BotLevel,
): BotPlan | null {
  if (pendingActorId(state) !== botId) return null;
  const me = state.players.find((p) => p.id === botId);
  if (!me || !me.alive) return null;
  const level: BotLevel = levelOverride ?? me.botLevel ?? 'medium';
  const ph = state.phase;

  switch (ph.kind) {
    case 'math': {
      const m = ph.math;
      let acc = ACCURACY[level];
      if (m.question.difficulty === 'hard') acc -= 0.1;
      if (m.question.difficulty === 'easy') acc += 0.08;
      if (state.finalStage && m.purpose === 'explode') acc -= 0.05 * state.pressure;
      acc = Math.max(0.15, Math.min(0.97, acc));
      const correct = rnd() < acc;
      if (!correct && rnd() < 0.15) return { at: m.deadline + 50, action: null }; // ran out of time
      const [lo, hi] = THINK[level];
      const duration = m.deadline - m.startsAt;
      const at = Math.min(m.deadline - 300, m.startsAt + duration * between(rnd, lo, hi));
      let choice = m.question.answer;
      if (!correct) {
        const wrong = [0, 1, 2, 3].filter((i) => i !== m.question.answer);
        choice = wrong[Math.floor(rnd() * wrong.length)];
      }
      return { at: Math.max(now + 400, at), action: { type: 'answer', playerId: me.id, choice } };
    }
    case 'rescue':
      return { at: now + 2600, action: { type: 'useRescue', playerId: me.id } };
    case 'insert': {
      const n = state.deck.length;
      let pos: number;
      const r = rnd();
      if (level === 'hard') pos = r < 0.55 ? 0 : r < 0.8 ? 1 : Math.floor(rnd() * (n + 1));
      else if (level === 'medium') pos = r < 0.35 ? 0 : Math.floor(rnd() * (n + 1));
      else pos = Math.floor(rnd() * (n + 1));
      return { at: now + 3000, action: { type: 'insert', playerId: me.id, position: pos } };
    }
    case 'double': {
      const top = state.memory[me.id]?.top ?? [];
      const rich = richestOpponent(state, me);
      let action: GameAction;
      if (top[0] === 'explode') action = { type: 'doubleChoice', playerId: me.id, choice: 'skip' };
      else if (rich) action = { type: 'doubleChoice', playerId: me.id, choice: 'steal', targetId: rich.id };
      else action = { type: 'doubleChoice', playerId: me.id, choice: 'future' };
      return { at: now + 2800, action };
    }
    case 'turn': {
      const first = state.playsThisTurn === 0;
      const delay = between(rnd, 900, 1600) + (first ? 500 : 0);
      return { at: now + delay, action: decideTurn(state, me, level, rnd) };
    }
    default:
      return null;
  }
}
