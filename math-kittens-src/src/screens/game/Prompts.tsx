import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { CARD_INFO, type Card, type CardType } from '../../../shared/cards';
import type { DoubleChoice, GameView, PlayerView } from '../../../shared/game/types';
import { CatAvatar, BombIcon } from '../../art';
import { CardBackFace, CardFace } from '../../components/GameCard';
import { useNow } from '../../game/useNow';
import { Button, Modal } from '../../ui/ui';

function Countdown({ deadline, getNow, label }: { deadline: number; getNow: () => number; label: string }) {
  const now = useNow(getNow, true, 200);
  const [start] = useState(() => getNow());
  const total = Math.max(1, deadline - start);
  const left = Math.max(0, deadline - now);
  return (
    <div className="mt-4">
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-400 to-cyan-300 transition-[width] duration-200"
          style={{ width: `${(left / total) * 100}%` }}
        />
      </div>
      <div className="mt-1 text-center text-xs font-bold text-violet-200/70">
        {label}: {Math.ceil(left / 1000)} с
      </div>
    </div>
  );
}

export function InsertModal({
  open,
  deckCount,
  deadline,
  getNow,
  onConfirm,
}: {
  open: boolean;
  deckCount: number;
  deadline: number;
  getNow: () => number;
  onConfirm: (position: number) => void;
}) {
  const [pos, setPos] = useState(0);
  const [sent, setSent] = useState(false);
  const shown = Math.min(deckCount, 24);
  const label =
    pos === 0 ? 'Хамгийн дээр (дараагийн тоглогч сугална!)' : pos >= deckCount ? 'Хамгийн доор' : `Дээрээс ${pos + 1}-р байр`;
  const confirm = (p: number) => {
    if (sent) return;
    setSent(true);
    onConfirm(p);
  };
  // Visual position of the bomb among the drawn mini cards.
  const markerAt = deckCount === 0 ? 0 : Math.round((pos / deckCount) * shown);
  return (
    <Modal open={open} z="z-[58]">
      <div className="text-center">
        <div className="mx-auto mb-2 w-16">
          <BombIcon className="h-16 w-16 wiggle" />
        </div>
        <h2 className="text-2xl font-black text-orange-200">Амьд үлдлээ! 🎉</h2>
        <p className="mt-1 text-sm font-bold text-violet-100/85">
          Тэсрэх муурыг тавцанд нууцаар буцаа. Байрлалыг зөвхөн та мэднэ.
        </p>
      </div>
      <div className="mt-4 rounded-2xl bg-black/25 p-3">
        <div className="flex items-end justify-center gap-[2px] overflow-hidden py-2">
          {Array.from({ length: shown + 1 }, (_, i) =>
            i === markerAt ? (
              <motion.div key="bomb" layout className="h-12 w-7 shrink-0">
                <BombIcon className="h-full w-full" />
              </motion.div>
            ) : (
              <motion.div
                key={`c${i < markerAt ? i : i - 1}`}
                layout
                className="h-10 w-[11px] shrink-0 rounded-sm bg-gradient-to-b from-violet-400 to-indigo-700 ring-1 ring-cyan-300/40"
              />
            ),
          )}
        </div>
        <div className="mt-1 flex justify-between text-[11px] font-bold text-violet-200/60">
          <span>Дээд тал</span>
          <span>Доод тал</span>
        </div>
        <input
          type="range"
          min={0}
          max={deckCount}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="mt-3 w-full accent-orange-400"
          aria-label="Байрлал"
        />
        <div className="mt-2 text-center text-base font-black text-cyan-200">{label}</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="ghost" size="sm" onClick={() => setPos(0)}>
          ⬆ Дээр
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPos(Math.floor(Math.random() * (deckCount + 1)))}>
          🎲 Санамсаргүй
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPos(deckCount)}>
          ⬇ Доор
        </Button>
      </div>
      <Button className="mt-3 w-full" size="lg" onClick={() => confirm(pos)} disabled={sent}>
        🤫 Энд нуух
      </Button>
      <Countdown deadline={deadline} getNow={getNow} label="Санамсаргүй байранд нуух хүртэл" />
    </Modal>
  );
}

