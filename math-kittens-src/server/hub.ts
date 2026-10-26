// Server-authoritative rooms and classrooms. Clients only send intentions;
// every card, turn and answer is decided here with the shared engine.

import { randomBytes, randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BOT_NAMES, planBot, type BotPlan } from '../shared/game/bot';
import {
  applyAction,
  createGame,
  DEFAULT_SETTINGS,
  forfeit,
  GameError,
  nextDeadline,
  pendingActorId,
  shiftTimers,
  tick,
} from '../shared/game/engine';
import type { BotLevel, GameAction, GameSettings, GameState } from '../shared/game/types';
import { makeView, publicSettings } from '../shared/game/view';
import type { CustomQuestion, Difficulty } from '../shared/math/types';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  isTopic,
  type ClassAnswerView,
  type ClassStudentView,
  type ClassView,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
} from '../shared/net';

export interface Conn {
  id: number;
  send(msg: ServerMessage): void;
  room?: string;
  seat?: string;
  classCode?: string;
}

interface Seat {
  id: string;
  token: string;
  name: string;
  avatar: number;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
  left?: boolean;
  disconnectedAt?: number;
}

interface Room {
  code: string;
  hostId: string | null;
  seats: Seat[];
  maxPlayers: number;
  settings: GameSettings;
  status: 'lobby' | 'playing' | 'over';
  game: GameState | null;
  createdAt: number;
  lastActive: number;
  classCode?: string;
  tableNo?: number;
  answersSynced: number;
  recordedGameId?: string;
  nextSeat: number;
}

interface Student {
  sid: string;
  token: string;
  seatId: string;
  name: string;
  avatar: number;
  table: number;
  roomCode: string;
  games: number;
  wins: number;
  score: number;
  answered: number;
  correct: number;
  totalMs: number;
}

interface Classroom {
  code: string;
  token: string;
  name: string;
  settings: GameSettings;
  tableSize: number;
  fillBots: boolean;
  botLevel: BotLevel;
  tables: string[];
  students: Record<string, Student>;
  answers: ClassAnswerView[];
  createdAt: number;
  lastActive: number;
  active: boolean;
}

interface SaveFile {
  savedAt: number;
  rooms: Room[];
  classes: Classroom[];
}

const MAX_ROOMS = 3000;
const ONLINE_TURN_SECONDS = 60;
const DISCONNECT_GRACE_MS = 4000;

const err = (m: string) => new GameError(m);

function token(n = 18) {
  return randomBytes(n).toString('base64url');
}

export function sanitizeName(raw: unknown, fallback = 'Тоглогч'): string {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return s || fallback;
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

function cleanCustom(list: unknown): CustomQuestion[] {
  if (!Array.isArray(list)) return [];
  const out: CustomQuestion[] = [];
  for (const q of list.slice(0, 300)) {
    if (!q || typeof q !== 'object') continue;
    const text = String((q as any).text ?? '').slice(0, 400).trim();
    const choices = Array.isArray((q as any).choices) ? (q as any).choices.slice(0, 4).map((c: unknown) => String(c ?? '').slice(0, 120).trim()) : [];
    const answer = clampInt((q as any).answer, 0, 3, 0);
    if (!text || choices.length !== 4 || choices.some((c: string) => !c) || new Set(choices).size !== 4) continue;
    out.push({
      id: String((q as any).id ?? token(6)).slice(0, 40),
      text,
      choices: choices as [string, string, string, string],
      answer,
      difficulty: DIFFS.includes((q as any).difficulty) ? (q as any).difficulty : 'medium',
      explanation: (q as any).explanation ? String((q as any).explanation).slice(0, 300) : undefined,
      time: (q as any).time ? clampInt((q as any).time, 5, 60, 20) : undefined,
    });
  }
  return out;
}

export function sanitizeSettings(raw: any, online: boolean): GameSettings {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    grade: clampInt(s.grade, 6, 12, DEFAULT_SETTINGS.grade) as GameSettings['grade'],
    topic: isTopic(s.topic) ? s.topic : DEFAULT_SETTINGS.topic,
    difficulty: s.difficulty === 'auto' || DIFFS.includes(s.difficulty) ? s.difficulty : 'auto',
    timeLimit: s.timeLimit === 'auto' ? 'auto' : clampInt(s.timeLimit, 5, 60, 20),
    questionSource: ['generated', 'mixed', 'custom'].includes(s.questionSource) ? s.questionSource : 'generated',
    customQuestions: cleanCustom(s.customQuestions),
    mathOnActions: !!s.mathOnActions,
    turnTimeLimit: online ? clampInt(s.turnTimeLimit ?? ONLINE_TURN_SECONDS, 15, 300, ONLINE_TURN_SECONDS) : null,
    showExplanations: s.showExplanations !== false,
  };
}

