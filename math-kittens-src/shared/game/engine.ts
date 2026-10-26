// Authoritative Math Kittens rules. Pure data in, pure data out (state is mutated in place),
// so the same code runs the offline game in the browser and every online room on the server.

import { ACTION_TYPES, CARD_INFO, type Card, type CardType } from '../cards';
import { generateQuestion, questionFromCustom } from '../math';
import type { Question } from '../math/types';
import type {
  ActiveMath,
  DoubleChoice,
  EventBody,
  GameAction,
  GameEvent,
  GameSettings,
  GameState,
  MathPurpose,
  PlayerState,
  SeatInfo,
} from './types';

export class GameError extends Error {}

let rng: () => number = Math.random;
/** Tests use a seeded generator. */
export function setEngineRng(r: () => number) {
  rng = r;
}

const MAX_EVENTS = 80;
/** Delay before a bomb problem's timer starts, so clients can play the explosion. */
export const EXPLODE_REVEAL_MS = 1800;
export const MATH_REVEAL_MS = 900;
/** Time clients spend showing an answer result before the next prompt. */
export const RESULT_MS = 2200;
const INSERT_MS = 20_000;
const RESCUE_MS = 10_000;
const DOUBLE_MS = 15_000;
export const MIN_FINAL_SECONDS = 8;

export const DEFAULT_SETTINGS: GameSettings = {
  grade: 9,
  topic: 'systems',
  difficulty: 'auto',
  timeLimit: 20,
  questionSource: 'generated',
  customQuestions: [],
  mathOnActions: false,
  turnTimeLimit: null,
  showExplanations: true,
};

const BASE_COUNTS: Partial<Record<CardType, number>> = {
  skip: 6,
  attack: 4,
  reverse: 4,
  future: 5,
  shuffle: 4,
  steal: 5,
  challenge: 5,
  double: 4,
};
const DECK_SCALE: Record<number, number> = { 2: 0.67, 3: 0.84, 4: 1, 5: 1.17 };
const EXTRA_RESCUES = 2;
const STARTING_ACTIONS = 4;

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function emit(state: GameState, body: EventBody, now: number) {
  state.seq += 1;
  state.events.push({ ...body, seq: state.seq, at: now } as GameEvent);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createGame(seats: SeatInfo[], settings: GameSettings, now: number): GameState {
  if (seats.length < 2 || seats.length > 5) throw new GameError('2–5 тоглогч шаардлагатай.');
  const state: GameState = {
    id: newId(),
    version: 0,
    createdAt: now,
    settings: structuredClone(settings),
    players: seats.map((s) => ({
      ...s,
      hand: [],
      alive: true,
      stats: { answered: 0, correct: 0, totalMs: 0, score: 0, survived: 0 },
      connected: true,
    })),
    current: 0,
    direction: 1,
    turnsRemaining: 1,
    turnNumber: 0,
    turnDeadline: null,
    playsThisTurn: 0,
    deck: [],
    discard: [],
    phase: { kind: 'turn' },
    events: [],
    seq: 0,
    recentKeys: [],
    finalStage: false,
    pressure: 0,
    nextCardId: 1,
    memory: {},
    answers: [],
    winnerId: null,
    finishedAt: null,
  };
  const mk = (type: CardType): Card => ({ id: `c${state.nextCardId++}`, type });

  const scale = DECK_SCALE[seats.length] ?? 1;
  const pile: Card[] = [];
  for (const t of ACTION_TYPES) {
    const n = Math.max(2, Math.round((BASE_COUNTS[t] ?? 0) * scale));
    for (let i = 0; i < n; i++) pile.push(mk(t));
  }
  shuffleInPlace(pile);
  for (const p of state.players) {
    p.hand = pile.splice(0, STARTING_ACTIONS);
    p.hand.push(mk('rescue'));
    state.memory[p.id] = { top: [] };
  }
  for (let i = 0; i < EXTRA_RESCUES; i++) pile.push(mk('rescue'));
  for (let i = 0; i < seats.length - 1; i++) pile.push(mk('explode'));
  shuffleInPlace(pile);
  state.deck = pile;

  emit(state, { type: 'start', firstId: state.players[0].id }, now);
  startTurn(state, 0, 1, now);
  return state;
}

// ---------- helpers ----------

export function playerIndex(state: GameState, id: string): number {
  const i = state.players.findIndex((p) => p.id === id);
  if (i < 0) throw new GameError('Тоглогч олдсонгүй.');
  return i;
}

function nextAlive(state: GameState, from: number): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const i = (((from + state.direction * step) % n) + n) % n;
    if (state.players[i].alive) return i;
  }
  return from;
}

