import type { ReactNode } from 'react';
import { BLUSH, INK, MOUTH, NOSE, SW, TONGUE, WHITE, useUid } from './core';
import type { Fur } from './fur';

export type EyeKind = 'open' | 'wide' | 'happy' | 'closed' | 'x' | 'angry' | 'half' | 'sad';
export type MouthKind =
  | 'w'
  | 'smile'
  | 'grin'
  | 'o'
  | 'O'
  | 'frown'
  | 'smirk'
  | 'wavy'
  | 'blep'
  | 'grit'
  | 'none';
export type BrowKind = 'none' | 'raised' | 'angry' | 'worried' | 'surprised';
export type Pattern = 'none' | 'tabby' | 'tuxedo' | 'siamese' | 'calico';

/**
 * Head geometry, local coordinates: about 116 wide (cheek tufts at x=+-58),
 * crown at y=-40, chin at y=42, ear tips at y=-64.
 */
export const HEAD_D =
  'M0 -40C29 -40 47 -29 50 -8C56 -6 60 0 59 7C57 9 55 11 54 13C51 32 30 42 0 42C-30 42 -51 32 -54 13C-55 11 -57 9 -59 7C-60 0 -56 -6 -50 -8C-47 -29 -29 -40 0 -40Z';
export const EAR_D = 'M-50 -8C-55 -30 -54 -51 -46 -63C-37 -62 -24 -52 -12 -37Z';
const EAR_IN = 'M-43 -19C-46 -32 -46 -45 -42 -53C-36 -50 -28 -44 -22 -37Z';
const EX = 21;
const EY = 3;

export interface CatHeadProps {
  fur: Fur;
  pattern?: Pattern;
  eyes?: EyeKind | [EyeKind, EyeKind];
  mouth?: MouthKind;
  brows?: BrowKind | [BrowKind, BrowKind];
  /** Pupil offset for open eyes. */
  look?: [number, number];
  blush?: boolean;
  whiskers?: boolean;
  /** Degrees each ear flops outward/down. */
  earDroop?: number;
  tuft?: 'none' | 'small' | 'spiky';
  tears?: boolean;
  sweat?: boolean;
  muzzle?: boolean;
  transform?: string;
  /** Drawn on top of the face (head coordinates). */
  children?: ReactNode;
  /** Drawn behind the ears (head coordinates). */
  under?: ReactNode;
  /** Drawn on the face below the eyes (e.g. a bandit mask). */
  facePaint?: ReactNode;
  whiskerColor?: string;
}

function Eye({ kind, side, iris, look }: { kind: EyeKind; side: -1 | 1; iris: string; look: [number, number] }) {
  const cx = side * EX;
  const cy = EY;
  const inw = -side; // direction toward the face center
  const [lx, ly] = look;
  const line = { fill: 'none', stroke: INK, strokeWidth: 4.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'happy':
      return <path d={`M${cx - 9} ${cy + 4}Q${cx} ${cy - 9} ${cx + 9} ${cy + 4}`} {...line} />;
    case 'closed':
      return <path d={`M${cx - 9} ${cy}Q${cx} ${cy + 8} ${cx + 9} ${cy}`} {...line} />;
    case 'x':
      return <path d={`M${cx - 7} ${cy - 7}L${cx + 7} ${cy + 7}M${cx + 7} ${cy - 7}L${cx - 7} ${cy + 7}`} {...line} />;
    case 'wide':
      return (
        <g>
          <ellipse cx={cx} cy={cy - 1} rx={11.5} ry={13.5} fill={WHITE} stroke={INK} strokeWidth={3} />
          <circle cx={cx + lx * 0.6} cy={cy + ly * 0.6} r={4.6} fill={INK} />
          <circle cx={cx + lx * 0.6 + 1.6} cy={cy + ly * 0.6 - 1.8} r={1.5} fill={WHITE} />
        </g>
      );
    case 'angry': {
      const d = `M${cx - inw * 11} ${cy - 6}L${cx + inw * 10} ${cy + 1}C${cx + inw * 11} ${cy + 15} ${cx - inw * 11} ${cy + 15} ${cx - inw * 11} ${cy - 6}Z`;
      return (
        <g>
          <path d={d} fill={INK} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          <circle cx={cx + 2.5} cy={cy + 3} r={2.6} fill={WHITE} />
        </g>
      );
    }
    case 'half':
      return (
        <g>
          <path
            d={`M${cx - 11} ${cy}L${cx + 11} ${cy}C${cx + 11} ${cy + 15} ${cx - 11} ${cy + 15} ${cx - 11} ${cy}Z`}
            fill={iris}
            stroke={INK}
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <path
            d={`M${cx + lx - 7} ${cy + 1.5}L${cx + lx + 7} ${cy + 1.5}C${cx + lx + 7} ${cy + 11} ${cx + lx - 7} ${cy + 11} ${cx + lx - 7} ${cy + 1.5}Z`}
            fill={INK}
          />
          <circle cx={cx + lx + 3} cy={cy + 4.5} r={2} fill={WHITE} />
          <path d={`M${cx - 13} ${cy - 1}L${cx + 13} ${cy - 1}`} {...line} strokeWidth={4.6} />
        </g>
      );
    case 'sad':
    case 'open':
    default: {
      const big = kind === 'sad';
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={10.5} ry={12.5} fill={iris} stroke={INK} strokeWidth={3} />
          <ellipse cx={cx + lx} cy={cy + ly - 1.6} rx={7.6} ry={9.6} fill={INK} />
          <circle cx={cx + lx + 3.2} cy={cy + ly - 5} r={big ? 4.4 : 3.8} fill={WHITE} />
          <circle cx={cx + lx - 3.4} cy={cy + ly + 3.6} r={big ? 2.4 : 1.8} fill={WHITE} />
        </g>
      );
    }
  }
}

