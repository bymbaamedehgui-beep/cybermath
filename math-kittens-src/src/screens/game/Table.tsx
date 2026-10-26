import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CARD_INFO, type Card } from '../../../shared/cards';
import type { GameView, PlayerView } from '../../../shared/game/types';
import { BombIcon, CatAvatar } from '../../art';
import { CardFace } from '../../components/GameCard';
import { MiniDeck } from './Prompts';

export function PlayerBadge({
  p,
  current,
  pending,
  turns,
  stacked,
}: {
  p: PlayerView;
  current: boolean;
  pending: boolean;
  turns: number;
  /** Narrow screens: avatar above the name so several opponents fit in one row. */
  stacked?: boolean;
}) {
  const mood = !p.alive ? 'ko' : pending && !current ? 'shocked' : current ? 'happy' : 'idle';
  const acc = p.stats.answered ? Math.round((p.stats.correct / p.stats.answered) * 100) : null;
  return (
    <motion.div
      layout
      data-anchor={`p-${p.id}`}
      className={`relative flex min-w-0 rounded-2xl transition ${
        stacked ? 'flex-col items-center gap-0.5 px-1 py-1.5' : 'shrink-0 items-center gap-2 px-2 py-1.5'
      } ${
        current && p.alive
          ? 'bg-cyan-400/15 ring-2 ring-cyan-300 shadow-[0_0_22px_rgba(34,229,255,0.45)]'
          : pending
            ? 'bg-orange-400/15 ring-2 ring-orange-300/80'
            : 'bg-white/6 ring-1 ring-white/10'
      } ${!p.alive ? 'opacity-55 grayscale' : ''}`}
    >
      <div className={`relative ${stacked ? 'h-10 w-10' : 'h-11 w-11 sm:h-12 sm:w-12'} shrink-0`}>
        <CatAvatar index={p.avatar} mood={mood} className="h-full w-full" />
        {p.isBot && <span className="absolute -bottom-1 -right-1 rounded-full bg-[#1b1035] px-1 text-[10px]">🤖</span>}
        {!p.connected && !p.isBot && <span className="absolute -left-1 -top-1 rounded-full bg-[#1b1035] px-1 text-[10px]">📴</span>}
      </div>
      <div className={`min-w-0 ${stacked ? 'w-full text-center' : ''}`}>
        <div className={`truncate font-black leading-tight ${stacked ? 'text-xs' : 'max-w-[7.5rem] text-sm'}`}>{p.name}</div>
        <div className={`flex items-center gap-2 font-bold text-violet-100/80 ${stacked ? 'justify-center text-[10px]' : 'text-xs'}`}>
          {p.alive ? <span>🃏 {p.handCount}</span> : <span>💀 {p.place}-р</span>}
          <span>⭐ {p.stats.score}</span>
          {!stacked && acc !== null && <span className="hidden sm:inline">🎯 {acc}%</span>}
        </div>
      </div>
      {current && p.alive && turns > 1 && (
        <span className="absolute -right-2 -top-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-black shadow">×{turns}</span>
      )}
    </motion.div>
  );
}

