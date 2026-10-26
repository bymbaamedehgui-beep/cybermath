import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planBot } from '../shared/game/bot';
import { DEFAULT_SETTINGS, pendingActorId } from '../shared/game/engine';
import type { ServerMessage } from '../shared/net';
import { Hub, type Conn } from './hub';

interface TestConn extends Conn {
  msgs: ServerMessage[];
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined;
}

let nextId = 1;
function conn(): TestConn {
  const msgs: ServerMessage[] = [];
  return {
    id: nextId++,
    msgs,
    send(m) {
      msgs.push(JSON.parse(JSON.stringify(m)));
    },
    last(t) {
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].t === t) return msgs[i] as any;
      return undefined;
    },
  };
}

let rid = 1;
function req(hub: Hub, c: TestConn, msg: any) {
  const id = rid++;
  hub.handle(c, { ...msg, rid: id });
  const ack = c.msgs.find((m) => m.t === 'ack' && m.rid === id) as any;
  return ack as { error?: string; data?: any };
}

/** Let humans act like bots until every game in the hub finishes. */
function playOut(hub: Hub, players: Map<string, TestConn>, maxSteps = 6000) {
  for (let step = 0; step < maxSteps; step++) {
    const live = [...hub.rooms.values()].filter((r) => r.status === 'playing');
    if (!live.length) return;
    for (const room of live) {
      const g = room.game!;
      const actor = pendingActorId(g);
      const c = actor ? players.get(`${room.code}:${actor}`) : undefined;
      if (c && actor) {
        const plan = planBot(g, actor, Date.now());
        if (plan?.action) {
          if (plan.at > Date.now()) vi.advanceTimersByTime(Math.min(3000, plan.at - Date.now()));
          if (room.game === g && pendingActorId(g) === actor && plan.action) {
            const { playerId: _p, ...action } = plan.action as any;
            req(hub, c, { t: 'act', action });
          }
          continue;
        }
      }
    }
    vi.advanceTimersByTime(700);
  }
}

