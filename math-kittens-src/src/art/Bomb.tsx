import type { ReactNode } from 'react';
import { INK, ORANGE, SW, Tube, WHITE, YELLOW, useUid } from './core';

/** Closed star polygon path with `n` points; `jitter` varies the outer radii. */
export function starPath(cx: number, cy: number, r1: number, r2: number, n: number, rot = 0, jitter: number[] = []): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const outer = i % 2 === 0;
    const r = outer ? r1 * (1 + (jitter[(i / 2) % (jitter.length || 1)] ?? 0)) : r2;
    const a = ((i * Math.PI) / n) + (rot * Math.PI) / 180 - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }
  return d + 'Z';
}

/** Fuse spark: orange star, yellow star, white core. */
export function Spark({ x, y, r = 12 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <path d={starPath(x, y, r, r * 0.45, 8, 10)} fill={ORANGE} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d={starPath(x, y, r * 0.62, r * 0.3, 8, 32)} fill={YELLOW} />
      <circle cx={x} cy={y} r={r * 0.2} fill={WHITE} />
    </g>
  );
}

/**
 * Round cartoon bomb of radius 30 centred on the origin; position it with
 * `transform`. The fuse leaves the cap at the upper right.
 */
export function Bomb({
  transform,
  fuse = 'M26 -26C34 -34 30 -44 40 -49',
  spark = [42, -51],
  sparkR = 12,
  children,
}: {
  transform?: string;
  fuse?: string;
  spark?: [number, number] | null;
  sparkR?: number;
  children?: ReactNode;
}) {
  const id = useUid();
  return (
    <g transform={transform}>
      <defs>
        <radialGradient id={id} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#7a72b4" />
          <stop offset="0.45" stopColor="#30275c" />
          <stop offset="1" stopColor="#120a28" />
        </radialGradient>
      </defs>
      <Tube d={fuse} w={4} color="#e2bf86" outline={2.5} />
      <g transform="rotate(45 20 -20)">
        <rect x={10} y={-27} width={20} height={12} rx={3} fill="#8d86b3" stroke={INK} strokeWidth={SW} />
      </g>
      <circle r={30} fill={`url(#${id})`} stroke={INK} strokeWidth={SW} />
      <path d="M23.4 11.3A26 26 0 0 1 -4.5 25.6" fill="none" stroke="#a294ec" strokeWidth={3.2} strokeLinecap="round" opacity={0.9} />
      <ellipse cx={-11} cy={-14} rx={9} ry={5} fill={WHITE} opacity={0.6} transform="rotate(-38 -11 -14)" />
      <circle cx={-19.5} cy={-3} r={2.4} fill={WHITE} opacity={0.5} />
      {children}
      {spark && <Spark x={spark[0]} y={spark[1]} r={sparkR} />}
    </g>
  );
}

/** Small bomb icon, viewBox 0 0 64 64. */
export function BombIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <Bomb transform="translate(27 39) scale(0.72)" fuse="M26 -26C31 -31 30 -37 35 -42" spark={[37, -43]} sparkR={12} />
    </svg>
  );
}

const J1 = [0.06, -0.08, 0.1, -0.04, 0.02, -0.1, 0.08, -0.02, 0.12, -0.06, 0.04, -0.09, 0.07, -0.03];
const J2 = [-0.05, 0.08, -0.02, 0.1, -0.08, 0.04, 0.06, -0.06, 0.02, 0.09, -0.04, 0.05];

/** Comic "boom" starburst, viewBox 0 0 200 200, no text. */
export function ExplosionBurst({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g strokeLinejoin="round">
        <path d={starPath(100, 100, 88, 60, 14, 4, J1)} fill="#ff3d5a" stroke={INK} strokeWidth={4.5} />
        <path d={starPath(100, 100, 68, 46, 12, 18, J2)} fill={ORANGE} stroke={INK} strokeWidth={3.5} />
        <path d={starPath(100, 100, 46, 31, 10, 6, J1)} fill={YELLOW} stroke={INK} strokeWidth={3} />
        <circle cx={100} cy={100} r={20} fill="#fff6c9" />
        <ellipse cx={90} cy={90} rx={9} ry={5.5} fill={WHITE} transform="rotate(-35 90 90)" />
      </g>
      <g fill={YELLOW} stroke={INK} strokeWidth={2.5}>
        <circle cx={22} cy={36} r={6} />
        <circle cx={178} cy={164} r={7} />
        <circle cx={170} cy={30} r={4.5} />
        <circle cx={30} cy={168} r={4} />
      </g>
    </svg>
  );
}
