import type { ReactNode } from 'react';
import { CatHead, type BrowKind, type EyeKind, type MouthKind, type Pattern } from './CatHead';
import { INK, SW, Sparkle, WHITE, YELLOW, heartPath, useUid } from './core';
import { FUR, type Fur } from './fur';

export type AvatarMood = 'idle' | 'happy' | 'sad' | 'shocked' | 'ko';

export const AVATAR_COUNT = 8;

/** Signature UI accent color per avatar index. */
export const AVATAR_COLORS: string[] = ['#ff9f1c', '#60a5fa', '#a3e635', '#f472b6', '#facc15', '#22d3ee', '#a78bfa', '#34d399'];

interface AvatarLook {
  fur: Fur;
  pattern: Pattern;
  /** Chest patch color (defaults to fur.light). */
  chest?: string | null;
  /** Head-space extras drawn over the face (bow, glasses...). */
  head?: ReactNode;
  /** Avatar-space extras drawn at the neck (collar, bow tie...). */
  neck?: ReactNode;
  tuft?: 'none' | 'small';
}

const Collar = ({ color, tag }: { color: string; tag: string }) => (
  <g>
    <path d="M27 79Q50 90 73 79" fill="none" stroke={INK} strokeWidth={8.5} strokeLinecap="round" />
    <path d="M27 79Q50 90 73 79" fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round" />
    <circle cx={50} cy={88} r={4.6} fill={tag} stroke={INK} strokeWidth={2} />
    <path d="M47.5 89.5H52.5" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
  </g>
);

const LOOKS: AvatarLook[] = [
  // 0 orange tabby, blue collar with a bell
  { fur: FUR.ginger, pattern: 'tabby', neck: <Collar color="#3b82f6" tag={YELLOW} /> },
  // 1 gray, red polka-dot bandana
  {
    fur: FUR.gray,
    pattern: 'none',
    neck: (
      <g>
        <path d="M28 78Q50 86 72 78L50 100Z" fill="#ef4444" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
        <g fill={WHITE}>
          <circle cx={42} cy={84} r={1.8} />
          <circle cx={56} cy={85} r={1.8} />
          <circle cx={50} cy={92} r={1.8} />
        </g>
      </g>
    ),
  },
  // 2 black, cyan collar with a heart tag
  {
    fur: FUR.black,
    pattern: 'none',
    tuft: 'small',
    neck: (
      <g>
        <path d="M27 79Q50 90 73 79" fill="none" stroke={INK} strokeWidth={8.5} strokeLinecap="round" />
        <path d="M27 79Q50 90 73 79" fill="none" stroke="#22e5ff" strokeWidth={4.5} strokeLinecap="round" />
        <path d={heartPath(50, 89, 5)} fill="#ff4d6d" stroke={INK} strokeWidth={1.8} />
      </g>
    ),
  },
  // 3 white with a tiny pink bow
  {
    fur: FUR.white,
    pattern: 'none',
    chest: null,
    head: (
      <g transform="translate(-34 -44) rotate(-18)">
        <path d="M0 0L-15 -9L-15 9ZM0 0L15 -9L15 9Z" fill="#ff5fa2" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <circle r={4.5} fill="#ff5fa2" stroke={INK} strokeWidth={2.6} />
      </g>
    ),
  },
  // 4 calico with a little flower
  {
    fur: FUR.calico,
    pattern: 'calico',
    chest: null,
    head: (
      <g transform="translate(36 -46)">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx={0} cy={-7} rx={4.6} ry={6.5} fill={WHITE} stroke={INK} strokeWidth={2} transform={`rotate(${a})`} />
        ))}
        <circle r={4.5} fill={YELLOW} stroke={INK} strokeWidth={2} />
      </g>
    ),
  },
  // 5 siamese, teal scarf
  {
    fur: FUR.siamese,
    pattern: 'siamese',
    neck: (
      <g>
        <path d="M26 80Q50 92 74 80" fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round" />
        <path d="M26 80Q50 92 74 80" fill="none" stroke="#14b8a6" strokeWidth={8} strokeLinecap="round" />
        <path d="M60 84L66 100L56 100Z" fill="#14b8a6" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      </g>
    ),
  },
  // 6 tuxedo with glasses and a bow tie
  {
    fur: FUR.tuxedo,
    pattern: 'tuxedo',
    head: (
      <g>
        <g fill={WHITE} fillOpacity={0.18} stroke="#f2ecff" strokeWidth={3.4}>
          <circle cx={-21} cy={3} r={15} />
          <circle cx={21} cy={3} r={15} />
        </g>
        <path d="M-6 1Q0 -3 6 1" fill="none" stroke="#f2ecff" strokeWidth={3} strokeLinecap="round" />
      </g>
    ),
    neck: (
      <g>
        <path d="M50 84L38 77L38 91ZM50 84L62 77L62 91Z" fill="#ef4444" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        <circle cx={50} cy={84} r={3.6} fill="#ef4444" stroke={INK} strokeWidth={2} />
      </g>
    ),
  },
  // 7 cream/ginger with freckles and a star clip
  {
    fur: FUR.peach,
    pattern: 'none',
    tuft: 'small',
    head: (
      <g>
        <g fill="#e08a4f">
          <circle cx={-31} cy={12} r={1.6} />
          <circle cx={-36} cy={9} r={1.6} />
          <circle cx={-35} cy={15} r={1.6} />
          <circle cx={31} cy={12} r={1.6} />
          <circle cx={36} cy={9} r={1.6} />
          <circle cx={35} cy={15} r={1.6} />
        </g>
        <path
          d="M34 -50L37.5 -42.5L45.5 -41.5L39.5 -36L41 -28L34 -32L27 -28L28.5 -36L22.5 -41.5L30.5 -42.5Z"
          fill="#a78bfa"
          stroke={INK}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
      </g>
    ),
  },
];

