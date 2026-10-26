// WebSocket connection to the game server, with automatic reconnect and session resume.

import { useSyncExternalStore } from 'react';
import type { GameView } from '../../shared/game/types';
import type { ClassView, ClientMessage, RoomView, ServerMessage } from '../../shared/net';
import { storageGet, storageSet } from '../store/prefs';
import { wsUrl } from './config';

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
type Outgoing = DistributiveOmit<ClientMessage, 'rid'>;

const SESSION_KEY = 'mk.session.v1';
const TEACHER_KEY = 'mk.teacher.v1';

export interface Session {
  code: string;
  token: string;
  playerId: string;
}

export interface NetState {
  status: 'idle' | 'connecting' | 'open' | 'reconnecting';
  session: Session | null;
  room: RoomView | null;
  view: GameView | null;
  teacher: { code: string; token: string } | null;
  classView: ClassView | null;
  /** Set when the server removed us from a room or class. */
  notice: string | null;
}

const LEFT_REASONS: Record<string, string> = {
  kicked: 'Таныг өрөөнөөс хаслаа.',
  classClosed: 'Багш хичээлийг дуусгалаа.',
  expired: 'Өмнөх тоглоом дууссан эсвэл олдсонгүй.',
  left: '',
};

class Net {
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private pending = new Map<number, { resolve: (v: { error?: string; data?: any }) => void; timer: ReturnType<typeof setTimeout> }>();
  private queue: string[] = [];
  private rid = 1;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private bestRtt = Infinity;
  private offset = 0;
  state: NetState = {
    status: 'idle',
    session: storageGet<Session>(SESSION_KEY),
    room: null,
    view: null,
    teacher: storageGet<{ code: string; token: string }>(TEACHER_KEY),
    classView: null,
    notice: null,
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = () => this.state;

  /** Server clock estimate. */
  now() {
    return Date.now() + this.offset;
  }

  private set(patch: Partial<NetState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  hasSession() {
    return !!this.state.session;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    this.set({ status: this.retry > 0 ? 'reconnecting' : 'connecting' });
    ws.onopen = () => {
      this.retry = 0;
      this.bestRtt = Infinity;
      ws.send(JSON.stringify({ t: 'hello', session: this.state.session, teacher: this.state.teacher }));
      for (const m of this.queue.splice(0)) ws.send(m);
      this.set({ status: 'open' });
      this.ping();
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.ping(), 10_000);
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      const wanted = !!this.state.session || !!this.state.teacher || this.pending.size > 0 || this.queue.length > 0;
      if (wanted) {
        this.retry += 1;
        const delay = Math.min(8000, 400 * 2 ** Math.min(this.retry, 5));
        this.set({ status: 'reconnecting' });
        this.retryTimer = setTimeout(() => this.connect(), delay);
      } else {
        this.set({ status: 'idle' });
      }
    };
  }

  private ping() {
    this.raw({ t: 'ping', c: Date.now() });
  }

  private raw(msg: ClientMessage) {
    const s = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else {
      if (msg.t !== 'ping') this.queue.push(s);
      this.connect();
    }
  }

  request(msg: Outgoing, timeoutMs = 10_000): Promise<{ error?: string; data?: any }> {
    const rid = this.rid++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        resolve({ error: 'Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгана уу.' });
      }, timeoutMs);
      this.pending.set(rid, { resolve, timer });
      this.raw({ ...msg, rid } as ClientMessage);
    });
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case 'hello':
        if (!Number.isFinite(this.bestRtt)) this.offset = msg.serverTime - Date.now();
        break;
      case 'pong': {
        const rtt = Date.now() - msg.c;
        if (rtt <= this.bestRtt * 1.5 || !Number.isFinite(this.bestRtt)) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = msg.s + rtt / 2 - Date.now();
        }
        break;
      }
      case 'ack': {
        const p = this.pending.get(msg.rid);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.rid);
          p.resolve({ error: msg.error, data: msg.data });
        }
        break;
      }
      case 'joined': {
        const session = { code: msg.code, token: msg.token, playerId: msg.playerId };
        storageSet(SESSION_KEY, session);
        const sameRoom = this.state.session?.code === msg.code;
        this.set({ session, notice: null, ...(sameRoom ? {} : { view: null, room: null }) });
        break;
      }
      case 'room':
        this.set({ room: msg.room, ...(msg.room.status === 'lobby' ? { view: null } : {}) });
        break;
      case 'state':
        this.set({ view: msg.view });
        break;
      case 'left':
        storageSet(SESSION_KEY, null);
        this.set({ session: null, room: null, view: null, notice: LEFT_REASONS[msg.reason] || null });
        break;
      case 'classJoined': {
        const teacher = { code: msg.code, token: msg.token };
        storageSet(TEACHER_KEY, teacher);
        this.set({ teacher });
        break;
      }
      case 'class':
        this.set({ classView: msg.data });
        break;
      case 'classEnded':
        storageSet(TEACHER_KEY, null);
        this.set({ teacher: null, classView: null });
        break;
      case 'error':
        console.warn('Сервер:', msg.message);
        break;
    }
  }

  async leaveRoom() {
    if (!this.state.session) return;
    await this.request({ t: 'leave' }, 4000);
    storageSet(SESSION_KEY, null);
    this.set({ session: null, room: null, view: null });
  }

  /** Teacher closes the dashboard: keep the class running, stop receiving updates. */
  detachTeacher() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.raw({ t: 'classLeave' });
  }

  forgetTeacher() {
    storageSet(TEACHER_KEY, null);
    this.set({ teacher: null, classView: null });
  }

  clearNotice() {
    this.set({ notice: null });
  }
}

export const net = new Net();

export function useNet(): NetState {
  return useSyncExternalStore(net.subscribe, net.getState);
}
