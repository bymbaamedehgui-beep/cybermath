import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS } from '../../shared/game/engine';
import type { BotLevel, GameSettings } from '../../shared/game/types';

export interface Prefs {
  name: string;
  avatar: number;
  muted: boolean;
  /** Players at the table for "Шинэ тоглоом" / computer games (including you). */
  players: number;
  botLevel: BotLevel;
  /** Settings used by every game started on this device (edited in Багшийн тохиргоо). */
  settings: GameSettings;
  /** Classroom options. */
  tableSize: number;
  fillBots: boolean;
}

const KEY = 'mk.prefs.v1';

const DEFAULTS: Prefs = {
  name: '',
  avatar: 0,
  muted: false,
  players: 4,
  botLevel: 'medium',
  settings: { ...DEFAULT_SETTINGS },
  tableSize: 4,
  fillBots: true,
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const p = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let prefs: Prefs = load();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}

export function setPrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  const delta = typeof patch === 'function' ? patch(prefs) : patch;
  prefs = { ...prefs, ...delta };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage may be unavailable (private mode) */
  }
  listeners.forEach((l) => l());
}

export function setGameSettings(patch: Partial<GameSettings>) {
  setPrefs((p) => ({ settings: { ...p.settings, ...patch } }));
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
  );
}

export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
