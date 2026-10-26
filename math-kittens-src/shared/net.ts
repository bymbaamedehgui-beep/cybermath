// Messages between browsers and the game server (JSON over WebSocket).

import type { BotLevel, GameAction, GameSettings, GameView, PublicSettings } from './game/types';
import type { Difficulty, TopicId } from './math/types';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type ClientMessage = { rid?: number } & (
  | { t: 'hello'; session?: { code: string; token: string } | null; teacher?: { code: string; token: string } | null }
  | { t: 'ping'; c: number }
  | { t: 'create'; name: string; avatar: number; maxPlayers: number; settings: GameSettings }
  | { t: 'join'; code: string; name: string; avatar: number }
  | { t: 'leave' }
  | { t: 'addBot'; level: BotLevel }
  | { t: 'kick'; playerId: string }
  | { t: 'roomSettings'; settings: GameSettings; maxPlayers: number }
  | { t: 'start' }
  | { t: 'rematch' }
  | { t: 'act'; action: DistributiveOmit<GameAction, 'playerId'> }
  | { t: 'classCreate'; name: string; settings: GameSettings; tableSize: number; fillBots: boolean; botLevel: BotLevel }
  | { t: 'classResume'; code: string; token: string }
  | { t: 'classSettings'; settings: GameSettings; tableSize: number; fillBots: boolean; botLevel: BotLevel }
  | { t: 'classStart'; table?: string }
  | { t: 'classKick'; sid: string }
  | { t: 'classClose' }
  | { t: 'classLeave' }
);

export interface SeatView {
  id: string;
  name: string;
  avatar: number;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
}

export interface RoomView {
  code: string;
  hostId: string | null;
  seats: SeatView[];
  maxPlayers: number;
  settings: PublicSettings;
  status: 'lobby' | 'playing' | 'over';
  classCode?: string;
  className?: string;
  tableNo?: number;
}

export interface ClassStudentView {
  sid: string;
  name: string;
  avatar: number;
  table: number;
  connected: boolean;
  status: 'lobby' | 'playing' | 'out' | 'won' | 'done' | 'left';
  games: number;
  wins: number;
  score: number;
  answered: number;
  correct: number;
  avgMs: number;
}

export interface ClassTableView {
  no: number;
  code: string;
  status: 'lobby' | 'playing' | 'over';
  turn: number;
  players: { name: string; avatar: number; isBot: boolean; connected: boolean; alive: boolean; handCount: number; score: number; place?: number }[];
}

export interface ClassAnswerView {
  name: string;
  table: number;
  topic: string;
  difficulty: Difficulty;
  purpose: string;
  correct: boolean;
  timedOut: boolean;
  ms: number;
  at: number;
  text: string;
}

export interface ClassView {
  code: string;
  name: string;
  active: boolean;
  createdAt: number;
  settings: PublicSettings;
  tableSize: number;
  fillBots: boolean;
  botLevel: BotLevel;
  tables: ClassTableView[];
  students: ClassStudentView[];
  answers: ClassAnswerView[];
}

export type ServerMessage =
  | { t: 'hello'; serverTime: number }
  | { t: 'pong'; c: number; s: number }
  | { t: 'ack'; rid: number; error?: string; data?: any }
  | { t: 'joined'; code: string; playerId: string; token: string }
  | { t: 'room'; room: RoomView }
  | { t: 'state'; view: GameView }
  | { t: 'left'; reason: string }
  | { t: 'class'; data: ClassView }
  | { t: 'classJoined'; code: string; token: string }
  | { t: 'classEnded'; reason: string }
  | { t: 'error'; message: string };

export function isTopic(x: unknown): x is TopicId | 'mixed' {
  return (
    typeof x === 'string' &&
    ['mixed', 'arithmetic', 'fractions', 'percent', 'linear', 'systems', 'inequalities', 'quadratic', 'functions', 'geometry', 'trig', 'probability'].includes(x)
  );
}
