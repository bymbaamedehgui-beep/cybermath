import { useId, type ReactNode } from 'react';

/** House outline color. */
export const INK = '#1b1035';
/** House outline width (in a 200-unit viewBox). */
export const SW = 3.5;
export const FONT = "'Nunito Variable', Nunito, Arial, sans-serif";

export const NOSE = '#ff6f9c';
export const BLUSH = '#ff5c93';
export const MOUTH = '#7a1840';
export const TONGUE = '#ff7e9d';
export const CYAN = '#22e5ff';
export const ORANGE = '#ff9f1c';
export const YELLOW = '#ffd23f';
export const WHITE = '#ffffff';

/** A DOM/SVG-safe unique id for gradients, clip paths and filters. */
export function useUid(): string {
  return 'mk' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Thick stroke with a dark outline: limbs, tails, fuses, scarves. */
export function Tube({
  d,
  w,
  color,
  outline = SW,
  ink = INK,
}: {
  d: string;
  w: number;
  color: string;
  outline?: number;
  ink?: string;
}) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={ink} strokeWidth={w + outline * 2} />
      <path d={d} stroke={color} strokeWidth={w} />
    </g>
  );
}

/**
 * A filled shape with two-tone cel shading: the shape is filled with `shade`
 * and a copy shifted up-left by `shift` is filled with `fill` (clipped), so a
 * crescent of shade remains on the lower-right edge. Children are drawn
 * inside the clip (patterns, bellies) before the outline.
 */
export function Blob({
  d,
  fill,
  shade,
  shift = [-4, -5],
  sw = SW,
  children,
  transform,
}: {
  d: string;
  fill: string;
  shade?: string;
  shift?: [number, number];
  sw?: number;
  children?: ReactNode;
  transform?: string;
}) {
  const id = useUid();
  return (
    <g transform={transform}>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <path d={d} fill={shade ?? fill} />
      <g clipPath={`url(#${id})`}>
        {shade && <path d={d} fill={fill} transform={`translate(${shift[0]} ${shift[1]})`} />}
        {children}
      </g>
      <path d={d} fill="none" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
}

/** Four-point twinkle star centered on (x, y). */
export function Sparkle({
  x,
  y,
  r = 7,
  color = WHITE,
  outline = false,
}: {
  x: number;
  y: number;
  r?: number;
  color?: string;
  outline?: boolean;
}) {
  const k = r * 0.22;
  const d = `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
  return outline ? (
    <path d={d} fill={color} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
  ) : (
    <path d={d} fill={color} />
  );
}

/** Short bold math glyph with a dark outline (paint-order stroke). */
export function Glyph({
  x,
  y,
  children,
  size = 18,
  color = WHITE,
  rotate = 0,
  stroke = INK,
  sw = 4,
  opacity,
}: {
  x: number;
  y: number;
  children: string;
  size?: number;
  color?: string;
  rotate?: number;
  stroke?: string;
  sw?: number;
  opacity?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontFamily={FONT}
      fontWeight={900}
      textAnchor="middle"
      dominantBaseline="central"
      fill={color}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinejoin="round"
      paintOrder="stroke"
      opacity={opacity}
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
    >
      {children}
    </text>
  );
}

/** Soft circular glow behind a character. */
export function Glow({
  cx = 100,
  cy = 100,
  r = 90,
  color = WHITE,
  opacity = 0.5,
}: {
  cx?: number;
  cy?: number;
  r?: number;
  color?: string;
  opacity?: number;
}) {
  const id = useUid();
  return (
    <>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={color} stopOpacity={opacity} />
          <stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.45} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </>
  );
}

/** Soft ground shadow ellipse. */
export function Shadow({ cx = 100, cy = 186, rx = 54, ry = 8 }: { cx?: number; cy?: number; rx?: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={INK} opacity={0.28} />;
}

/** Small round paw with toe marks; (x, y) is the center. */
export function Paw({
  x,
  y,
  r = 9,
  fill,
  rotate = 0,
  toes = true,
}: {
  x: number;
  y: number;
  r?: number;
  fill: string;
  rotate?: number;
  toes?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <ellipse rx={r * 1.12} ry={r} fill={fill} stroke={INK} strokeWidth={SW} />
      {toes && (
        <path
          d={`M${-r * 0.36} ${-r * 0.95}L${-r * 0.3} ${-r * 0.35}M${r * 0.36} ${-r * 0.95}L${r * 0.3} ${-r * 0.35}`}
          stroke={INK}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** Heart path centred on (cx, cy); `s` is roughly the half-width. */
export function heartPath(cx: number, cy: number, s: number): string {
  return `M${cx} ${cy + s * 0.95}C${cx - s * 1.5} ${cy - s * 0.05} ${cx - s * 0.95} ${cy - s * 1.25} ${cx} ${cy - s * 0.45}C${cx + s * 0.95} ${cy - s * 1.25} ${cx + s * 1.5} ${cy - s * 0.05} ${cx} ${cy + s * 0.95}Z`;
}
