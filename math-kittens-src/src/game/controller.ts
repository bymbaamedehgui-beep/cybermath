import type { GameAction, GameView } from '../../shared/game/types';

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type ActionInput = DistributiveOmit<GameAction, 'playerId'>;

/** What the game screen needs, whether the game runs in this browser or on the server. */
export interface GameController {
  readonly kind: 'ai' | 'hotseat' | 'online';
  subscribe(fn: () => void): () => void;
  /** View for a local player (hot-seat passes who holds the device). */
  view(viewerId?: string | null): GameView | null;
  /** Current time on the clock the view's deadlines use. */
  now(): number;
  /** Returns an error message, or null when accepted. */
  send(action: ActionInput, asPlayer?: string): Promise<string | null>;
  /** Players controlled on this device. */
  humans(): string[];
  isHost(): boolean;
  /** Start a new game with the same players. */
  rematch(): void;
  leave(): void;
  setPaused?(paused: boolean): void;
  isPaused?(): boolean;
  /** Short label for the top bar (room code, mode). */
  label(): string;
}