describe('hub', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a full online game with hidden information', () => {
    const hub = new Hub();
    const a = conn();
    const b = conn();
    hub.connect(a);
    hub.connect(b);
    const created = req(hub, a, { t: 'create', name: 'Анар', avatar: 1, maxPlayers: 4, settings: DEFAULT_SETTINGS });
    expect(created.error).toBeUndefined();
    const code = created.data.code as string;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(req(hub, b, { t: 'join', code: code.toLowerCase(), name: 'Болд', avatar: 2 }).error).toBeUndefined();
    expect(req(hub, b, { t: 'start' }).error).toBeTruthy(); // not host
    expect(req(hub, a, { t: 'addBot', level: 'hard' }).error).toBeUndefined();
    expect(req(hub, a, { t: 'start' }).error).toBeUndefined();

    const room = hub.rooms.get(code)!;
    expect(room.status).toBe('playing');
    expect(room.game!.settings.turnTimeLimit).toBe(60);
    const ja = a.last('joined')!;
    const jb = b.last('joined')!;
    const players = new Map([
      [`${code}:${ja.playerId}`, a],
      [`${code}:${jb.playerId}`, b],
    ]);

    // Acting out of turn is rejected by the server.
    const notTurn = pendingActorId(room.game!) === ja.playerId ? b : a;
    expect(req(hub, notTurn, { t: 'act', action: { type: 'draw' } }).error).toBeTruthy();

    playOut(hub, players);
    expect(room.status).toBe('over');
    expect(room.game!.winnerId).toBeTruthy();

    // Nobody ever saw another player's cards or a running problem's answer.
    for (const [c, me] of [
      [a, ja.playerId],
      [b, jb.playerId],
    ] as const) {
      for (const m of c.msgs) {
        if (m.t !== 'state') continue;
        expect(m.view.you).toBe(me);
        const s = JSON.stringify(m.view);
        expect(s).not.toContain('"token"');
        if (m.view.phase.kind === 'math') expect(JSON.stringify(m.view.phase)).not.toContain('"answer"');
        for (const e of m.view.events) {
          if (e.type === 'draw' && e.playerId !== me) expect(e.card).toBeNull();
          if (e.type === 'inserted' && e.playerId !== me) expect(e.position).toBe(-1);
        }
      }
    }

    // Rematch keeps the same table.
    expect(req(hub, a, { t: 'rematch' }).error).toBeUndefined();
    expect(room.status).toBe('playing');
    hub.stop();
  });

  it('resumes a session after reconnecting and plays for absent players', () => {
    const hub = new Hub();
    const a = conn();
    hub.connect(a);
    const code = req(hub, a, { t: 'create', name: 'Анар', avatar: 1, maxPlayers: 3, settings: DEFAULT_SETTINGS }).data.code;
    const b = conn();
    hub.connect(b);
    req(hub, b, { t: 'join', code, name: 'Болд', avatar: 2 });
    const tokB = b.last('joined')!.token;
    req(hub, a, { t: 'start' });
    hub.disconnect(b);
    const room = hub.rooms.get(code)!;
    expect(room.game!.players.find((p) => p.name === 'Болд')!.connected).toBe(false);
    const b2 = conn();
    hub.connect(b2);
    hub.handle(b2, { t: 'hello', session: { code, token: tokB } });
    expect(b2.last('joined')!.code).toBe(code);
    expect(b2.last('state')!.view.you).toBe(b.last('joined')!.playerId);
    // Both leave: the game still finishes on its own (absent players auto-play / time out).
    hub.disconnect(a);
    hub.disconnect(b2);
    for (let i = 0; i < 4000 && room.status === 'playing'; i++) vi.advanceTimersByTime(1000);
    expect(room.status).toBe('over');
    hub.stop();
  });

  it('classroom: students are seated at tables, teacher starts them and sees results', () => {
    const hub = new Hub();
    const teacher = conn();
    hub.connect(teacher);
    const cls = req(hub, teacher, {
      t: 'classCreate',
      name: '9А анги',
      settings: { ...DEFAULT_SETTINGS, customQuestions: [{ id: 'q1', text: '2 + 2 = ?', choices: ['4', '3', '5', '22'], answer: 0, difficulty: 'easy' }] },
      tableSize: 4,
      fillBots: true,
      botLevel: 'medium',
    });
    expect(cls.error).toBeUndefined();
    const code = cls.data.code;
    const players = new Map<string, TestConn>();
    for (let i = 0; i < 5; i++) {
      const s = conn();
      hub.connect(s);
      expect(req(hub, s, { t: 'join', code, name: `Сурагч ${i + 1}`, avatar: i }).error).toBeUndefined();
      const j = s.last('joined')!;
      players.set(`${j.code}:${j.playerId}`, s);
      // Students cannot start a classroom table themselves.
      expect(req(hub, s, { t: 'start' }).error).toBeTruthy();
    }
    vi.advanceTimersByTime(500);
    let view = teacher.last('class')!.data;
    expect(view.tables.length).toBe(2);
    expect(view.students.length).toBe(5);
    expect(req(hub, teacher, { t: 'classStart' }).data.started).toBe(2);
    const tables = [...hub.rooms.values()].filter((r) => r.classCode === code);
    expect(tables.every((t) => t.status === 'playing' && t.seats.length === 4)).toBe(true);
    playOut(hub, players);
    vi.advanceTimersByTime(500);
    view = teacher.last('class')!.data;
    expect(view.students.every((s) => s.games === 1)).toBe(true);
    expect(view.students.reduce((n, s) => n + s.answered, 0)).toBe(view.answers.length);
    expect(view.students.filter((s) => s.status === 'won').length).toBeLessThanOrEqual(2);
    // Teacher can restart everything, then close the class.
    expect(req(hub, teacher, { t: 'classStart' }).data.started).toBe(2);
    expect(req(hub, teacher, { t: 'classClose' }).error).toBeUndefined();
    expect([...hub.rooms.values()].filter((r) => r.classCode === code).length).toBe(0);
    hub.stop();
  });

  it('validates input', () => {
    const hub = new Hub();
    const a = conn();
    hub.connect(a);
    expect(req(hub, a, { t: 'join', code: 'ZZZZZZ', name: 'x', avatar: 0 }).error).toBeTruthy();
    expect(req(hub, a, { t: 'join', code: 'abc', name: 'x', avatar: 0 }).error).toBeTruthy();
    const code = req(hub, a, { t: 'create', name: '<b>Хакер</b>\u0000', avatar: 99, maxPlayers: 99, settings: { grade: 99, topic: 'evil', timeLimit: -5 } }).data.code;
    const room = hub.rooms.get(code)!;
    expect(room.maxPlayers).toBe(5);
    expect(room.seats[0].name).toBe('bХакер/b');
    expect(room.seats[0].avatar).toBe(7);
    expect(room.settings.grade).toBe(12);
    expect(room.settings.topic).toBe('systems');
    expect(room.settings.timeLimit).toBe(5);
    expect(req(hub, a, { t: 'act', action: { type: 'hack' } }).error).toBeTruthy();
    hub.stop();
  });
});
