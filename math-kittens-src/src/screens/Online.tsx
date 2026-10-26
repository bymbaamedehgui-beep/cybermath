import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { BotLevel, GameSettings } from '../../shared/game/types';
import { CODE_LENGTH } from '../../shared/net';
import { CatAvatar } from '../art';
import { sfx } from '../audio/sfx';
import { QrCode } from '../components/Qr';
import { SettingsForm, settingsSummary } from '../components/SettingsForm';
import { apiUrl, pageBase, SAME_ORIGIN_SERVER } from '../net/config';
import { net, useNet } from '../net/net';
import { getPrefs, setGameSettings, setPrefs, usePrefs } from '../store/prefs';
import { AvatarPicker, Button, Field, inputCls, Modal, Panel, Screen, Segmented, Spinner } from '../ui/ui';
import { BOT_LEVEL_NAMES } from './Setup';

const TURN_OPTIONS = [30, 60, 90, 120];

/** Address other devices should open, ending in "/" (the LAN IP when this page runs on localhost). */
export function useShareBase(): string {
  const [base, setBase] = useState(() => pageBase());
  useEffect(() => {
    if (!SAME_ORIGIN_SERVER || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
    let cancel = false;
    fetch(apiUrl('/api/info'))
      .then((r) => r.json())
      .then((d: { lan?: string[] }) => {
        if (!cancel && d.lan && d.lan[0]) setBase(pageBase(`${location.protocol}//${d.lan[0]}${location.port ? `:${location.port}` : ''}`));
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);
  return base;
}

function NameAvatar({ name, setName }: { name: string; setName: (s: string) => void }) {
  const prefs = usePrefs();
  return (
    <>
      <Field label="Таны хоч нэр">
        <input className={inputCls} value={name} maxLength={16} placeholder="Хоч нэрээ бичээрэй" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Таны муур">
        <AvatarPicker value={prefs.avatar} onChange={(avatar) => setPrefs({ avatar })} />
      </Field>
    </>
  );
}

export function CreateRoom({ onBack }: { onBack: () => void }) {
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.name);
  const [maxPlayers, setMax] = useState(prefs.players);
  const [turn, setTurn] = useState(prefs.settings.turnTimeLimit ?? 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    const nm = name.trim().slice(0, 16);
    if (!nm) {
      setError('Хоч нэрээ оруулна уу.');
      return;
    }
    setPrefs({ name: nm, players: maxPlayers });
    setBusy(true);
    setError(null);
    const s = getPrefs();
    const r = await net.request({
      t: 'create',
      name: nm,
      avatar: s.avatar,
      maxPlayers,
      settings: { ...s.settings, turnTimeLimit: turn },
    });
    setBusy(false);
    if (r.error) setError(r.error);
  };
  return (
    <Screen title="Өрөө үүсгэх" onBack={onBack}>
      <div className="grid gap-4">
        <Panel>
          <div className="grid gap-4">
            <NameAvatar name={name} setName={setName} />
            <Field label="Хамгийн ихдээ хэдэн тоглогч">
              <Segmented value={maxPlayers} onChange={setMax} options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n}` }))} />
            </Field>
            <Field label="Нэг нүүдлийн хугацаа" hint="Хугацаандаа нүүгээгүй бол автоматаар карт сугална.">
              <Segmented value={turn} onChange={setTurn} options={TURN_OPTIONS.map((n) => ({ value: n, label: `${n} с` }))} />
            </Field>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-lg font-black">🧮 Бодлогын тохиргоо</h2>
          <SettingsForm value={prefs.settings} onChange={setGameSettings} />
        </Panel>
        {error && <div className="rounded-2xl bg-rose-500/20 px-4 py-3 text-center font-bold text-rose-100">{error}</div>}
        <Button size="lg" onClick={create} disabled={busy}>
          {busy ? <Spinner /> : '🏠'} Өрөө үүсгэх
        </Button>
      </div>
    </Screen>
  );
}

export function JoinRoom({ onBack, initialCode }: { onBack: () => void; initialCode?: string }) {
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.name);
  const [code, setCode] = useState((initialCode ?? '').toUpperCase().slice(0, CODE_LENGTH));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const join = async () => {
    const nm = name.trim().slice(0, 16);
    if (code.length !== CODE_LENGTH) {
      setError('6 тэмдэгттэй кодоо бүтэн оруулна уу.');
      return;
    }
    if (!nm) {
      setError('Хоч нэрээ оруулна уу.');
      return;
    }
    setPrefs({ name: nm });
    setBusy(true);
    setError(null);
    const r = await net.request({ t: 'join', code, name: nm, avatar: getPrefs().avatar });
    setBusy(false);
    if (r.error) {
      sfx.wrong();
      setError(r.error);
    }
  };
  return (
    <Screen title="Өрөөнд нэгдэх" onBack={onBack}>
      <div className="grid gap-4">
        <Panel>
          <Field label="Өрөө эсвэл ангийн код">
            <input
              className={`${inputCls} text-center !text-3xl font-black uppercase tracking-[0.35em]`}
              value={code}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={CODE_LENGTH}
              placeholder="ABC123"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH))}
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
          </Field>
        </Panel>
        <Panel>
          <div className="grid gap-4">
            <NameAvatar name={name} setName={setName} />
          </div>
        </Panel>
        {error && <div className="rounded-2xl bg-rose-500/20 px-4 py-3 text-center font-bold text-rose-100">{error}</div>}
        <Button size="lg" variant="neon" onClick={join} disabled={busy}>
          {busy ? <Spinner /> : '🔑'} Нэгдэх
        </Button>
      </div>
    </Screen>
  );
}

export function Lobby({ onLeave }: { onLeave: () => void }) {
  const st = useNet();
  const prefs = usePrefs();
  const room = st.room;
  const base = useShareBase();
  const [botLevel, setBotLevel] = useState<BotLevel>(prefs.botLevel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GameSettings>(prefs.settings);
  const [maxDraft, setMaxDraft] = useState(room?.maxPlayers ?? 4);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!room || !st.session) {
    return (
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3">
        <Spinner className="h-10 w-10" />
        <div className="font-bold">Өрөөнд холбогдож байна…</div>
        <Button variant="ghost" onClick={onLeave}>
          Буцах
        </Button>
      </div>
    );
  }
  const me = st.session.playerId;
  const isHost = room.hostId === me;
  const classroom = !!room.classCode;
  const shareCode = room.classCode ?? room.code;
  const link = `${base}?join=${shareCode}`;
  const run = async (msg: Parameters<typeof net.request>[0]) => {
    setError(null);
    const r = await net.request(msg);
    if (r.error) setError(r.error);
    return r;
  };
  const copy = async () => {
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
        await navigator.share({ title: 'Математик Муурнууд', text: `Өрөөний код: ${shareCode}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <Screen
      title={classroom ? `${room.className ?? 'Анги'} · Ширээ ${room.tableNo}` : 'Тоглоомын өрөө'}
      onBack={async () => {
        await net.leaveRoom();
        onLeave();
      }}
    >
      <div className="grid gap-4">
        <Panel className="text-center">
          {classroom ? (
            <>
              <div className="text-sm font-bold text-violet-200/80">Ангийн код</div>
              <div className="neon-text mt-1 text-5xl font-black tracking-[0.25em] text-cyan-200">{room.classCode}</div>
              <div className="mt-3 rounded-2xl bg-black/25 px-4 py-3 font-bold text-orange-100">
                ⏳ Багш тоглоомыг эхлүүлэхийг хүлээж байна…
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
              <div>
                <div className="text-sm font-bold text-violet-200/80">Өрөөний код</div>
                <motion.div
                  initial={{ scale: 0.7 }}
                  animate={{ scale: 1 }}
                  className="neon-text mt-1 select-text text-5xl font-black tracking-[0.25em] text-cyan-200 sm:text-6xl"
                >
                  {room.code}
                </motion.div>
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" variant="neon" onClick={copy}>
                    {copied ? '✅ Хуулагдлаа' : '🔗 Холбоос хуваалцах'}
                  </Button>
                </div>
                <div className="mt-2 max-w-xs break-all text-xs font-semibold text-violet-200/60">{link}</div>
              </div>
              <QrCode text={link} size={150} />
            </div>
          )}
        </Panel>

        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">
              Тоглогчид ({room.seats.length}/{room.maxPlayers})
            </h2>
            {!classroom && <span className="text-xs font-bold text-violet-200/70">{isHost ? 'Та өрөөний эзэн' : ''}</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {room.seats.map((s) => (
              <motion.div
                layout
                key={s.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`flex items-center gap-3 rounded-2xl p-2.5 ${s.id === me ? 'bg-cyan-400/15 ring-1 ring-cyan-300/50' : 'bg-white/6'}`}
              >
                <CatAvatar index={s.avatar} mood={s.connected ? 'happy' : 'sad'} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-black">
                    {s.name} {s.id === room.hostId && !classroom && '👑'}
                  </div>
                  <div className="text-xs font-bold text-violet-200/70">
                    {s.isBot ? `🤖 Компьютер · ${BOT_LEVEL_NAMES[s.botLevel ?? 'medium']}` : s.connected ? '🟢 Бэлэн' : '📴 Холболт тасарсан'}
                    {s.id === me && ' · Та'}
                  </div>
                </div>
                {isHost && !classroom && s.id !== me && (
                  <Button size="sm" variant="ghost" onClick={() => run({ t: 'kick', playerId: s.id })} title="Хасах">
                    ✕
                  </Button>
                )}
              </motion.div>
            ))}
            {Array.from({ length: Math.max(0, room.maxPlayers - room.seats.length) }, (_, i) => (
              <div key={`empty${i}`} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/10 p-2.5 text-sm font-bold text-violet-200/50">
                <div className="h-12 w-12 rounded-full bg-white/5" />
                Хоосон суудал
              </div>
            ))}
          </div>
          {isHost && !classroom && room.seats.length < room.maxPlayers && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Segmented value={botLevel} onChange={setBotLevel} options={(['easy', 'medium', 'hard'] as const).map((l) => ({ value: l, label: BOT_LEVEL_NAMES[l] }))} />
              <Button size="sm" variant="ghost" onClick={() => run({ t: 'addBot', level: botLevel })}>
                🤖 Компьютер нэмэх
              </Button>
            </div>
          )}
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-violet-200/80">Тохиргоо</div>
              <div className="font-black">{settingsSummary({ ...room.settings, customQuestions: [] })}</div>
              <div className="text-xs font-semibold text-violet-200/70">
                Нүүдэл: {room.settings.turnTimeLimit ?? '∞'} с
                {room.settings.customCount > 0 && ` · Багшийн ${room.settings.customCount} асуулт`}
                {room.settings.mathOnActions && ' · Карт бүрт бодлого'}
              </div>
            </div>
            {isHost && !classroom && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft({ ...getPrefs().settings, ...room.settings, customQuestions: getPrefs().settings.customQuestions });
                  setMaxDraft(room.maxPlayers);
                  setEditing(true);
                }}
              >
                ✏️ Засах
              </Button>
            )}
          </div>
        </Panel>

        {error && <div className="rounded-2xl bg-rose-500/20 px-4 py-3 text-center font-bold text-rose-100">{error}</div>}

        {!classroom &&
          (isHost ? (
            <Button size="lg" disabled={room.seats.length < 2} onClick={() => run({ t: 'start' })}>
              🚀 Тоглоом эхлүүлэх
            </Button>
          ) : (
            <div className="glass rounded-2xl px-4 py-4 text-center font-bold text-violet-100/85">⏳ Өрөөний эзэн эхлүүлэхийг хүлээж байна…</div>
          ))}
        {!classroom && isHost && room.seats.length < 2 && (
          <p className="-mt-2 text-center text-sm font-semibold text-violet-200/70">Найзаа кодоор урих эсвэл компьютер нэмнэ үү.</p>
        )}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)}>
        <h2 className="mb-4 text-xl font-black">Өрөөний тохиргоо</h2>
        <div className="grid gap-4">
          <Field label="Хамгийн ихдээ хэдэн тоглогч">
            <Segmented value={maxDraft} onChange={setMaxDraft} options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n}` }))} />
          </Field>
          <Field label="Нэг нүүдлийн хугацаа">
            <Segmented
              value={draft.turnTimeLimit ?? 60}
              onChange={(v) => setDraft((d) => ({ ...d, turnTimeLimit: v }))}
              options={TURN_OPTIONS.map((n) => ({ value: n, label: `${n} с` }))}
            />
          </Field>
          <SettingsForm value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
          <Button
            onClick={async () => {
              const r = await run({ t: 'roomSettings', settings: draft, maxPlayers: maxDraft });
              if (!r.error) setEditing(false);
            }}
          >
            Хадгалах
          </Button>
        </div>
      </Modal>
    </Screen>
  );
}