export function explodesInDeck(state: GameState): number {
  return state.deck.filter((c) => c.type === 'explode').length;
}

/** The player whose input the game is waiting for. */
export function pendingActorId(state: GameState): string | null {
  const ph = state.phase;
  switch (ph.kind) {
    case 'turn':
      return state.players[state.current].id;
    case 'math':
      return ph.math.playerId;
    case 'rescue':
    case 'insert':
    case 'double':
      return ph.playerId;
    case 'over':
      return null;
  }
}

function startTurn(state: GameState, idx: number, turns: number, now: number) {
  state.current = idx;
  state.turnsRemaining = turns;
  state.turnNumber += 1;
  state.playsThisTurn = 0;
  state.phase = { kind: 'turn' };
  state.turnDeadline = state.settings.turnTimeLimit ? now + state.settings.turnTimeLimit * 1000 : null;
  emit(state, { type: 'turn', playerId: state.players[idx].id, turnsRemaining: turns }, now);
}

function endTurn(state: GameState, now: number) {
  if (state.phase.kind === 'over') return;
  state.turnsRemaining -= 1;
  if (state.turnsRemaining > 0 && state.players[state.current].alive) {
    startTurn(state, state.current, state.turnsRemaining, now);
  } else {
    startTurn(state, nextAlive(state, state.current), 1, now);
  }
}

function backToTurn(state: GameState, now: number, extraDelay = RESULT_MS) {
  state.phase = { kind: 'turn' };
  state.turnDeadline = state.settings.turnTimeLimit
    ? now + extraDelay + state.settings.turnTimeLimit * 1000
    : null;
}

function checkFinalStage(state: GameState, now: number) {
  if (!state.finalStage && state.deck.length > 0 && state.deck.every((c) => c.type === 'explode')) {
    state.finalStage = true;
    emit(state, { type: 'finalStage' }, now);
  }
}

function transferRandom(
  state: GameState,
  from: PlayerState,
  to: PlayerState,
  reason: 'steal' | 'challenge',
  now: number,
) {
  if (from.hand.length === 0) {
    emit(state, { type: 'nothingToSteal', fromId: from.id, toId: to.id }, now);
    return;
  }
  const i = Math.floor(rng() * from.hand.length);
  const [card] = from.hand.splice(i, 1);
  to.hand.push(card);
  emit(state, { type: 'steal', fromId: from.id, toId: to.id, card, reason }, now);
}

function pickQuestion(state: GameState): { q: Question; seconds: number | null } {
  const s = state.settings;
  const custom = s.customQuestions;
  const useCustom =
    custom.length > 0 && (s.questionSource === 'custom' || (s.questionSource === 'mixed' && rng() < 0.5));
  let q: Question;
  let seconds: number | null = null;
  if (useCustom) {
    const fresh = custom.filter((c) => !state.recentKeys.includes(`custom:${c.id}`));
    const pool = fresh.length ? fresh : custom;
    const c = pool[Math.floor(rng() * pool.length)];
    q = questionFromCustom(c, s.grade, rng);
    q.key = `custom:${c.id}`;
    if (c.time) seconds = c.time;
  } else {
    q = generateQuestion({
      grade: s.grade,
      topic: s.topic,
      difficulty: s.difficulty,
      rng,
      avoidKeys: state.recentKeys,
    });
  }
  state.recentKeys.push(q.key);
  if (state.recentKeys.length > 40) state.recentKeys.splice(0, state.recentKeys.length - 40);
  return { q, seconds };
}

