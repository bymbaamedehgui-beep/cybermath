// Results of games played on this device, shown in the teacher dashboard.

import type { AnswerRecord, GameState } from '../../shared/game/types';
import { storageGet, storageSet } from '../store/prefs';

export interface HistoryPlayer {
  name: string;
  isBot: boolean;
  place: number;
  score: number;
  answered: number;
  correct: number;
  avgMs: number;
}

export interface HistoryEntry {
  id: string;
  at: number;
  mode: 'ai' | 'hotseat' | 'online';
  grade: number;
  topic: string;
  players: HistoryPlayer[];
  answers: AnswerRecord[];
}

const KEY = 'mk.history.v1';
const MAX = 60;

export function loadHistory(): HistoryEntry[] {
  return storageGet<HistoryEntry[]>(KEY) ?? [];
}

export function clearHistory() {
  storageSet(KEY, null);
}

export function recordGame(state: GameState, mode: HistoryEntry['mode']) {
  const list = loadHistory();
  if (list.some((e) => e.id === state.id)) return;
  const humanIds = new Set(state.players.filter((p) => !p.isBot).map((p) => p.id));
  list.unshift({
    id: state.id,
    at: state.finishedAt ?? Date.now(),
    mode,
    grade: state.settings.grade,
    topic: state.settings.topic,
    players: state.players.map((p) => ({
      name: p.name,
      isBot: p.isBot,
      place: p.place ?? 0,
      score: p.stats.score,
      answered: p.stats.answered,
      correct: p.stats.correct,
      avgMs: p.stats.answered ? Math.round(p.stats.totalMs / p.stats.answered) : 0,
    })),
    answers: state.answers.filter((a) => humanIds.has(a.playerId)),
  });
  storageSet(KEY, list.slice(0, MAX));
}
