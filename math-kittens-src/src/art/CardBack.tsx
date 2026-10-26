import { Spark } from './Bomb';
import { EAR_D, HEAD_D } from './CatHead';
import { CYAN, FONT, Glyph, INK, ORANGE, Sparkle, Tube, WHITE, useUid } from './core';

const PATTERN_GLYPHS: [string, number, number, number][] = [
  ['+', 12, 14, -10],
  ['×', 42, 18, 12],
  ['π', 26, 44, 0],
  ['÷', 54, 50, -8],
  ['√', 8, 62, 6],
];

/** Full card back, viewBox 0 0 200 280. */
export function CardBack({ className }: { className?: string }) {
  const id = useUid();
  const glow = `${id}g`;
  return (
    <svg viewBox="0 0 200 280" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0" stopColor="#40137f" />
          <stop offset="0.5" stopColor="#24125e" />
          <stop offset="1" stopColor="#0b1b52" />
        </linearGradient>
        <pattern id={`${id}p`} width={64} height={70} patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
          {PATTERN_GLYPHS.map(([g, x, y, r]) => (
            <text
              key={g}
              x={x}
              y={y}
              fontSize={15}
              fontFamily={FONT}
              fontWeight={900}
              fill={WHITE}
              textAnchor="middle"
              transform={`rotate(${r} ${x} ${y})`}
            >
              {g}
            </text>
          ))}
        </pattern>
        <radialGradient id={glow}>
          <stop offset="0" stopColor={CYAN} stopOpacity={0.5} />
          <stop offset="0.6" stopColor={CYAN} stopOpacity={0.14} />
          <stop offset="1" stopColor={CYAN} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}d`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#2c1675" />
          <stop offset="1" stopColor="#120a36" />
        </radialGradient>
      </defs>
      <rect width={200} height={280} rx={18} fill={`url(#${id}bg)`} />
      <rect width={200} height={280} rx={18} fill={`url(#${id}p)`} opacity={0.09} />
      {/* borders */}
      <rect x={9} y={9} width={182} height={262} rx={12} fill="none" stroke={CYAN} strokeWidth={2.5} />
      <rect x={15} y={15} width={170} height={250} rx={8} fill="none" stroke={ORANGE} strokeWidth={1.5} strokeDasharray="5 6" opacity={0.85} />
      <g fill={ORANGE} stroke={INK} strokeWidth={1.5}>
        <path d="M24 16L32 24L24 32L16 24Z" />
        <path d="M176 16L184 24L176 32L168 24Z" />
        <path d="M24 248L32 256L24 264L16 256Z" />
        <path d="M176 248L184 256L176 264L168 256Z" />
      </g>
      <Glyph x={100} y={34} size={18} color={CYAN} stroke="#120a36" sw={3}>
        + − × ÷
      </Glyph>
      <Glyph x={100} y={246} size={18} color={CYAN} stroke="#120a36" sw={3}>
        π √ ∞ =
      </Glyph>
      {/* emblem */}
      <circle cx={100} cy={140} r={84} fill={`url(#${glow})`} />
      <circle cx={100} cy={140} r={58} fill={`url(#${id}d)`} stroke={CYAN} strokeWidth={3.5} />
      <circle cx={100} cy={140} r={51} fill="none" stroke={ORANGE} strokeWidth={2} strokeDasharray="3 7" strokeLinecap="round" />
      {/* fuse tail */}
      <Tube d="M128 176C156 186 174 166 166 144C160 128 166 112 176 104" w={5} color="#ffb347" outline={2.5} />
      <path d="M128 176C156 186 174 166 166 144C160 128 166 112 176 104" fill="none" stroke={INK} strokeWidth={5} strokeDasharray="1.5 5" opacity={0.6} />
      <Spark x={178} y={101} r={13} />
      <g transform="translate(100 146) scale(0.66)">
        <g fill="#160b3c" stroke={CYAN} strokeWidth={14} strokeLinejoin="round" opacity={0.22}>
          <path d={EAR_D} />
          <path d={EAR_D} transform="scale(-1 1)" />
          <path d={HEAD_D} />
        </g>
        <g fill="#1a0d46" stroke={CYAN} strokeWidth={5} strokeLinejoin="round">
          <path d={EAR_D} />
          <path d={EAR_D} transform="scale(-1 1)" />
          <path d={HEAD_D} />
        </g>
        <path d="M-42 -20C-45 -33 -45 -45 -42 -52C-36 -49 -29 -43 -23 -37ZM42 -20C45 -33 45 -45 42 -52C36 -49 29 -43 23 -37Z" fill={ORANGE} opacity={0.75} />
        {[-21, 21].map((x) => (
          <g key={x}>
            <path d={`M${x - 13} 3Q${x} -13 ${x + 13} 3Q${x} 19 ${x - 13} 3Z`} fill={ORANGE} stroke={INK} strokeWidth={2.5} />
            <ellipse cx={x} cy={3} rx={2.8} ry={9} fill={INK} />
            <circle cx={x + 4} cy={-2} r={2.4} fill={WHITE} />
          </g>
        ))}
        <path d="M-6 13L6 13L0 20Z" fill={CYAN} stroke={CYAN} strokeWidth={2} strokeLinejoin="round" />
        <path d="M0 20Q-5 27 -11 24M0 20Q5 27 11 24" fill="none" stroke={CYAN} strokeWidth={3} strokeLinecap="round" />
        <g stroke={CYAN} strokeWidth={3} strokeLinecap="round" opacity={0.85}>
          <path d="M-44 14L-70 8M-44 22L-70 26M44 14L70 8M44 22L70 26" />
        </g>
      </g>
      <Sparkle x={48} y={86} r={6} color={WHITE} />
      <Sparkle x={150} y={204} r={5} color={CYAN} />
      <Sparkle x={44} y={196} r={4} color={ORANGE} />
      <rect x={1.5} y={1.5} width={197} height={277} rx={17} fill="none" stroke={INK} strokeWidth={3} />
    </svg>
  );
}