function startMath(
  state: GameState,
  playerIdx: number,
  purpose: MathPurpose,
  opts: { card?: Card; targetId?: string },
  now: number,
  reveal: number,
) {
  const { q, seconds: customSeconds } = pickQuestion(state);
  const s = state.settings;
  let seconds = customSeconds ?? (s.timeLimit === 'auto' ? q.timeSuggested : s.timeLimit);
  if (purpose === 'explode' && state.finalStage) {
    seconds = Math.max(MIN_FINAL_SECONDS, seconds - 2 * state.pressure);
  }
  seconds = Math.max(5, Math.min(120, Math.round(seconds)));
  const startsAt = now + reveal;
  const math: ActiveMath = {
    question: q,
    playerId: state.players[playerIdx].id,
    purpose,
    sourceId: state.players[state.current].id,
    card: opts.card,
    targetId: opts.targetId,
    startsAt,
    deadline: startsAt + seconds * 1000,
    seconds,
  };
  state.phase = { kind: 'math', math };
  state.turnDeadline = null;
  emit(state, { type: 'mathStart', playerId: math.playerId, purpose, sourceId: math.sourceId }, now);
}

function resolveMath(state: GameState, chosen: number | null, now: number) {
  if (state.phase.kind !== 'math') return;
  const m = state.phase.math;
  const idx = playerIndex(state, m.playerId);
  const p = state.players[idx];
  const correct = chosen === m.question.answer;
  const total = m.seconds * 1000;
  const ms = Math.max(0, Math.min(total, now - m.startsAt));
  const points = correct ? 100 + Math.round(100 * (1 - ms / total)) : 0;
  p.stats.answered += 1;
  p.stats.totalMs += ms;
  if (correct) p.stats.correct += 1;
  p.stats.score += points;
  state.answers.push({
    playerId: p.id,
    name: p.name,
    topic: m.question.topic,
    difficulty: m.question.difficulty,
    purpose: m.purpose,
    correct,
    timedOut: chosen === null,
    ms,
    at: now,
    text: [m.question.text, ...(m.question.lines ?? [])].join(' '),
  });
  const { answer: _a, explanation, key: _k, ...pub } = m.question;
  emit(
    state,
    {
      type: 'answer',
      playerId: p.id,
      purpose: m.purpose,
      chosen,
      correct,
      answer: m.question.answer,
      explanation: state.settings.showExplanations ? explanation : '',
      ms,
      points,
      question: pub,
    },
    now,
  );

  switch (m.purpose) {
    case 'explode': {
      const card = m.card!;
      if (correct) {
        p.stats.survived += 1;
        if (state.finalStage) state.pressure += 1;
        state.phase = { kind: 'insert', playerId: p.id, card, deadline: now + RESULT_MS + INSERT_MS };
      } else if (p.hand.some((c) => c.type === 'rescue')) {
        state.phase = { kind: 'rescue', playerId: p.id, card, deadline: now + RESULT_MS + RESCUE_MS };
      } else {
        eliminate(state, idx, card, now);
      }
      break;
    }
    case 'challenge': {
      const source = state.players[playerIndex(state, m.sourceId)];
      if (correct) transferRandom(state, source, p, 'challenge', now);
      else transferRandom(state, p, source, 'challenge', now);
      backToTurn(state, now);
      break;
    }
    case 'double': {
      if (correct) state.phase = { kind: 'double', playerId: p.id, deadline: now + RESULT_MS + DOUBLE_MS };
      else backToTurn(state, now);
      break;
    }
    case 'action': {
      const type = m.card!.type;
      backToTurn(state, now);
      if (correct) applyEffect(state, type, m.targetId, now);
      else emit(state, { type: 'fizzle', playerId: p.id, cardType: type }, now);
      break;
    }
  }
}

