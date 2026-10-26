import { useState } from 'react';
import { BOT_NAMES } from '../../shared/game/bot';
import type { BotLevel, GameSettings, SeatInfo } from '../../shared/game/types';
import { AVATAR_COUNT, CatAvatar } from '../art';
import { SettingsForm } from '../components/SettingsForm';
import { ONLINE_ENABLED } from '../net/config';
import { getPrefs, setGameSettings, setPrefs, usePrefs } from '../store/prefs';
import { AvatarPicker, Button, Field, inputCls, Panel, Screen, Segmented } from '../ui/ui';

export const BOT_LEVEL_NAMES: Record<BotLevel, string> = { easy: 'Хялбар', medium: 'Дунд', hard: 'Хүчтэй' };

export function myName(): string {
  return getPrefs().name.trim() || 'Тоглогч';
}

/** You plus computer opponents, using the saved defaults. */
export function aiSeats(players: number, level: BotLevel): SeatInfo[] {
  const prefs = getPrefs();
  const seats: SeatInfo[] = [{ id: 'you', name: myName(), avatar: prefs.avatar, isBot: false }];
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  let av = (prefs.avatar + 1) % AVATAR_COUNT;
  for (let i = 1; i < players; i++) {
    seats.push({ id: `bot${i}`, name: names[i - 1], avatar: av, isBot: true, botLevel: level });
    av = (av + 1) % AVATAR_COUNT;
  }
  return seats;
}

export function AiSetup({ onBack, onStart }: { onBack: () => void; onStart: (seats: SeatInfo[], settings: GameSettings) => void }) {
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.name);
  return (
    <Screen title="Компьютертэй тоглох" onBack={onBack}>
      <div className="grid gap-4">
        <Panel>
          <div className="grid gap-4">
            <Field label="Таны хоч нэр">
              <input className={inputCls} value={name} maxLength={16} placeholder="Хоч нэрээ бичээрэй" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Таны муур">
              <AvatarPicker value={prefs.avatar} onChange={(avatar) => setPrefs({ avatar })} />
            </Field>
            <Field label="Тоглогчийн тоо (та оролцоно)">
              <Segmented value={prefs.players} onChange={(players) => setPrefs({ players })} options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n}` }))} />
            </Field>
            <Field label="Компьютерийн чадвар">
              <Segmented
                value={prefs.botLevel}
                onChange={(botLevel) => setPrefs({ botLevel })}
                options={(['easy', 'medium', 'hard'] as const).map((l) => ({ value: l, label: BOT_LEVEL_NAMES[l] }))}
              />
            </Field>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-lg font-black">🧮 Бодлогын тохиргоо</h2>
          <SettingsForm value={prefs.settings} onChange={setGameSettings} />
        </Panel>
        <Button
          size="lg"
          onClick={() => {
            setPrefs({ name: name.trim().slice(0, 16) });
            onStart(aiSeats(getPrefs().players, getPrefs().botLevel), getPrefs().settings);
          }}
        >
          🚀 Тоглоом эхлүүлэх
        </Button>
      </div>
    </Screen>
  );
}

interface HotSeat {
  name: string;
  avatar: number;
  bot: boolean;
}

export function FriendsScreen({
  onBack,
  onStart,
  onCreate,
  onJoin,
}: {
  onBack: () => void;
  onStart: (seats: SeatInfo[], settings: GameSettings) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const prefs = usePrefs();
  const [seats, setSeats] = useState<HotSeat[]>(() => [
    { name: prefs.name || 'Тоглогч 1', avatar: prefs.avatar, bot: false },
    { name: 'Тоглогч 2', avatar: (prefs.avatar + 1) % AVATAR_COUNT, bot: false },
  ]);
  const update = (i: number, patch: Partial<HotSeat>) => setSeats((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const humans = seats.filter((s) => !s.bot).length;
  const start = () => {
    const used = new Set<string>();
    const list: SeatInfo[] = seats.map((s, i) => {
      let name = s.name.trim().slice(0, 16) || (s.bot ? BOT_NAMES[i] : `Тоглогч ${i + 1}`);
      while (used.has(name)) name = `${name}${i + 1}`;
      used.add(name);
      return { id: `h${i}`, name, avatar: s.avatar, isBot: s.bot, botLevel: s.bot ? prefs.botLevel : undefined };
    });
    onStart(list, getPrefs().settings);
  };
  return (
    <Screen title="Найзуудтайгаа тоглох" onBack={onBack}>
      <div className="grid gap-4">
        {ONLINE_ENABLED && (
        <Panel>
          <h2 className="text-lg font-black">🌐 Тусдаа төхөөрөмжөөс</h2>
          <p className="mt-1 text-sm font-semibold text-violet-100/80">
            Өрөө үүсгээд 6 тэмдэгттэй кодоо найздаа өгөөрэй. Хүн бүр өөрийн утас, компьютерээсээ нэгдэнэ.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="neon" onClick={onCreate}>
              🏠 Өрөө үүсгэх
            </Button>
            <Button variant="ghost" onClick={onJoin}>
              🔑 Өрөөнд нэгдэх
            </Button>
          </div>
        </Panel>
        )}

        <Panel>
          <h2 className="text-lg font-black">📱 Нэг төхөөрөмж дээр ээлжилж</h2>
          <p className="mt-1 text-sm font-semibold text-violet-100/80">
            Нэг утас эсвэл таблетыг дамжуулан тоглоно. Ээлж солигдох бүрт гар нууцлагдана.
          </p>
          <div className="mt-4 grid gap-2">
            {seats.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-2xl bg-black/20 p-2">
                <button
                  type="button"
                  className="h-12 w-12 shrink-0"
                  onClick={() => update(i, { avatar: (s.avatar + 1) % AVATAR_COUNT })}
                  aria-label="Муур солих"
                >
                  <CatAvatar index={s.avatar} mood={s.bot ? 'idle' : 'happy'} className="h-full w-full" />
                </button>
                <input
                  className={`${inputCls} !py-2`}
                  value={s.name}
                  maxLength={16}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder={`Тоглогч ${i + 1}`}
                />
                <Button
                  size="sm"
                  variant={s.bot ? 'neon' : 'ghost'}
                  onClick={() => {
                    if (!s.bot && humans <= 1) return;
                    update(i, { bot: !s.bot, name: !s.bot ? BOT_NAMES[i] : `Тоглогч ${i + 1}` });
                  }}
                  title="Хүн / компьютер"
                >
                  {s.bot ? '🤖' : '🙂'}
                </Button>
                {seats.length > 2 && (
                  <Button size="sm" variant="ghost" onClick={() => setSeats((x) => x.filter((_, j) => j !== i))} title="Хасах">
                    ✕
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={seats.length >= 5}
              onClick={() =>
                setSeats((x) => [...x, { name: `Тоглогч ${x.length + 1}`, avatar: (x[x.length - 1].avatar + 1) % AVATAR_COUNT, bot: false }])
              }
            >
              ＋ Тоглогч нэмэх
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={seats.length >= 5}
              onClick={() => setSeats((x) => [...x, { name: BOT_NAMES[x.length], avatar: (x[x.length - 1].avatar + 1) % AVATAR_COUNT, bot: true }])}
            >
              ＋ Компьютер нэмэх
            </Button>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-lg font-black">🧮 Бодлогын тохиргоо</h2>
          <SettingsForm value={prefs.settings} onChange={setGameSettings} />
        </Panel>
        <Button size="lg" onClick={start} disabled={seats.length < 2}>
          🚀 Эхлүүлэх ({seats.length} тоглогч)
        </Button>
      </div>
    </Screen>
  );
}
