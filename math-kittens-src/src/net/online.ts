import type { ActionInput, GameController } from '../game/controller';
import { recordGame } from '../game/history';
import { net } from './net';

/** Game screen adapter for a room that runs on the server. */
export class OnlineGame implements GameController {
  readonly kind = 'online' as const;
  private recorded = new Set<string>();

  subscribe(fn: () => void) {
    return net.subscribe(fn);
  }

  view() {
    return net.state.view;
  }

  now() {
    return net.now();
  }

  async send(action: ActionInput): Promise<string | null> {
    const r = await net.request({ t: 'act', action });
    return r.error ?? null;
  }

  humans() {
    return net.state.session ? [net.state.session.playerId] : [];
  }

  isHost() {
    const s = net.state;
    return !!s.session && s.room?.hostId === s.session.playerId;
  }

  rematch() {
    void net.request({ t: 'rematch' });
  }

  leave() {
    const v = net.state.view;
    if (v && v.phase.kind === 'over' && !this.recorded.has(v.gameId)) {
      this.recorded.add(v.gameId);
      // Only stats visible to this player are stored locally.
      recordGame(
        {
          id: v.gameId,
          finishedAt: Date.now(),
          settings: { ...v.settings, customQuestions: [] },
          players: v.players.map((p) => ({ ...p, hand: [], stats: p.stats })),
          answers: [],
        } as any,
        'online',
      );
    }
    void net.leaveRoom();
  }

  label() {
    const r = net.state.room;
    if (!r) return 'Онлайн';
    return r.classCode ? `${r.className ?? 'Анги'} · Ширээ ${r.tableNo}` : `Өрөө ${r.code}`;
  }
}