function eliminate(state: GameState, idx: number, explodeCard: Card | undefined, now: number) {
  const p = state.players[idx];
  const aliveBefore = state.players.filter((x) => x.alive).length;
  p.alive = false;
  p.place = aliveBefore;
  state.discard.push(...p.hand);
  p.hand = [];
  if (explodeCard) state.discard.push(explodeCard);
  emit(state, { type: 'eliminated', playerId: p.id, place: aliveBefore }, now);
  const alive = state.players.filter((x) => x.alive);
  if (alive.length <= 1) {
    finish(state, alive[0]?.id ?? null, now);
  } else if (idx === state.current) {
    startTurn(state, nextAlive(state, idx), 1, now);
  }
}

function finish(state: GameState, winnerId: string | null, now: number) {
  state.winnerId = winnerId;
  state.finishedAt = now;
  state.turnDeadline = null;
  state.phase = { kind: 'over', winnerId };
  if (winnerId) {
    const w = state.players[playerIndex(state, winnerId)];
    w.place = 1;
    w.stats.score += 200;
    emit(state, { type: 'win', playerId: winnerId }, now);
  }
}

function applyEffect(state: GameState, type: CardType, targetId: string | undefined, now: number) {
  const p = state.players[state.current];
  switch (type) {
    case 'skip':
      emit(state, { type: 'skip', playerId: p.id }, now);
      endTurn(state, now);
      return;
    case 'attack': {
      const next = nextAlive(state, state.current);
      emit(state, { type: 'attack', playerId: p.id, targetId: state.players[next].id, turns: 2 }, now);
      startTurn(state, next, 2, now);
      return;
    }
    case 'reverse':
      state.direction = state.direction === 1 ? -1 : 1;
      emit(state, { type: 'reverse', playerId: p.id, direction: state.direction }, now);
      endTurn(state, now);
      return;
    case 'future': {
      const cards = state.deck.slice(0, 3);
      state.memory[p.id] = { top: cards.map((c) => c.type) };
      emit(state, { type: 'future', playerId: p.id, cards }, now);
      return;
    }
    case 'shuffle':
      shuffleInPlace(state.deck);
      for (const id of Object.keys(state.memory)) state.memory[id] = { top: [] };
      emit(state, { type: 'shuffle', playerId: p.id }, now);
      return;
    case 'steal': {
      const target = state.players[playerIndex(state, targetId!)];
      transferRandom(state, target, p, 'steal', now);
      return;
    }
    case 'challenge': {
      startMath(state, playerIndex(state, targetId!), 'challenge', { targetId }, now, MATH_REVEAL_MS);
      return;
    }
    case 'double':
      startMath(state, state.current, 'double', {}, now, MATH_REVEAL_MS);
      return;
    default:
      throw new GameError('Энэ картыг тоглох боломжгүй.');
  }
}

function validTarget(state: GameState, selfId: string, targetId: string | undefined, needCards: boolean) {
  if (!targetId) throw new GameError('Тоглогч сонгоно уу.');
  const t = state.players[playerIndex(state, targetId)];
  if (t.id === selfId) throw new GameError('Өөрийгөө сонгох боломжгүй.');
  if (!t.alive) throw new GameError('Энэ тоглогч хасагдсан.');
  if (needCards && t.hand.length === 0) throw new GameError('Энэ тоглогчид карт алга.');
}

// ---------- actions ----------

function requireTurn(state: GameState, playerId: string) {
  if (state.phase.kind !== 'turn') throw new GameError('Одоо карт тоглох боломжгүй.');
  if (state.players[state.current].id !== playerId) throw new GameError('Таны ээлж биш байна.');
}

function doDraw(state: GameState, now: number) {
  const p = state.players[state.current];
  const card = state.deck.shift();
  if (!card) {
    endTurn(state, now);
    return;
  }
  for (const mem of Object.values(state.memory)) mem.top.shift();
  if (card.type === 'explode') {
    emit(state, { type: 'explodeDrawn', playerId: p.id }, now);
    startMath(state, state.current, 'explode', { card }, now, EXPLODE_REVEAL_MS);
    return;
  }
  p.hand.push(card);
  emit(state, { type: 'draw', playerId: p.id, card }, now);
  checkFinalStage(state, now);
  endTurn(state, now);
}

