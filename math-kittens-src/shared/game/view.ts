// Builds the per-player view of a game: hides other hands, the deck order,
// where a bomb was hidden, and the correct answer of a running problem.

import { toPublicQuestion } from '../math/types';
import { explodesInDeck } from './engine';
import type { GameEvent, GameSettings, GameState, GameView, PhaseView, PublicSettings } from './types';

export function publicSettings(s: GameSettings): PublicSettings {
  const { customQuestions, ...rest } = s;
  return { ...rest, customCount: customQuestions.length };
}

function filterEvent(ev: GameEvent, viewer: string | null): GameEvent {
  switch (ev.type) {
    case 'draw':
      return ev.playerId === viewer ? ev : { ...ev, card: null };
    case 'future':
      return ev.playerId === viewer ? ev : { ...ev, cards: [] };
    case 'steal':
      return ev.fromId === viewer || ev.toId === viewer ? ev : { ...ev, card: null };
    case 'inserted':
      return ev.playerId === viewer ? ev : { ...ev, position: -1 };
    default:
      return ev;
  }
}

function phaseView(state: GameState): PhaseView {
  const ph = state.phase;
  switch (ph.kind) {
    case 'turn':
      return { kind: 'turn' };
    case 'math': {
      const m = ph.math;
      return {
        kind: 'math',
        playerId: m.playerId,
        purpose: m.purpose,
        sourceId: m.sourceId,
        targetId: m.targetId,
        cardType: m.purpose === 'action' ? m.card?.type : undefined,
        question: toPublicQuestion(m.question),
        startsAt: m.startsAt,
        deadline: m.deadline,
        seconds: m.seconds,
      };
    }
    case 'rescue':
      return { kind: 'rescue', playerId: ph.playerId, deadline: ph.deadline };
    case 'insert':
      return { kind: 'insert', playerId: ph.playerId, deadline: ph.deadline };
    case 'double':
      return { kind: 'double', playerId: ph.playerId, deadline: ph.deadline };
    case 'over':
      return { kind: 'over', winnerId: ph.winnerId };
  }
}

export function makeView(state: GameState, viewer: string | null, now: number, eventLimit = 40): GameView {
  const me = viewer ? state.players.find((p) => p.id === viewer) : undefined;
  return {
    gameId: state.id,
    version: state.version,
    you: me ? me.id : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      alive: p.alive,
      place: p.place,
      handCount: p.hand.length,
      connected: p.connected,
      stats: { ...p.stats },
    })),
    hand: me ? me.hand.map((c) => ({ ...c })) : [],
    currentId: state.players[state.current].id,
    direction: state.direction,
    turnsRemaining: state.turnsRemaining,
    turnNumber: state.turnNumber,
    turnDeadline: state.turnDeadline,
    deckCount: state.deck.length,
    explodesInDeck: explodesInDeck(state),
    discardTop: state.discard.slice(-4).map((c) => ({ ...c })),
    discardCount: state.discard.length,
    phase: phaseView(state),
    settings: publicSettings(state.settings),
    events: state.events.slice(-eventLimit).map((e) => filterEvent(e, me ? me.id : null)),
    finalStage: state.finalStage,
    pressure: state.pressure,
    winnerId: state.winnerId,
    now,
  };
}