const MOODS: Record<
  AvatarMood,
  { eyes: EyeKind; mouth: MouthKind; brows: BrowKind; look?: [number, number]; droop?: number; tilt?: number }
> = {
  idle: { eyes: 'open', mouth: 'w', brows: 'none' },
  happy: { eyes: 'happy', mouth: 'smile', brows: 'raised', tilt: -6 },
  sad: { eyes: 'sad', mouth: 'frown', brows: 'worried', look: [0, 2], droop: 24 },
  shocked: { eyes: 'wide', mouth: 'O', brows: 'surprised', droop: -6 },
  ko: { eyes: 'x', mouth: 'blep', brows: 'none', droop: 30, tilt: 10 },
};

/** Round player avatar, viewBox 0 0 100 100. */
export function CatAvatar({
  index,
  mood = 'idle',
  className,
}: {
  index: number;
  mood?: AvatarMood;
  className?: string;
}) {
  const id = useUid();
  const i = ((Math.floor(index) % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  const look = LOOKS[i];
  const color = AVATAR_COLORS[i];
  const m = MOODS[mood] ?? MOODS.idle;
  const f = look.fur;
  const chest = look.chest === null ? null : (look.chest ?? f.light);
  const tuxBib = look.pattern === 'tuxedo';
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}bg`} cx="0.5" cy="0.32" r="0.75">
          <stop offset="0" stopColor={WHITE} stopOpacity={0.55} />
          <stop offset="0.6" stopColor={WHITE} stopOpacity={0} />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <circle cx={50} cy={50} r={46} />
        </clipPath>
      </defs>
      <circle cx={50} cy={50} r={46} fill={color} />
      <circle cx={50} cy={50} r={46} fill={`url(#${id}bg)`} />
      <g clipPath={`url(#${id}c)`}>
        <path d="M14 106C14 84 30 74 50 74C70 74 86 84 86 106Z" fill={f.base} stroke={INK} strokeWidth={SW} />
        {tuxBib && <path d="M40 76L60 76L56 100L44 100Z" fill={f.light} />}
        {chest && !tuxBib && <ellipse cx={50} cy={94} rx={13} ry={13} fill={chest} />}
        {mood === 'sad' && <circle cx={50} cy={50} r={46} fill="#1b1035" opacity={0.12} />}
        {look.neck}
      </g>
      <CatHead
        fur={f}
        pattern={look.pattern}
        eyes={m.eyes}
        mouth={m.mouth}
        brows={m.brows}
        look={m.look}
        earDroop={m.droop}
        tears={mood === 'sad'}
        sweat={mood === 'shocked'}
        tuft={mood === 'shocked' ? 'spiky' : (look.tuft ?? 'none')}
        transform={`translate(50 ${mood === 'ko' ? 55 : 53}) rotate(${m.tilt ?? 0}) scale(0.58)`}
      >
        {look.head}
      </CatHead>
      {mood === 'ko' && (
        <g>
          <ellipse cx={50} cy={16} rx={20} ry={5.5} fill="none" stroke={YELLOW} strokeWidth={2} strokeDasharray="4 3" />
          <Sparkle x={31} y={17} r={5.5} color={YELLOW} outline />
          <Sparkle x={58} y={11} r={5} color={WHITE} outline />
          <Sparkle x={68} y={20} r={4.5} color={YELLOW} outline />
        </g>
      )}
      {mood === 'happy' && (
        <g>
          <Sparkle x={16} y={22} r={6} color={WHITE} />
          <Sparkle x={86} y={28} r={4.5} color={WHITE} />
        </g>
      )}
      {mood === 'shocked' && (
        <g stroke={INK} strokeWidth={2.4} strokeLinecap="round">
          <path d="M12 30L18 34M10 42H17M88 30L82 34M90 42H83" />
        </g>
      )}
      <circle cx={50} cy={50} r={46} fill="none" stroke={INK} strokeWidth={3.5} />
      <path d="M18 30A36 36 0 0 1 40 12" fill="none" stroke={WHITE} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
    </svg>
  );
}
