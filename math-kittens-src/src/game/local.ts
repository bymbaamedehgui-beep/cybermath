// Runs a whole game in the browser: the human(s) on this device plus computer opponents.
// The game is saved after every move so a reload continues where it stopped.

import { planBot, type BotPlan } from '../../shared/game/bot';
import {
  applyAction,
  createGame,
  GameError,
  nextDeadline,
  pendingActorId,
  shiftTimers,
  tick,
} from '../../shared/game/engine';
import type { GameSettings, GameState, SeatInfo } from '../../shared/game/types';
import { makeView } from '../../shared/game/view';
import { storageGet, storageSet } from '../store/prefs';
import type { ActionInput, GameController } from './controller';
import { recordGame } from './history';

const SAVE_KEY = 'mk.offline.v1';

interface SaveData {
  kind: 'ai' | 'hotseat';
  state: GameState;
  seats: SeatInfo[];
  savedAt: number;
}

export class LocalGame implements GameController {
  readonly kind: 'ai' | 'hotseat';
  private state: GameState;
  private seats: SeatInfo[];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private pausedAt = 0;
  private plan: { version: number; plan: BotPlan | null } | null = null;
  private closed = false;

  private constructor(data: SaveData) {
    this.kind = data.kind;
    this.state = data.state;
    this.seats = data.seats;
  }

  static start(kind: 'ai' | 'hotseat', seats: SeatInfo[], settings: GameSettings): LocalGame {
    const g = new LocalGame({ kind, seats, state: createGame(seats, settings, Date.now()), savedAt: Date.now() });
    g.save();
    g.schedule();
    return g;
  }

  static hasSave(): boolean {
    const d = storageGet<SaveData>(SAVE_KEY);
    return !!d && d.state?.phase?.kind !== 'over';
  }

  static resume(): LocalGame | null {
    const d = storageGet<SaveData>(SAVE_KEY);
    if (!d || !d.state || d.state.phase.kind === 'over') return null;
    // Time stood still while the game was closed.
    shiftTimers(d.state, Date.now() - d.savedAt);
    const g = new LocalGame(d);
    g.save();
    g.schedule();
    return g;
  }

  static clearSave() {
    storageSet(SAVE_KEY, null);
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  view(viewerId?: string | null) {
    const viewer = viewerId === undefined ? (this.kind === 'ai' ? this.humans()[0] : null) : viewerId;
    return makeView(this.state, viewer, this.now());
  }

  now() {
    return this.paused ? this.pausedAt : Date.now();
  }

  humans() {
    return this.state.players.filter((p) => !p.isBot).map((p) => p.id);
  }

  isHost() {
    return true;
  }

  label() {
    return this.kind === 'ai' ? 'Компьютертэй' : 'Нэг төхөөрөмж';
  }

  isPaused() {
    return this.paused;
  }

  async send(action: ActionInput, asPlayer?: string): Promise<string | null> {
    if (this.paused) return 'Тоглоом түр зогссон байна.';
    const humans = this.humans();
    const pending = pendingActorId(this.state);
    const playerId = asPlayer ?? (this.kind === 'ai' ? humans[0] : (pending ?? humans[0]));
    if (!humans.includes(playerId)) return 'Энэ тоглогчийг та удирдахгүй.';
    try {
      applyAction(this.state, { ...action, playerId } as any, Date.now());
    } catch (e) {
      return e instanceof GameError ? e.message : 'Алдаа гарлаа.';
    }
    this.changed();
    return null;
  }

  setPaused(p: boolean) {
    if (p === this.paused || this.state.phase.kind === 'over') return;
    if (p) {
      this.paused = true;
      this.pausedAt = Date.now();
      this.clearTimer();
      this.notify();
    } else {
      const delta = Date.now() - this.pausedAt;
      shiftTimers(this.state, delta);
      if (this.plan?.plan) this.plan.plan.at += delta;
      this.paused = false;
      this.changed();
    }
  }

  rematch() {
    this.clearTimer();
    this.paused = false;
    this.plan = null;
    this.state = createGame(this.seats, this.state.settings, Date.now());
    this.changed();
  }

  leave() {
    this.closed = true;
    this.clearTimer();
    this.listeners.clear();
    if (this.state.phase.kind === 'over') LocalGame.clearSave();
    else this.save();
  }

  // ---- internals ----

  private save() {
    storageSet(SAVE_KEY, { kind: this.kind, state: this.state, seats: this.seats, savedAt: Date.now() } satisfies SaveData);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private changed() {
    if (this.state.phase.kind === 'over') {
      recordGame(this.state, this.kind);
    }
    this.save();
    this.notify();
    this.schedule();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private botPlan(): BotPlan | null {
    const actor = pendingActorId(this.state);
    if (!actor) return null;
    const p = this.state.players.find((x) => x.id === actor);
    if (!p?.isBot) return null;
    if (!this.plan || this.plan.version !== this.state.version) {
      this.plan = { version: this.state.version, plan: planBot(this.state, actor, Date.now()) };
    }
    return this.plan.plan;
  }

  private schedule() {
    this.clearTimer();
    if (this.closed || this.paused || this.state.phase.kind === 'over') return;
    const now = Date.now();
    let wake = nextDeadline(this.state) ?? Infinity;
    const plan = this.botPlan();
    if (plan?.action) wake = Math.min(wake, plan.at);
    if (!Number.isFinite(wake)) return;
    this.timer = setTimeout(() => this.wake(), Math.max(0, wake - now));
  }

  private wake() {
    this.timer = null;
    if (this.closed || this.paused) return;
    const now = Date.now();
    let changed = false;
    const plan = this.botPlan();
    if (plan?.action && now >= plan.at - 5) {
      try {
        applyAction(this.state, plan.action, now);
        changed = true;
      } catch {
        // State moved on; a fresh plan is made below.
      }
      this.plan = null;
    }
    if (!changed) changed = tick(this.state, now);
    if (changed) this.changed();
    else this.schedule();
  }
}