export function RescueModal({
  open,
  deadline,
  getNow,
  onUse,
}: {
  open: boolean;
  deadline: number;
  getNow: () => number;
  onUse: () => void;
}) {
  const [sent, setSent] = useState(false);
  return (
    <Modal open={open} z="z-[58]">
      <div className="text-center">
        <h2 className="text-2xl font-black text-rose-300">Өө, амжсангүй…</h2>
        <p className="mt-1 font-bold text-violet-100/90">Гэхдээ танд Аврагч Муур байна! Тэр чамайг тэсрэлтээс аварна.</p>
        <motion.div
          className="mx-auto my-4 w-40"
          initial={{ rotate: -8, scale: 0.8 }}
          animate={{ rotate: [-4, 4, -4], scale: 1 }}
          transition={{ rotate: { repeat: Infinity, duration: 1.6 }, scale: { duration: 0.3 } }}
        >
          <CardFace type="rescue" glow />
        </motion.div>
        <Button
          variant="mint"
          size="lg"
          className="w-full"
          disabled={sent}
          onClick={() => {
            setSent(true);
            onUse();
          }}
        >
          🛡️ Аврагч Муур ашиглах
        </Button>
        <Countdown deadline={deadline} getNow={getNow} label="Автоматаар ашиглах хүртэл" />
      </div>
    </Modal>
  );
}

export function TargetPicker({
  open,
  view,
  cardType,
  onPick,
  onCancel,
}: {
  open: boolean;
  view: GameView;
  cardType: CardType | null;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const needCards = cardType === 'steal';
  const others = view.players.filter((p) => p.alive && p.id !== view.you);
  return (
    <Modal open={open} onClose={onCancel} z="z-[57]">
      <h2 className="text-center text-xl font-black">
        {cardType === 'steal' ? '🦝 Хэнээс карт хулгайлах вэ?' : '🎯 Хэнд сорилт илгээх вэ?'}
      </h2>
      <p className="mt-1 text-center text-sm font-semibold text-violet-200/80">{cardType ? CARD_INFO[cardType].desc : ''}</p>
      <div className="mt-4 grid gap-2">
        {others.map((p) => (
          <TargetRow key={p.id} p={p} disabled={needCards && p.handCount === 0} onClick={() => onPick(p.id)} />
        ))}
      </div>
      <Button variant="ghost" className="mt-4 w-full" onClick={onCancel}>
        Болих
      </Button>
    </Modal>
  );
}

function TargetRow({ p, disabled, onClick }: { p: PlayerView; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-white/8 p-2.5 text-left ring-1 ring-white/10 transition hover:bg-cyan-400/15 hover:ring-cyan-300/50 disabled:opacity-40"
    >
      <CatAvatar index={p.avatar} mood="idle" className="h-12 w-12 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-black">{p.name}</span>
        <span className="text-sm font-bold text-violet-200/75">
          🃏 {p.handCount} карт{disabled ? ' — карт алга' : ''}
        </span>
      </span>
      <span className="text-2xl">›</span>
    </button>
  );
}

export function DoubleModal({
  open,
  view,
  deadline,
  getNow,
  onChoose,
}: {
  open: boolean;
  view: GameView;
  deadline: number;
  getNow: () => number;
  onChoose: (choice: DoubleChoice, targetId?: string) => void;
}) {
  const [stealing, setStealing] = useState(false);
  const [sent, setSent] = useState(false);
  const others = view.players.filter((p) => p.alive && p.id !== view.you);
  const canSteal = others.some((p) => p.handCount > 0);
  const choose = (c: DoubleChoice, t?: string) => {
    if (sent) return;
    setSent(true);
    onChoose(c, t);
  };
  const options: { c: DoubleChoice; icon: CardType; title: string; text: string; disabled?: boolean }[] = [
    { c: 'future', icon: 'future', title: 'Ирээдүйг харах', text: 'Дээд 3 картыг нууцаар хар' },
    { c: 'steal', icon: 'steal', title: 'Карт хулгайлах', text: 'Сонгосон тоглогчоос карт ав', disabled: !canSteal },
    { c: 'skip', icon: 'skip', title: 'Ээлжээ алгасах', text: 'Сугалахгүйгээр ээлжээ дуусга' },
  ];
  return (
    <Modal open={open} z="z-[58]">
      <h2 className="text-center text-2xl font-black text-fuchsia-300">⚡ Давхар хүч!</h2>
      <p className="mt-1 text-center text-sm font-bold text-violet-100/85">Нэмэлт үйлдлээ сонго</p>
      {!stealing ? (
        <div className="mt-4 grid gap-2">
          {options.map((o) => (
            <button
              key={o.c}
              type="button"
              disabled={o.disabled || sent}
              onClick={() => (o.c === 'steal' ? setStealing(true) : choose(o.c))}
              className="flex items-center gap-3 rounded-2xl bg-white/8 p-2.5 text-left ring-1 ring-white/10 transition hover:bg-fuchsia-400/15 hover:ring-fuchsia-300/50 disabled:opacity-40"
            >
              <div className="w-12 shrink-0">
                <CardFace type={o.icon} showText={false} />
              </div>
              <span>
                <span className="block text-lg font-black">{o.title}</span>
                <span className="text-sm font-semibold text-violet-200/80">{o.text}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {others.map((p) => (
            <TargetRow key={p.id} p={p} disabled={p.handCount === 0 || sent} onClick={() => choose('steal', p.id)} />
          ))}
          <Button variant="ghost" onClick={() => setStealing(false)}>
            ← Буцах
          </Button>
        </div>
      )}
      <Countdown deadline={deadline} getNow={getNow} label="Автоматаар сонгох хүртэл" />
    </Modal>
  );
}

export function FutureModal({ cards, onClose }: { cards: Card[] | null; onClose: () => void }) {
  return (
    <Modal open={!!cards} onClose={onClose} z="z-[58]" className="max-w-xl">
      <h2 className="text-center text-2xl font-black text-cyan-200">🔮 Ирээдүй</h2>
      <p className="mt-1 text-center text-sm font-bold text-violet-100/80">Тавцангийн дээд картууд (зүүнээс дараалан сугална)</p>
      <div className="mt-4 flex justify-center gap-2 sm:gap-4">
        {(cards ?? []).length === 0 && <div className="py-6 font-bold">Тавцан хоосон байна</div>}
        {(cards ?? []).map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ rotateY: 180, opacity: 0, y: 20 }}
            animate={{ rotateY: 0, opacity: 1, y: 0 }}
            transition={{ delay: 0.15 * i, type: 'spring', stiffness: 200, damping: 18 }}
            className="w-[28vw] max-w-36"
          >
            <div className="mb-1 text-center text-xs font-black text-violet-200">{i === 0 ? '1 — дараагийнх' : `${i + 1}`}</div>
            <CardFace type={c.type} glow={c.type === 'explode'} />
          </motion.div>
        ))}
      </div>
      <Button variant="neon" className="mt-5 w-full" onClick={onClose}>
        Ойлголоо
      </Button>
    </Modal>
  );
}