function cleanAction(a: any): Omit<GameAction, 'playerId'> | null {
  if (!a || typeof a !== 'object') return null;
  switch (a.type) {
    case 'draw':
      return { type: 'draw' };
    case 'useRescue':
      return { type: 'useRescue' };
    case 'play':
      return { type: 'play', cardId: String(a.cardId ?? ''), targetId: a.targetId ? String(a.targetId) : undefined } as any;
    case 'answer':
      return { type: 'answer', choice: Number(a.choice) } as any;
    case 'insert':
      return { type: 'insert', position: Number(a.position) } as any;
    case 'doubleChoice':
      if (!['future', 'steal', 'skip'].includes(a.choice)) return null;
      return { type: 'doubleChoice', choice: a.choice, targetId: a.targetId ? String(a.targetId) : undefined } as any;
    default:
      return null;
  }
}

export class Hub {
  rooms = new Map<string, Room>();
  classes = new Map<string, Classroom>();
  private conns = new Set<Conn>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private plans = new Map<string, { version: number; plan: BotPlan | null; forSeat: string }>();
  private classNotify = new Map<string, ReturnType<typeof setTimeout>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private janitor: ReturnType<typeof setInterval> | null = null;

  constructor(private opts: { dataFile?: string; now?: () => number } = {}) {
    this.load();
    this.janitor = setInterval(() => this.cleanup(), 60_000);
    this.janitor.unref?.();
  }

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  stop() {
    if (this.janitor) clearInterval(this.janitor);
    for (const t of this.timers.values()) clearTimeout(t);
    for (const t of this.classNotify.values()) clearTimeout(t);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveNow();
    }
  }

  // ---------- connections ----------

  connect(conn: Conn) {
    this.conns.add(conn);
  }

  disconnect(conn: Conn) {
    this.conns.delete(conn);
    const room = conn.room ? this.rooms.get(conn.room) : undefined;
    if (room && conn.seat) {
      const seat = room.seats.find((s) => s.id === conn.seat);
      if (seat && !this.seatConns(room, seat.id).length) {
        seat.connected = false;
        seat.disconnectedAt = this.now();
        this.syncConnected(room);
        this.broadcastRoom(room);
        if (room.game && room.status === 'playing') {
          this.broadcastState(room);
          this.schedule(room);
        }
        if (room.classCode) this.notifyClass(room.classCode);
      }
    }
  }

  handle(conn: Conn, msg: ClientMessage) {
    const rid = typeof msg.rid === 'number' ? msg.rid : undefined;
    const reply = (error?: string, data?: any) => {
      if (rid !== undefined) conn.send({ t: 'ack', rid, error, data });
      else if (error) conn.send({ t: 'error', message: error });
    };
    try {
      const data = this.dispatch(conn, msg);
      reply(undefined, data);
    } catch (e) {
      reply(e instanceof GameError ? e.message : 'Серверийн алдаа гарлаа.');
      if (!(e instanceof GameError)) console.error(e);
    }
  }

  private dispatch(conn: Conn, msg: ClientMessage): any {
    switch (msg.t) {
      case 'hello':
        conn.send({ t: 'hello', serverTime: this.now() });
        if (msg.session) this.resume(conn, String(msg.session.code ?? ''), String(msg.session.token ?? ''));
        if (msg.teacher) this.classResume(conn, String(msg.teacher.code ?? ''), String(msg.teacher.token ?? ''), true);
        return;
      case 'ping':
        conn.send({ t: 'pong', c: Number(msg.c) || 0, s: this.now() });
        return;
      case 'create':
        return this.createRoom(conn, msg);
      case 'join':
        return this.join(conn, String(msg.code ?? ''), msg.name, msg.avatar);
      case 'leave':
        return this.leave(conn);
      case 'addBot':
        return this.addBot(conn, msg.level);
      case 'kick':
        return this.kick(conn, String(msg.playerId ?? ''));
      case 'roomSettings':
        return this.roomSettings(conn, msg.settings, msg.maxPlayers);
      case 'start':
        return this.start(conn);
      case 'rematch':
        return this.rematch(conn);
      case 'act':
        return this.act(conn, msg.action);
      case 'classCreate':
        return this.classCreate(conn, msg);
      case 'classResume':
        return this.classResume(conn, String(msg.code ?? ''), String(msg.token ?? ''), false);
      case 'classSettings':
        return this.classSettings(conn, msg);
      case 'classStart':
        return this.classStart(conn, msg.table ? String(msg.table) : undefined);
      case 'classKick':
        return this.classKick(conn, String(msg.sid ?? ''));
      case 'classClose':
        return this.classClose(conn);
      case 'classLeave':
        conn.classCode = undefined;
        return;
      default:
        throw err('Үл мэдэгдэх хүсэлт.');
    }
  }

  // ---------- helpers ----------

  private newCode(): string {
    for (let i = 0; i < 1000; i++) {
      let c = '';
      for (let j = 0; j < CODE_LENGTH; j++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c) && !this.classes.has(c)) return c;
    }
    throw err('Код үүсгэж чадсангүй.');
  }

  private seatConns(room: Room, seatId: string): Conn[] {
    const out: Conn[] = [];
    for (const c of this.conns) if (c.room === room.code && c.seat === seatId) out.push(c);
    return out;
  }

  private connRoom(conn: Conn): { room: Room; seat: Seat } {
    const room = conn.room ? this.rooms.get(conn.room) : undefined;
    const seat = room?.seats.find((s) => s.id === conn.seat);
    if (!room || !seat) throw err('Та өрөөнд алга байна.');
    return { room, seat };
  }

  private requireHost(conn: Conn) {
    const { room, seat } = this.connRoom(conn);
    if (room.hostId !== seat.id) throw err('Зөвхөн өрөөний эзэн үүнийг хийж чадна.');
    return { room, seat };
  }

  private uniqueName(room: Room, name: string): string {
    let n = name;
    let i = 2;
    while (room.seats.some((s) => s.name === n && !s.left)) n = `${name.slice(0, 13)} ${i++}`;
    return n;
  }

  private newSeat(room: Room, name: string, avatar: number, bot?: BotLevel): Seat {
    room.nextSeat += 1;
    return {
      id: `s${room.nextSeat}`,
      token: token(),
      name: this.uniqueName(room, name),
      avatar: clampInt(avatar, 0, 7, 0),
      isBot: !!bot,
      botLevel: bot,
      connected: !bot,
    };
  }

  private attach(conn: Conn, room: Room, seat: Seat) {
    if (conn.room && (conn.room !== room.code || conn.seat !== seat.id)) this.detach(conn);
    conn.room = room.code;
    conn.seat = seat.id;
    seat.connected = true;
    seat.disconnectedAt = undefined;
    this.plans.delete(room.code);
    room.lastActive = this.now();
    this.syncConnected(room);
    conn.send({ t: 'joined', code: room.code, playerId: seat.id, token: seat.token });
    this.broadcastRoom(room);
    if (room.game) {
      conn.send({ t: 'state', view: makeView(room.game, seat.id, this.now()) });
      this.broadcastState(room);
      this.schedule(room);
    }
    if (room.classCode) this.notifyClass(room.classCode);
  }

  private detach(conn: Conn) {
    const room = conn.room ? this.rooms.get(conn.room) : undefined;
    const seatId = conn.seat;
    conn.room = undefined;
    conn.seat = undefined;
    if (room && seatId) {
      const seat = room.seats.find((s) => s.id === seatId);
      if (seat && !this.seatConns(room, seatId).length) {
        seat.connected = false;
        seat.disconnectedAt = this.now();
        this.syncConnected(room);
      }
    }
  }

  private syncConnected(room: Room) {
    if (!room.game) return;
    for (const p of room.game.players) {
      const s = room.seats.find((x) => x.id === p.id);
      p.connected = s ? s.isBot || s.connected : false;
    }
  }

  private roomView(room: Room): RoomView {
    const cls = room.classCode ? this.classes.get(room.classCode) : undefined;
    return {
      code: room.code,
      hostId: room.hostId,
      seats: room.seats
        .filter((s) => !s.left)
        .map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, isBot: s.isBot, botLevel: s.botLevel, connected: s.isBot || s.connected })),
      maxPlayers: room.maxPlayers,
      settings: publicSettings(room.settings),
      status: room.status,
      classCode: room.classCode,
      className: cls?.name,
      tableNo: room.tableNo,
    };
  }

  private broadcastRoom(room: Room) {
    const view = this.roomView(room);
    for (const c of this.conns) if (c.room === room.code) c.send({ t: 'room', room: view });
    this.persist();
  }

  private broadcastState(room: Room) {
    if (!room.game) return;
    const now = this.now();
    const cache = new Map<string, ReturnType<typeof makeView>>();
    for (const c of this.conns) {
      if (c.room !== room.code || !c.seat) continue;
      let v = cache.get(c.seat);
      if (!v) {
        v = makeView(room.game, c.seat, now);
        cache.set(c.seat, v);
      }
      c.send({ t: 'state', view: v });
    }
  }

  // ---------- rooms ----------

  private createRoom(conn: Conn, msg: Extract<ClientMessage, { t: 'create' }>) {
    if (this.rooms.size >= MAX_ROOMS) throw err('Сервер дүүрсэн байна. Дараа дахин оролдоно уу.');
    if (conn.room) this.leave(conn, true);
    const now = this.now();
    const room: Room = {
      code: this.newCode(),
      hostId: null,
      seats: [],
      maxPlayers: clampInt(msg.maxPlayers, 2, 5, 4),
      settings: sanitizeSettings(msg.settings, true),
      status: 'lobby',
      game: null,
      createdAt: now,
      lastActive: now,
      answersSynced: 0,
      nextSeat: 0,
    };
    const seat = this.newSeat(room, sanitizeName(msg.name), msg.avatar);
    room.seats.push(seat);
    room.hostId = seat.id;
    this.rooms.set(room.code, room);
    this.attach(conn, room, seat);
    return { code: room.code };
  }

  private join(conn: Conn, rawCode: string, name: unknown, avatar: unknown) {
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== CODE_LENGTH) throw err('Код 6 тэмдэгттэй байх ёстой.');
    const cls = this.classes.get(code);
    if (cls) return this.joinClass(conn, cls, sanitizeName(name), avatar);
    const room = this.rooms.get(code);
    if (!room) throw err('Өрөө олдсонгүй. Кодоо шалгана уу.');
    if (room.classCode) {
      const c = this.classes.get(room.classCode);
      if (c) return this.joinClass(conn, c, sanitizeName(name), avatar);
    }
    if (room.status !== 'lobby') throw err('Энэ өрөөнд тоглоом аль хэдийн эхэлсэн байна.');
    if (room.seats.filter((s) => !s.left).length >= room.maxPlayers) throw err('Өрөө дүүрсэн байна.');
    if (conn.room) this.leave(conn, true);
    const seat = this.newSeat(room, sanitizeName(name), Number(avatar));
    room.seats.push(seat);
    if (!room.hostId) room.hostId = seat.id;
    this.attach(conn, room, seat);
    return { code: room.code };
  }

  private resume(conn: Conn, code: string, tok: string) {
    const room = this.rooms.get(code);
    const seat = room?.seats.find((s) => s.token === tok && !s.left);
    if (!room || !seat) {
      conn.send({ t: 'left', reason: 'expired' });
      return;
    }
    this.attach(conn, room, seat);
  }

  private leave(conn: Conn, silent = false) {
    const room = conn.room ? this.rooms.get(conn.room) : undefined;
    const seat = room?.seats.find((s) => s.id === conn.seat);
    if (!room || !seat) {
      conn.room = undefined;
      conn.seat = undefined;
      return;
    }
    for (const c of this.seatConns(room, seat.id)) {
      c.room = undefined;
      c.seat = undefined;
      if (!silent || c !== conn) c.send({ t: 'left', reason: 'left' });
    }
    this.removeSeat(room, seat);
  }

  private removeSeat(room: Room, seat: Seat) {
    seat.connected = false;
    if (room.status === 'lobby') {
      room.seats = room.seats.filter((s) => s !== seat);
      if (room.classCode) {
        const cls = this.classes.get(room.classCode);
        if (cls) delete cls.students[seat.token];
      }
    } else {
      seat.left = true;
      if (room.game && room.status === 'playing') {
        forfeit(room.game, seat.id, this.now());
        this.afterGameChange(room);
      }
    }
    if (room.hostId === seat.id) {
      const next = room.seats.find((s) => !s.isBot && !s.left);
      room.hostId = next ? next.id : null;
    }
    const humans = room.seats.filter((s) => !s.isBot && !s.left);
    if (humans.length === 0 && !room.classCode) {
      this.deleteRoom(room.code);
      return;
    }
    this.syncConnected(room);
    this.broadcastRoom(room);
    if (room.classCode) this.notifyClass(room.classCode);
  }

  private deleteRoom(code: string) {
    const t = this.timers.get(code);
    if (t) clearTimeout(t);
    this.timers.delete(code);
    this.plans.delete(code);
    this.rooms.delete(code);
    this.persist();
  }

  private addBot(conn: Conn, level: unknown) {
    const { room } = this.requireHost(conn);
    if (room.status !== 'lobby') throw err('Тоглоом эхэлсэн байна.');
    this.addBotTo(room, (['easy', 'medium', 'hard'] as const).includes(level as any) ? (level as BotLevel) : 'medium');
    this.broadcastRoom(room);
  }

  private addBotTo(room: Room, level: BotLevel) {
    const active = room.seats.filter((s) => !s.left);
    if (active.length >= room.maxPlayers) throw err('Өрөө дүүрсэн байна.');
    const used = new Set(active.map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? 'Робот';
    const avatars = new Set(active.map((s) => s.avatar));
    let avatar = 0;
    while (avatars.has(avatar) && avatar < 7) avatar++;
    room.seats.push(this.newSeat(room, name, avatar, level));
  }

  private kick(conn: Conn, playerId: string) {
    const { room, seat: host } = this.requireHost(conn);
    if (playerId === host.id) throw err('Өөрийгөө хасах боломжгүй.');
    const seat = room.seats.find((s) => s.id === playerId && !s.left);
    if (!seat) throw err('Тоглогч олдсонгүй.');
    this.kickSeat(room, seat);
  }

  private kickSeat(room: Room, seat: Seat) {
    for (const c of this.seatConns(room, seat.id)) {
      c.room = undefined;
      c.seat = undefined;
      c.send({ t: 'left', reason: 'kicked' });
    }
    this.removeSeat(room, seat);
  }

  private roomSettings(conn: Conn, settings: unknown, maxPlayers: unknown) {
    const { room } = this.requireHost(conn);
    if (room.classCode) throw err('Ангийн тохиргоог багш өөрчилнө.');
    if (room.status !== 'lobby') throw err('Тоглоом эхэлсэн байна.');
    room.settings = sanitizeSettings(settings, true);
    room.maxPlayers = Math.max(room.seats.filter((s) => !s.left).length, clampInt(maxPlayers, 2, 5, room.maxPlayers));
    this.broadcastRoom(room);
  }

  private start(conn: Conn) {
    const { room } = this.requireHost(conn);
    if (room.classCode) throw err('Ангийн тоглоомыг багш эхлүүлнэ.');
    if (room.status !== 'lobby') throw err('Тоглоом эхэлсэн байна.');
    this.startGame(room);
  }

  private startGame(room: Room) {
    room.seats = room.seats.filter((s) => !s.left);
    const active = room.seats;
    if (active.length < 2) throw err('Дор хаяж 2 тоглогч хэрэгтэй.');
    const now = this.now();
    room.game = createGame(
      active.map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, isBot: s.isBot, botLevel: s.botLevel })),
      room.settings,
      now,
    );
    room.status = 'playing';
    room.answersSynced = 0;
    room.recordedGameId = undefined;
    this.plans.delete(room.code);
    this.syncConnected(room);
    this.broadcastRoom(room);
    this.afterGameChange(room);
  }

  private rematch(conn: Conn) {
    const { room } = this.requireHost(conn);
    this.restartRoom(room);
  }

  private restartRoom(room: Room) {
    if (room.status === 'lobby') throw err('Тоглоом эхлээгүй байна.');
    room.seats = room.seats.filter((s) => !s.left);
    const cls = room.classCode ? this.classes.get(room.classCode) : undefined;
    if (cls) {
      room.settings = structuredClone(cls.settings);
      this.recordClassResults(room);
    }
    while (room.seats.length < 2) this.addBotTo(room, cls?.botLevel ?? 'medium');
    this.startGame(room);
  }

  private act(conn: Conn, rawAction: unknown) {
    const { room, seat } = this.connRoom(conn);
    if (!room.game || room.status !== 'playing') throw err('Тоглоом явагдаагүй байна.');
    const a = cleanAction(rawAction);
    if (!a) throw err('Буруу үйлдэл.');
    applyAction(room.game, { ...a, playerId: seat.id } as GameAction, this.now());
    this.afterGameChange(room);
  }

  // ---------- game loop ----------

  private afterGameChange(room: Room) {
    const g = room.game;
    if (!g) return;
    room.lastActive = this.now();
    this.syncConnected(room);
    this.broadcastState(room);
    if (room.classCode) this.syncClassAnswers(room);
    if (g.phase.kind === 'over' && room.status === 'playing') {
      room.status = 'over';
      if (room.classCode) this.recordClassResults(room);
      this.broadcastRoom(room);
    }
    if (room.classCode) this.notifyClass(room.classCode);
    this.persist();
    this.schedule(room);
  }

  private currentPlan(room: Room): BotPlan | null {
    const g = room.game;
    if (!g || g.phase.kind === 'over') return null;
    const actor = pendingActorId(g);
    if (!actor) return null;
    const seat = room.seats.find((s) => s.id === actor);
    if (!seat) return null;
    const away = !seat.isBot && (!seat.connected || seat.left);
    if (!seat.isBot && !(away && g.phase.kind !== 'math')) return null;
    const cached = this.plans.get(room.code);
    if (cached && cached.version === g.version && cached.forSeat === actor) return cached.plan;
    const now = this.now();
    const plan = planBot(g, actor, now, Math.random, seat.isBot ? undefined : 'easy');
    if (plan && away) {
      plan.at = Math.max(plan.at, now + DISCONNECT_GRACE_MS);
      // Don't spend an absent player's cards for them: just take the turn's draw.
      if (g.phase.kind === 'turn') plan.action = { type: 'draw', playerId: actor };
    }
    this.plans.set(room.code, { version: g.version, plan, forSeat: actor });
    return plan;
  }

  private schedule(room: Room) {
    const old = this.timers.get(room.code);
    if (old) clearTimeout(old);
    this.timers.delete(room.code);
    const g = room.game;
    if (!g || g.phase.kind === 'over') return;
    let wake = nextDeadline(g) ?? Infinity;
    const plan = this.currentPlan(room);
    if (plan?.action) wake = Math.min(wake, plan.at);
    if (!Number.isFinite(wake)) return;
    const t = setTimeout(() => this.wake(room.code), Math.max(0, wake - this.now()));
    t.unref?.();
    this.timers.set(room.code, t);
  }

  private wake(code: string) {
    this.timers.delete(code);
    const room = this.rooms.get(code);
    const g = room?.game;
    if (!room || !g) return;
    const now = this.now();
    let changed = false;
    const plan = this.currentPlan(room);
    if (plan?.action && now >= plan.at - 5) {
      try {
        applyAction(g, plan.action, now);
        changed = true;
      } catch {
        /* state moved on */
      }
      this.plans.delete(code);
    }
    if (!changed) changed = tick(g, now);
    if (changed) this.afterGameChange(room);
    else this.schedule(room);
  }

  // ---------- classrooms ----------

  private teacherClass(conn: Conn): Classroom {
    const cls = conn.classCode ? this.classes.get(conn.classCode) : undefined;
    if (!cls) throw err('Анги олдсонгүй.');
    return cls;
  }

  private classCreate(conn: Conn, msg: Extract<ClientMessage, { t: 'classCreate' }>) {
    const now = this.now();
    const cls: Classroom = {
      code: this.newCode(),
      token: token(24),
      name: sanitizeName(msg.name, 'Анги').slice(0, 24),
      settings: sanitizeSettings(msg.settings, true),
      tableSize: clampInt(msg.tableSize, 2, 5, 4),
      fillBots: !!msg.fillBots,
      botLevel: (['easy', 'medium', 'hard'] as const).includes(msg.botLevel as any) ? msg.botLevel : 'medium',
      tables: [],
      students: {},
      answers: [],
      createdAt: now,
      lastActive: now,
      active: true,
    };
    this.classes.set(cls.code, cls);
    conn.classCode = cls.code;
    conn.send({ t: 'classJoined', code: cls.code, token: cls.token });
    this.sendClass(cls);
    this.persist();
    return { code: cls.code, token: cls.token };
  }

  private classResume(conn: Conn, code: string, tok: string, quiet: boolean) {
    const cls = this.classes.get(code);
    if (!cls || cls.token !== tok) {
      conn.send({ t: 'classEnded', reason: 'expired' });
      if (!quiet) throw err('Анги олдсонгүй эсвэл хугацаа нь дууссан.');
      return;
    }
    conn.classCode = cls.code;
    conn.send({ t: 'classJoined', code: cls.code, token: cls.token });
    this.sendClass(cls);
    return { code: cls.code };
  }

  private classSettings(conn: Conn, msg: Extract<ClientMessage, { t: 'classSettings' }>) {
    const cls = this.teacherClass(conn);
    cls.settings = sanitizeSettings(msg.settings, true);
    cls.tableSize = clampInt(msg.tableSize, 2, 5, cls.tableSize);
    cls.fillBots = !!msg.fillBots;
    cls.botLevel = (['easy', 'medium', 'hard'] as const).includes(msg.botLevel as any) ? msg.botLevel : cls.botLevel;
    for (const code of cls.tables) {
      const room = this.rooms.get(code);
      if (!room || room.status !== 'lobby') continue;
      room.settings = structuredClone(cls.settings);
      room.maxPlayers = Math.max(room.seats.length, cls.tableSize);
      this.broadcastRoom(room);
    }
    this.sendClass(cls);
    this.persist();
  }

  private joinClass(conn: Conn, cls: Classroom, name: string, avatar: unknown) {
    if (!cls.active) throw err('Энэ ангийн хичээл дууссан байна.');
    if (conn.room) this.leave(conn, true);
    const now = this.now();
    let room = cls.tables
      .map((c) => this.rooms.get(c))
      .find((r): r is Room => !!r && r.status === 'lobby' && r.seats.filter((s) => !s.isBot).length < cls.tableSize);
    if (room) {
      // Make space by dropping a filler bot if the table is full of bots.
      if (room.seats.length >= room.maxPlayers) {
        const bot = room.seats.findIndex((s) => s.isBot);
        if (bot >= 0) room.seats.splice(bot, 1);
      }
    } else {
      room = {
        code: this.newCode(),
        hostId: null,
        seats: [],
        maxPlayers: cls.tableSize,
        settings: structuredClone(cls.settings),
        status: 'lobby',
        game: null,
        createdAt: now,
        lastActive: now,
        classCode: cls.code,
        tableNo: cls.tables.length + 1,
        answersSynced: 0,
        nextSeat: 0,
      };
      this.rooms.set(room.code, room);
      cls.tables.push(room.code);
    }
    const seat = this.newSeat(room, name, Number(avatar));
    room.seats.push(seat);
    if (!room.hostId) room.hostId = seat.id;
    cls.students[seat.token] = {
      sid: token(6),
      token: seat.token,
      seatId: seat.id,
      name: seat.name,
      avatar: seat.avatar,
      table: room.tableNo ?? 0,
      roomCode: room.code,
      games: 0,
      wins: 0,
      score: 0,
      answered: 0,
      correct: 0,
      totalMs: 0,
    };
    cls.lastActive = now;
    this.attach(conn, room, seat);
    this.notifyClass(cls.code);
    return { code: room.code };
  }

  private classStart(conn: Conn, tableCode?: string) {
    const cls = this.teacherClass(conn);
    if (!cls.active) throw err('Анги хаагдсан байна.');
    let started = 0;
    for (const code of cls.tables) {
      if (tableCode && code !== tableCode) continue;
      const room = this.rooms.get(code);
      if (!room) continue;
      const humans = room.seats.filter((s) => !s.isBot && !s.left);
      if (humans.length === 0) continue;
      if (room.status === 'playing' && !tableCode) continue;
      room.settings = structuredClone(cls.settings);
      if (room.status !== 'lobby') {
        this.restartRoom(room);
      } else {
        room.maxPlayers = Math.max(room.maxPlayers, cls.tableSize);
        if (cls.fillBots) while (room.seats.length < cls.tableSize) this.addBotTo(room, cls.botLevel);
        while (room.seats.length < 2) this.addBotTo(room, cls.botLevel);
        this.startGame(room);
      }
      started++;
    }
    if (!started) throw err('Эхлүүлэх ширээ алга. Сурагчид кодоор нэгдэх хүртэл хүлээнэ үү.');
    this.notifyClass(cls.code);
    return { started };
  }

  private classKick(conn: Conn, sid: string) {
    const cls = this.teacherClass(conn);
    const st = Object.values(cls.students).find((s) => s.sid === sid);
    if (!st) throw err('Сурагч олдсонгүй.');
    const room = this.rooms.get(st.roomCode);
    const seat = room?.seats.find((s) => s.token === st.token && !s.left);
    if (room && seat) this.kickSeat(room, seat);
    else delete cls.students[st.token];
    this.notifyClass(cls.code);
  }

  private classClose(conn: Conn) {
    const cls = this.teacherClass(conn);
    cls.active = false;
    for (const code of cls.tables) {
      const room = this.rooms.get(code);
      if (!room) continue;
      this.recordClassResults(room);
      for (const c of this.conns) {
        if (c.room === code) {
          c.room = undefined;
          c.seat = undefined;
          c.send({ t: 'left', reason: 'classClosed' });
        }
      }
      this.deleteRoom(code);
    }
    this.sendClass(cls);
    this.persist();
  }

  private syncClassAnswers(room: Room) {
    const cls = room.classCode ? this.classes.get(room.classCode) : undefined;
    const g = room.game;
    if (!cls || !g) return;
    const humans = new Set(room.seats.filter((s) => !s.isBot).map((s) => s.id));
    for (let i = room.answersSynced; i < g.answers.length; i++) {
      const a = g.answers[i];
      if (!humans.has(a.playerId)) continue;
      cls.answers.push({
        name: a.name,
        table: room.tableNo ?? 0,
        topic: a.topic,
        difficulty: a.difficulty,
        purpose: a.purpose,
        correct: a.correct,
        timedOut: a.timedOut,
        ms: a.ms,
        at: a.at,
        text: a.text.slice(0, 200),
      });
    }
    room.answersSynced = g.answers.length;
    if (cls.answers.length > 5000) cls.answers.splice(0, cls.answers.length - 5000);
    cls.lastActive = this.now();
  }

  private recordClassResults(room: Room) {
    const cls = room.classCode ? this.classes.get(room.classCode) : undefined;
    const g = room.game;
    if (!cls || !g || room.recordedGameId === g.id) return;
    room.recordedGameId = g.id;
    const finished = g.phase.kind === 'over';
    for (const seat of room.seats) {
      if (seat.isBot) continue;
      const st = cls.students[seat.token];
      const p = g.players.find((x) => x.id === seat.id);
      if (!st || !p) continue;
      st.games += finished ? 1 : 0;
      st.wins += finished && p.place === 1 ? 1 : 0;
      st.score += p.stats.score;
      st.answered += p.stats.answered;
      st.correct += p.stats.correct;
      st.totalMs += p.stats.totalMs;
    }
  }

  private classView(cls: Classroom): ClassView {
    const tables = cls.tables
      .map((code) => this.rooms.get(code))
      .filter((r): r is Room => !!r)
      .map((r) => ({
        no: r.tableNo ?? 0,
        code: r.code,
        status: r.status,
        turn: r.game?.turnNumber ?? 0,
        players: r.seats
          .filter((s) => !s.left)
          .map((s) => {
            const p = r.game?.players.find((x) => x.id === s.id);
            return {
              name: s.name,
              avatar: s.avatar,
              isBot: s.isBot,
              connected: s.isBot || s.connected,
              alive: p ? p.alive : true,
              handCount: p ? p.hand.length : 0,
              score: p ? p.stats.score : 0,
              place: p?.place,
            };
          }),
      }));
    const students: ClassStudentView[] = Object.values(cls.students).map((st) => {
      const room = this.rooms.get(st.roomCode);
      const seat = room?.seats.find((s) => s.token === st.token);
      const p = room?.game?.players.find((x) => x.id === st.seatId);
      const live = p && room && room.recordedGameId !== room.game?.id;
      const answered = st.answered + (live ? p!.stats.answered : 0);
      const totalMs = st.totalMs + (live ? p!.stats.totalMs : 0);
      let status: ClassStudentView['status'] = 'left';
      if (room && seat && !seat.left) {
        if (room.status === 'lobby') status = 'lobby';
        else if (room.status === 'playing') status = p?.alive ? 'playing' : 'out';
        else status = p?.place === 1 ? 'won' : 'done';
      }
      return {
        sid: st.sid,
        name: st.name,
        avatar: st.avatar,
        table: st.table,
        connected: !!seat?.connected,
        status,
        games: st.games,
        wins: st.wins,
        score: st.score + (live ? p!.stats.score : 0),
        answered,
        correct: st.correct + (live ? p!.stats.correct : 0),
        avgMs: answered ? Math.round(totalMs / answered) : 0,
      };
    });
    return {
      code: cls.code,
      name: cls.name,
      active: cls.active,
      createdAt: cls.createdAt,
      settings: publicSettings(cls.settings),
      tableSize: cls.tableSize,
      fillBots: cls.fillBots,
      botLevel: cls.botLevel,
      tables,
      students,
      answers: cls.answers.slice(-1500),
    };
  }

  private sendClass(cls: Classroom) {
    const t = this.classNotify.get(cls.code);
    if (t) clearTimeout(t);
    this.classNotify.delete(cls.code);
    let view: ClassView | null = null;
    for (const c of this.conns) {
      if (c.classCode !== cls.code) continue;
      view ??= this.classView(cls);
      c.send({ t: 'class', data: view });
    }
  }

  private notifyClass(code: string) {
    if (this.classNotify.has(code)) return;
    const t = setTimeout(() => {
      this.classNotify.delete(code);
      const cls = this.classes.get(code);
      if (cls) this.sendClass(cls);
    }, 400);
    t.unref?.();
    this.classNotify.set(code, t);
  }

  // ---------- persistence & cleanup ----------

  private persist() {
    if (!this.opts.dataFile || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 1500);
    this.saveTimer.unref?.();
  }

  private saveNow() {
    if (!this.opts.dataFile) return;
    const data: SaveFile = { savedAt: this.now(), rooms: [...this.rooms.values()], classes: [...this.classes.values()] };
    try {
      fs.mkdirSync(path.dirname(this.opts.dataFile), { recursive: true });
      const tmp = `${this.opts.dataFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.opts.dataFile);
    } catch (e) {
      console.error('Хадгалах үед алдаа:', e);
    }
  }

  private load() {
    const file = this.opts.dataFile;
    if (!file || !fs.existsSync(file)) return;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SaveFile;
      const downtime = Math.max(0, this.now() - (data.savedAt || this.now()));
      for (const r of data.rooms ?? []) {
        for (const s of r.seats) s.connected = s.isBot;
        if (r.game) {
          shiftTimers(r.game, downtime);
          for (const p of r.game.players) p.connected = p.isBot;
        }
        this.rooms.set(r.code, r);
      }
      for (const c of data.classes ?? []) this.classes.set(c.code, c);
      for (const r of this.rooms.values()) if (r.status === 'playing') this.schedule(r);
      console.log(`Сэргээлээ: ${this.rooms.size} өрөө, ${this.classes.size} анги`);
    } catch (e) {
      console.error('Хадгалсан төлөв уншиж чадсангүй:', e);
    }
  }

  cleanup() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const cls = room.classCode ? this.classes.get(room.classCode) : undefined;
      // Drop people who disconnected from a lobby long ago.
      if (room.status === 'lobby') {
        for (const s of [...room.seats]) {
          if (!s.isBot && !s.connected && s.disconnectedAt && now - s.disconnectedAt > 3 * 60_000) this.removeSeat(room, s);
        }
        if (!this.rooms.has(room.code)) continue;
      }
      const online = room.seats.some((s) => !s.isBot && s.connected);
      const idle = now - room.lastActive;
      const limit = cls?.active ? 12 * 3600_000 : room.status === 'lobby' ? 30 * 60_000 : 3 * 3600_000;
      if (!online && idle > limit) this.deleteRoom(room.code);
    }
    for (const cls of [...this.classes.values()]) {
      if (now - cls.lastActive > 24 * 3600_000) {
        for (const code of cls.tables) this.deleteRoom(code);
        this.classes.delete(cls.code);
        this.persist();
      }
    }
  }
}