function doUseRescue(state: GameState, now: number) {
  if (state.phase.kind !== 'rescue') return;
  const p = state.players[playerIndex(state, state.phase.playerId)];
  const i = p.hand.findIndex((c) => c.type === 'rescue');
  if (i < 0) throw new GameError('Аврагч Муур алга.');
  const [rescue] = p.hand.splice(i, 1);
  state.discard.push(rescue);
  emit(state, { type: 'rescueUsed', playerId: p.id }, now);
  state.phase = { kind: 'insert', playerId: p.id, card: state.phase.card, deadline: now + RESULT_MS + INSERT_MS };
}

function doInsert(state: GameState, position: number, now: number) {
  if (state.phase.kind !== 'insert') return;
  const { playerId, card } = state.phase;
  const pos = Math.max(0, Math.min(state.deck.length, Math.round(Number.isFinite(position) ? position : 0)));
  state.deck.splice(pos, 0, card);
  for (const [id, mem] of Object.entries(state.memory)) {
    if (id === playerId) {
      if (pos <= mem.top.length) mem.top.splice(pos, 0, 'explode');
    } else {
      mem.top = [];
    }
  }
  emit(state, { type: 'inserted', playerId, position: pos }, now);
  endTurn(state, now);
}

function doDoubleChoice(state: GameState, choice: DoubleChoice, targetId: string | undefined, now: number) {
  if (state.phase.kind !== 'double') return;
  const playerId = state.phase.playerId;
  if (choice === 'steal') validTarget(state, playerId, targetId, true);
  emit(state, { type: 'doubleChoice', playerId, choice }, now);
  backToTurn(state, now, 0);
  applyEffect(state, choice === 'steal' ? 'steal' : choice === 'skip' ? 'skip' : 'future', targetId, now);
}

export function applyAction(state: GameState, action: GameAction, now: number): GameState {
  if (state.phase.kind === 'over') throw new GameError('Тоглоом дууссан.');
  switch (action.type) {
    case 'draw':
      requireTurn(state, action.playerId);
      doDraw(state, now);
      break;
    case 'play': {
      requireTurn(state, action.playerId);
      const p = state.players[state.current];
      const ci = p.hand.findIndex((c) => c.id === action.cardId);
      if (ci < 0) throw new GameError('Карт олдсонгүй.');
      const card = p.hand[ci];
      const info = CARD_INFO[card.type];
      if (!info.playable) throw new GameError('Энэ картыг гараас тоглох боломжгүй.');
      if (info.needsTarget) validTarget(state, p.id, action.targetId, card.type === 'steal');
      p.hand.splice(ci, 1);
      state.discard.push(card);
      state.playsThisTurn += 1;
      emit(state, { type: 'play', playerId: p.id, card, targetId: info.needsTarget ? action.targetId : undefined }, now);
      if (state.settings.mathOnActions && card.type !== 'challenge' && card.type !== 'double') {
        startMath(state, state.current, 'action', { card, targetId: action.targetId }, now, MATH_REVEAL_MS);
      } else {
        applyEffect(state, card.type, action.targetId, now);
      }
      break;
    }
    case 'answer': {
      if (state.phase.kind !== 'math') throw new GameError('Бодлого алга.');
      if (state.phase.math.playerId !== action.playerId) throw new GameError('Энэ бодлого танд биш.');
      if (now < state.phase.math.startsAt - 250) throw new GameError('Түр хүлээнэ үү.');
      const choice = Math.floor(action.choice);
      if (!(choice >= 0 && choice <= 3)) throw new GameError('Хариулт буруу байна.');
      resolveMath(state, choice, now);
      break;
    }
    case 'useRescue':
      if (state.phase.kind !== 'rescue' || state.phase.playerId !== action.playerId)
        throw new GameError('Одоо Аврагч Муур ашиглах боломжгүй.');
      doUseRescue(state, now);
      break;
    case 'insert':
      if (state.phase.kind !== 'insert' || state.phase.playerId !== action.playerId)
        throw new GameError('Одоо карт буцаах боломжгүй.');
      doInsert(state, action.position, now);
      break;
    case 'doubleChoice':
      if (state.phase.kind !== 'double' || state.phase.playerId !== action.playerId)
        throw new GameError('Одоо нэмэлт үйлдэл хийх боломжгүй.');
      doDoubleChoice(state, action.choice, action.targetId, now);
      break;
    default:
      throw new GameError('Үл мэдэгдэх үйлдэл.');
  }
  state.version += 1;
  return state;
}