export function PassScreen({ player, onReady }: { player: PlayerView | undefined; onReady: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-[#0b0620] p-6 text-center">
      <CatAvatar index={player?.avatar ?? 0} mood="happy" className="h-32 w-32 float-y" />
      <div className="text-sm font-bold text-violet-200/80">Төхөөрөмжийг дараагийн тоглогчид өгнө үү</div>
      <div className="text-3xl font-black text-cyan-200">{player?.name}</div>
      <div className="max-w-sm text-sm font-semibold text-violet-100/70">Бусад тоглогчид дэлгэц рүү харахгүй байгаарай 🙈</div>
      <Button size="lg" onClick={onReady}>
        Би бэлэн — картаа харах
      </Button>
    </div>
  );
}

export function MiniDeck({ count }: { count: number }) {
  const layers = useMemo(() => Math.min(4, Math.ceil(count / 6)), [count]);
  return (
    <div className="relative w-full">
      {Array.from({ length: layers }, (_, i) => (
        <div key={i} className="absolute inset-0" style={{ transform: `translate(${-i * 2}px, ${-i * 2}px)` }}>
          <CardBackFace />
        </div>
      ))}
      <div style={{ transform: `translate(${-layers * 2}px, ${-layers * 2}px)` }} className="relative">
        {count > 0 ? <CardBackFace /> : <div className="aspect-[5/7] rounded-[9%/6.4%] border-2 border-dashed border-violet-300/30" />}
      </div>
    </div>
  );
}
