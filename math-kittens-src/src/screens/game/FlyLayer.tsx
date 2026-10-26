// Cards flying between the deck, the discard pile, the hand and the players.

import { motion } from 'framer-motion';
import type { CardType } from '../../../shared/cards';
import { CardBackFace, CardFace } from '../../components/GameCard';

export interface Flight {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: CardType | null;
  /** Scale at the end of the flight. */
  endScale?: number;
  duration?: number;
  toDiscard?: boolean;
}

let nextId = 1;

export function makeFlight(fromAnchor: string, toAnchor: string, type: CardType | null, extra: Partial<Flight> = {}): Flight {
  return { id: nextId++, from: center(fromAnchor), to: center(toAnchor), type, ...extra };
}

function center(name: string) {
  const el = document.querySelector(`[data-anchor="${name}"]`);
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function FlyLayer({ flights, onDone }: { flights: Flight[]; onDone: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[52]">
      {flights.map((f) => (
        <motion.div
          key={f.id}
          className="absolute left-0 top-0 w-[var(--card-w)]"
          style={{ translateX: '-50%', translateY: '-50%' }}
          initial={{ x: f.from.x, y: f.from.y, scale: 0.55, rotate: -12, opacity: 0.2 }}
          animate={{ x: f.to.x, y: f.to.y, scale: f.endScale ?? 1, rotate: 0, opacity: 1 }}
          transition={{ duration: f.duration ?? 0.48, ease: [0.2, 0.8, 0.25, 1] }}
          onAnimationComplete={() => onDone(f.id)}
        >
          {f.type ? <CardFace type={f.type} showText={false} glow={f.type === 'explode'} /> : <CardBackFace />}
        </motion.div>
      ))}
    </div>
  );
}