export function TableCenter({
  view,
  pendingDiscard,
  shuffleKey,
  canDraw,
  onDraw,
  status,
  sub,
}: {
  view: GameView;
  pendingDiscard: number;
  shuffleKey: number;
  canDraw: boolean;
  onDraw: () => void;
  status: string;
  sub?: string;
}) {
  const top = view.discardTop.slice(0, Math.max(0, view.discardTop.length - pendingDiscard));
  const shown = top.slice(-3);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 sm:gap-3">
      <div className="flex items-center gap-[min(6vw,40px)]">
        <motion.button
          type="button"
          data-anchor="deck"
          key={`deck-${shuffleKey}`}
          animate={shuffleKey ? { rotate: [0, -8, 8, -6, 6, 0], x: [0, -6, 6, -4, 4, 0] } : {}}
          transition={{ duration: 0.6 }}
          disabled={!canDraw}
          onClick={onDraw}
          className={`relative w-[calc(var(--card-w)*1.08)] ${canDraw ? 'cursor-pointer' : 'cursor-default'}`}
          aria-label="Тавцан"
        >
          <MiniDeck count={view.deckCount} />
          {canDraw && (
            <span className="pulse-ring pointer-events-none absolute inset-0 rounded-[9%/6.4%]" />
          )}
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1b1035] px-2.5 py-0.5 text-xs font-black ring-1 ring-cyan-300/50">
            {view.deckCount} карт
          </span>
          <span className="absolute -right-3 -top-3 flex items-center gap-0.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-xs font-black shadow ring-2 ring-[#1b1035]">
            <BombIcon className="h-4 w-4" />×{view.explodesInDeck}
          </span>
        </motion.button>

        <div className="flex flex-col items-center gap-1">
          <DirectionIcon dir={view.direction} />
        </div>

        <div data-anchor="discard" className="relative w-[calc(var(--card-w)*1.08)]">
          <div className="aspect-[5/7] rounded-[9%/6.4%] border-2 border-dashed border-violet-300/25" />
          <AnimatePresence>
            {shown.map((c, i) => (
              <motion.div
                key={c.id}
                className="absolute inset-0"
                initial={{ scale: 1.15, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, rotate: (i - shown.length + 1) * 7 + (hash(c.id) % 7) - 3 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <CardFace type={c.type} showText={false} />
              </motion.div>
            ))}
          </AnimatePresence>
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1b1035] px-2.5 py-0.5 text-xs font-black ring-1 ring-violet-300/40">
            Хаягдал {view.discardCount}
          </span>
        </div>
      </div>
      <div data-anchor="center" className="mt-3 max-w-[92vw] px-2 text-center">
        <div className="text-base font-black text-white sm:text-lg">{status}</div>
        {sub && <div className="text-xs font-bold text-violet-200/75 sm:text-sm">{sub}</div>}
      </div>
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function DirectionIcon({ dir }: { dir: 1 | -1 }) {
  return (
    <motion.div
      key={dir}
      initial={{ rotate: 180, scale: 0.6 }}
      animate={{ rotate: 0, scale: 1 }}
      className="relative h-12 w-12 sm:h-14 sm:w-14"
      title={dir === 1 ? 'Цагийн зүүний дагуу' : 'Цагийн зүүний эсрэг'}
    >
      <svg viewBox="0 0 48 48" className={`h-full w-full ${dir === 1 ? 'spin-slow' : 'spin-slow-rev'}`}>
        <defs>
          <linearGradient id="dir-g" x1="0" x2="1">
            <stop offset="0" stopColor="#22e5ff" />
            <stop offset="1" stopColor="#ff9f1c" />
          </linearGradient>
        </defs>
        <path
          d={dir === 1 ? 'M24 6 A18 18 0 1 1 6.5 28' : 'M24 6 A18 18 0 1 0 41.5 28'}
          fill="none"
          stroke="url(#dir-g)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path d={dir === 1 ? 'M24 0 L32 6 L24 12 Z' : 'M24 0 L16 6 L24 12 Z'} fill="#22e5ff" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-violet-100">{dir === 1 ? '↻' : '↺'}</span>
    </motion.div>
  );
}

export function Hand({
  cards,
  selectedId,
  onSelect,
  onPlay,
  active,
}: {
  cards: Card[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPlay: (id: string) => void;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [cardW, setCardW] = useState(90);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setCardW(probe.current?.offsetWidth || 90);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = cards.length;
  const gap = 8;
  const step = n <= 1 ? cardW : Math.min(cardW + gap, (width - cardW - 16) / (n - 1));
  const total = n === 0 ? 0 : cardW + step * (n - 1);
  const offset = Math.max(0, (width - total) / 2);

  useEffect(() => {
    if (selectedId && !cards.some((c) => c.id === selectedId)) onSelect(null);
  }, [cards, selectedId, onSelect]);

  return (
    <div ref={ref} data-anchor="hand" className="relative h-[calc(var(--card-h)+22px)] w-full">
      <div ref={probe} className="pointer-events-none invisible absolute w-[var(--card-w)]" />
      {n === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-violet-200/60">Гарт карт алга</div>
      )}
      <AnimatePresence initial={false}>
        {cards.map((c, i) => {
          const sel = c.id === selectedId;
          const x = offset + i * step;
          const playable = CARD_INFO[c.type].playable;
          return (
            <motion.button
              key={c.id}
              type="button"
              className="absolute bottom-1 w-[var(--card-w)] origin-bottom"
              style={{ zIndex: sel ? 50 : i }}
              initial={{ y: -260, x, opacity: 0, scale: 0.6, rotate: -15 }}
              animate={{ y: sel ? -22 : 0, x, opacity: 1, scale: sel ? 1.08 : 1, rotate: 0 }}
              exit={{ y: -160, opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              whileHover={!sel ? { y: -10 } : undefined}
              onClick={() => onSelect(sel ? null : c.id)}
              onDoubleClick={() => active && playable && onPlay(c.id)}
              aria-label={CARD_INFO[c.type].name}
            >
              <CardFace type={c.type} glow={sel} className={!playable ? 'saturate-[0.85]' : ''} />
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