/** Resolve any expired timer. Returns true if the state changed. */
export function tick(state: GameState, now: number): boolean {
  const ph = state.phase;
  let changed = false;
  switch (ph.kind) {
    case 'math':
      if (now >= ph.math.deadline) {
        resolveMath(state, null, now);
        changed = true;
      }
      break;
    case 'rescue':
      if (now >= ph.deadline) {
        emit(state, { type: 'timeout', playerId: ph.playerId, what: 'rescue' }, now);
        doUseRescue(state, now);
        changed = true;
      }
      break;
    case 'insert':
      if (now >= ph.deadline) {
        emit(state, { type: 'timeout', playerId: ph.playerId, what: 'insert' }, now);
        doInsert(state, Math.floor(rng() * (state.deck.length + 1)), now);
        changed = true;
      }
      break;
    case 'double':
      if (now >= ph.deadline) {
        emit(state, { type: 'timeout', playerId: ph.playerId, what: 'double' }, now);
        doDoubleChoice(state, 'future', undefined, now);
        changed = true;
      }
      break;
    case 'turn':
      if (state.turnDeadline !== null && now >= state.turnDeadline) {
        emit(state, { type: 'timeout', playerId: state.players[state.current].id, what: 'turn' }, now);
        doDraw(state, now);
        changed = true;
      }
      break;
  }
  if (changed) state.version += 1;
  return changed;
}

export function nextDeadline(state: GameState): number | null {
  const ph = state.phase;
  switch (ph.kind) {
    case 'math':
      return ph.math.deadline;
    case 'rescue':
    case 'insert':
    case 'double':
      return ph.deadline;
    case 'turn':
      return state.turnDeadline;
    case 'over':
      return null;
  }
}

/** Move every running timer forward (used when an offline game is paused or resumed later). */
export function shiftTimers(state: GameState, delta: number) {
  if (delta <= 0) return;
  const ph = state.phase;
  if (ph.kind === 'math') {
    ph.math.startsAt += delta;
    ph.math.deadline += delta;
  } else if (ph.kind === 'rescue' || ph.kind === 'insert' || ph.kind === 'double') {
    ph.deadline += delta;
  }
  if (state.turnDeadline !== null) state.turnDeadline += delta;
}

/** Remove a player who left an online game (counts as eliminated). */
export function forfeit(state: GameState, playerId: string, now: number) {
  if (state.phase.kind === 'over') return;
  const idx = playerIndex(state, playerId);
  const p = state.players[idx];
  if (!p.alive) return;
  const wasPending = pendingActorId(state) === playerId;
  const ph = state.phase;
  // A held bomb goes back into the deck so the bomb count stays right.
  if ((ph.kind === 'rescue' || ph.kind === 'insert') && ph.playerId === playerId) {
    state.deck.splice(Math.floor(rng() * (state.deck.length + 1)), 0, ph.card);
  } else if (ph.kind === 'math' && ph.math.playerId === playerId && ph.math.purpose === 'explode' && ph.math.card) {
    state.deck.splice(Math.floor(rng() * (state.deck.length + 1)), 0, ph.math.card);
  }
  // Remove one bomb so that bombs = alive players − 1 still holds.
  const bomb = state.deck.findIndex((c) => c.type === 'explode');
  const removed = bomb >= 0 ? state.deck.splice(bomb, 1)[0] : undefined;
  if (wasPending && idx !== state.current) {
    // They were answering someone else's challenge.
    backToTurn(state, now, 0);
  }
  eliminate(state, idx, removed, now);
  state.version += 1;
}