function Brow({ kind, side, color }: { kind: BrowKind; side: -1 | 1; color: string }) {
  if (kind === 'none') return null;
  const cx = side * EX;
  const cy = EY;
  const inw = -side;
  let d = '';
  switch (kind) {
    case 'raised':
      d = `M${cx - 7} ${cy - 19}Q${cx} ${cy - 24} ${cx + 7} ${cy - 19}`;
      break;
    case 'surprised':
      d = `M${cx - 7} ${cy - 23}Q${cx} ${cy - 29} ${cx + 7} ${cy - 23}`;
      break;
    case 'angry':
      d = `M${cx - inw * 10} ${cy - 23}L${cx + inw * 9} ${cy - 13}`;
      break;
    case 'worried':
      d = `M${cx - inw * 10} ${cy - 15}L${cx + inw * 8} ${cy - 22}`;
      break;
  }
  return <path d={d} fill="none" stroke={color} strokeWidth={4.4} strokeLinecap="round" />;
}

function Mouth({ kind }: { kind: MouthKind }) {
  const line = { fill: 'none', stroke: INK, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const w = 'M-8 18Q-4 23 0 17.5Q4 23 8 18';
  switch (kind) {
    case 'none':
      return null;
    case 'w':
      return <path d={w} {...line} />;
    case 'smile':
      return (
        <g>
          <path d="M-11 18Q0 22 11 18Q10 33 0 33Q-10 33 -11 18Z" fill={MOUTH} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <ellipse cx={0} cy={28.5} rx={5.2} ry={3.2} fill={TONGUE} />
        </g>
      );
    case 'grin':
      return (
        <g>
          <path d="M-14 17Q0 23 14 17Q12 34 0 34Q-12 34 -14 17Z" fill={MOUTH} />
          <path d="M-13.5 18.5Q0 24 13.5 18.5L13 22.5Q0 27.5 -13 22.5Z" fill={WHITE} />
          <ellipse cx={0} cy={30.5} rx={6} ry={3} fill={TONGUE} />
          <path d="M-14 17Q0 23 14 17Q12 34 0 34Q-12 34 -14 17Z" fill="none" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        </g>
      );
    case 'o':
      return <ellipse cx={0} cy={24} rx={5} ry={6.5} fill={MOUTH} stroke={INK} strokeWidth={3} />;
    case 'O':
      return (
        <g>
          <ellipse cx={0} cy={27} rx={8.5} ry={11} fill={MOUTH} stroke={INK} strokeWidth={3} />
          <ellipse cx={0} cy={33} rx={5} ry={3.4} fill={TONGUE} />
        </g>
      );
    case 'frown':
      return <path d="M-8 25Q0 17 8 25" {...line} />;
    case 'smirk':
      return <path d="M-9 20Q1 24 10 15" {...line} />;
    case 'wavy':
      return <path d="M-11 22Q-8 18 -5 22Q-2 26 1 22Q4 18 7 22Q9 25 11 22" {...line} />;
    case 'blep':
      return (
        <g>
          <path d="M-4.5 19L4.5 19L4.5 26Q0 31 -4.5 26Z" fill={TONGUE} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <path d={w} {...line} />
        </g>
      );
    case 'grit':
      return (
        <g>
          <path d="M-13 17Q0 20 13 17Q13 29 0 30Q-13 29 -13 17Z" fill={WHITE} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <path d="M-12.5 23Q0 26 12.5 23M-5 18.5L-5 29M5 18.5L5 29" fill="none" stroke={INK} strokeWidth={1.8} />
        </g>
      );
  }
}

function Patterns({ pattern, fur }: { pattern: Pattern; fur: Fur }) {
  const st = fur.stripe ?? fur.shade;
  switch (pattern) {
    case 'tabby':
      return (
        <g fill="none" stroke={st} strokeWidth={5} strokeLinecap="round">
          <path d="M-11 -41L-7 -27M0 -42L0 -25M11 -41L7 -27" />
          <path d="M-60 -2L-47 1M-59 8L-48 8M60 -2L47 1M59 8L48 8" strokeWidth={4} />
        </g>
      );
    case 'tuxedo':
      return <path d="M0 -8C9 -8 12 4 24 13C33 27 22 46 0 46C-22 46 -33 27 -24 13C-12 4 -9 -8 0 -8Z" fill={fur.light} />;
    case 'siamese':
      return <ellipse cx={0} cy={17} rx={27} ry={22} fill={st} />;
    case 'calico':
      return (
        <g>
          <path d="M-62 -44L-10 -44C-8 -30 -12 -18 -26 -14C-40 -10 -52 -12 -62 -6Z" fill={fur.stripe} />
          <ellipse cx={44} cy={-30} rx={22} ry={17} fill={fur.patch} />
        </g>
      );
    default:
      return null;
  }
}

export function CatHead({
  fur,
  pattern = 'none',
  eyes = 'open',
  mouth = 'w',
  brows = 'none',
  look = [0, 0],
  blush = true,
  whiskers = true,
  earDroop = 0,
  tuft = 'none',
  tears = false,
  sweat = false,
  muzzle = true,
  transform,
  children,
  under,
  facePaint,
  whiskerColor = INK,
}: CatHeadProps) {
  const id = useUid();
  const [eL, eR] = Array.isArray(eyes) ? eyes : [eyes, eyes];
  const [bL, bR] = Array.isArray(brows) ? brows : [brows, brows];
  const browColor = fur.brow ?? INK;
  const earTf = earDroop ? `rotate(${-earDroop} -36 -18)` : undefined;
  const ear = (fill: string) => (
    <g transform={earTf}>
      <path d={EAR_D} fill={fill} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d={EAR_IN} fill={fur.ear} />
    </g>
  );
  return (
    <g transform={transform}>
      {under}
      {ear(fur.earL ?? fur.base)}
      <g transform="scale(-1 1)">{ear(fur.earR ?? fur.base)}</g>
      {tuft !== 'none' && (
        <path
          d={
            tuft === 'spiky'
              ? 'M-24 -34L-20 -54L-8 -40L0 -60L8 -40L20 -54L24 -34Z'
              : 'M-10 -36C-10 -44 -4 -50 0 -48C-3 -44 -1 -42 2 -44C4 -46 8 -46 10 -42L10 -36Z'
          }
          fill={fur.base}
          stroke={INK}
          strokeWidth={SW}
          strokeLinejoin="round"
        />
      )}
      <clipPath id={id}>
        <path d={HEAD_D} />
      </clipPath>
      <path d={HEAD_D} fill={fur.shade} />
      <g clipPath={`url(#${id})`}>
        <path d={HEAD_D} fill={fur.base} transform="translate(-4 -5)" />
        <Patterns pattern={pattern} fur={fur} />
        {muzzle && pattern !== 'tuxedo' && (
          <g fill={pattern === 'siamese' ? fur.stripe : fur.light}>
            <circle cx={-8} cy={20} r={10.5} />
            <circle cx={8} cy={20} r={10.5} />
          </g>
        )}
        <ellipse cx={-22} cy={-26} rx={13} ry={6} fill={WHITE} opacity={0.35} transform="rotate(-24 -22 -26)" />
      </g>
      <path d={HEAD_D} fill="none" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      {facePaint}
      {blush && (
        <g fill={BLUSH} opacity={0.55}>
          <ellipse cx={-36} cy={17} rx={7.5} ry={4.5} />
          <ellipse cx={36} cy={17} rx={7.5} ry={4.5} />
        </g>
      )}
      <Eye kind={eL} side={-1} iris={fur.iris} look={look} />
      <Eye kind={eR} side={1} iris={fur.iris} look={look} />
      <Brow kind={bL} side={-1} color={browColor} />
      <Brow kind={bR} side={1} color={browColor} />
      <path d="M-5 10Q0 8.5 5 10Q5 13.5 0 16Q-5 13.5 -5 10Z" fill={NOSE} stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <Mouth kind={mouth} />
      {whiskers && (
        <g stroke={whiskerColor} strokeWidth={2.2} strokeLinecap="round" fill="none">
          <path d="M-45 11L-68 6M-45 16L-69 17M-45 21L-66 27" />
          <path d="M45 11L68 6M45 16L69 17M45 21L66 27" />
        </g>
      )}
      {tears && (
        <g fill="#7fd8ff" stroke={INK} strokeWidth={2}>
          <path d="M-25 15Q-31 25 -25.5 28Q-20 25 -25 15Z" />
          <path d="M25 15Q19 25 24.5 28Q30 25 25 15Z" />
        </g>
      )}
      {sweat && <path d="M44 -30Q37 -18 43 -15Q50 -18 44 -30Z" fill="#9fe6ff" stroke={INK} strokeWidth={2.2} />}
      {children}
    </g>
  );
}
