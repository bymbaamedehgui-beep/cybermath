import { Bomb } from './Bomb';
import { CatHead } from './CatHead';
import { Blob, CYAN, Glow, Glyph, INK, ORANGE, Paw, Shadow, Sparkle, SW, Tube, WHITE, YELLOW, heartPath, useUid } from './core';
import { FUR } from './fur';

/* ------------------------------------------------------------------ */
/* Тэсрэх Муур: startled charcoal cat hugging a lit bomb               */
/* ------------------------------------------------------------------ */
export function ExplodeArt() {
  const f = FUR.charcoal;
  const id = useUid();
  return (
    <g>
      <Glow cx={100} cy={108} r={96} color="#fff6c8" opacity={0.7} />
      <Shadow cy={186} rx={58} />
      {/* bristled, scared tail */}
      <Blob
        d="M76 170C50 170 38 152 38 130L27 127L36 120L27 112L39 110L35 99L47 103L50 92L57 104C57 126 64 146 82 152Z"
        fill={f.base}
        shade={f.shade}
      />
      <Blob d="M68 108C58 138 62 172 82 180L118 180C138 172 142 138 132 108Z" fill={f.base} shade={f.shade} />
      <ellipse cx={80} cy={182} rx={14} ry={8} fill={f.base} stroke={INK} strokeWidth={SW} />
      <ellipse cx={120} cy={182} rx={14} ry={8} fill={f.base} stroke={INK} strokeWidth={SW} />
      <Bomb
        transform="translate(100 146) scale(1.08)"
        fuse="M26 -26C36 -36 50 -32 50 -21C50 -13 56 -9 61 -12"
        spark={[63, -13]}
        sparkR={13}
      >
        <defs>
          <radialGradient id={id}>
            <stop offset="0" stopColor="#ffe066" stopOpacity={0.85} />
            <stop offset="1" stopColor="#ff9f1c" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={0} cy={4} r={20} fill={`url(#${id})`} />
        <Glyph x={0} y={5} size={33} color="#fff3a1" stroke="#ff8a00" sw={3}>
          ?
        </Glyph>
      </Bomb>
      <Tube d="M76 110C62 116 58 132 66 146" w={12} color={f.base} />
      <Tube d="M124 110C138 116 142 132 134 146" w={12} color={f.base} />
      <Paw x={68} y={148} r={8} fill={f.base} rotate={-20} />
      <Paw x={132} y={148} r={8} fill={f.base} rotate={20} />
      <CatHead
        fur={f}
        eyes="wide"
        mouth="O"
        brows="surprised"
        tuft="spiky"
        sweat
        transform="translate(100 64) rotate(-4) scale(0.9)"
      />
      <Glyph x={26} y={44} size={30} color={CYAN} rotate={-14}>+</Glyph>
      <Glyph x={174} y={36} size={26} color="#fff27a" rotate={12}>×</Glyph>
      <Glyph x={22} y={170} size={24} color={WHITE} rotate={-8}>÷</Glyph>
      <Glyph x={174} y={176} size={24} color={CYAN} rotate={10}>π</Glyph>
      <Glyph x={178} y={88} size={26} color={WHITE} rotate={-6}>−</Glyph>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Аврагч Муур: caped hero with a heart shield                         */
/* ------------------------------------------------------------------ */
export function RescueArt() {
  const f = FUR.ginger;
  return (
    <g>
      <Glow cx={100} cy={106} r={94} opacity={0.55} />
      <Shadow cy={186} rx={56} />
      {/* flowing cape */}
      <Blob
        d="M80 104C62 124 42 152 20 172Q34 170 42 182Q54 168 66 182Q78 168 92 180L120 108Z"
        fill="#ff4560"
        shade="#d0263f"
        shift={[5, -5]}
      />
      <Blob d="M76 108C68 136 70 168 82 180L118 180C130 168 132 136 124 108Z" fill={f.base} shade={f.shade}>
        <ellipse cx={100} cy={152} rx={16} ry={24} fill={f.light} />
      </Blob>
      <ellipse cx={86} cy={182} rx={13} ry={7.5} fill={f.base} stroke={INK} strokeWidth={SW} />
      <ellipse cx={114} cy={182} rx={13} ry={7.5} fill={f.base} stroke={INK} strokeWidth={SW} />
      {/* raised fist */}
      <Tube d="M80 116C64 116 52 108 44 96" w={12} color={f.base} />
      <Paw x={41} y={91} r={9.5} fill={f.base} rotate={-30} />
      {/* shield */}
      <Blob d="M110 116L168 116C168 150 158 170 139 183C120 170 110 150 110 116Z" fill="#f3f6ff" shade="#c3d0ee">
        <path d="M139 116L168 116C168 150 158 170 139 183Z" fill="#dfe7fb" opacity={0.6} />
      </Blob>
      <path
        d="M117 122L161 122C161 149 153 165 139 175C125 165 117 149 117 122Z"
        fill="none"
        stroke={YELLOW}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d={heartPath(139, 145, 15)} fill="#ff3d6a" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M139 136V150M132 143H146" stroke={WHITE} strokeWidth={4.4} strokeLinecap="round" />
      <Paw x={112} y={142} r={8} fill={f.base} rotate={80} />
      {/* cape clasp */}
      <circle cx={100} cy={108} r={7} fill={YELLOW} stroke={INK} strokeWidth={3} />
      <CatHead
        fur={f}
        pattern="tabby"
        eyes="open"
        look={[1, -1]}
        brows={['raised', 'angry']}
        mouth="grin"
        transform="translate(98 64) rotate(-3) scale(0.9)"
      />
      <Sparkle x={168} y={94} r={9} color={WHITE} />
      <Sparkle x={30} y={56} r={7} color={YELLOW} />
      <Sparkle x={178} y={66} r={5} color={YELLOW} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Алгасагч Муур: sleepy cat curled on a pillow                        */
/* ------------------------------------------------------------------ */
export function SkipArt() {
  const f = FUR.cream;
  const mask = '#5b4bd1';
  return (
    <g>
      <Glow cx={100} cy={112} r={94} opacity={0.5} />
      <Shadow cy={184} rx={78} />
      {/* pillow */}
      <Blob
        d="M22 138C18 124 34 118 50 124C80 118 120 118 150 124C166 118 182 124 178 138C184 152 184 166 178 178C150 186 50 186 22 178C16 166 16 152 22 138Z"
        fill="#d5c8ff"
        shade="#a998f0"
      />
      <path d="M30 150Q100 158 170 150" fill="none" stroke="#a998f0" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 7" />
      {/* curled body */}
      <Blob d="M64 124C66 98 134 92 156 114C170 130 162 156 136 160L84 160C66 158 60 140 64 124Z" fill={f.base} shade={f.shade} />
      {/* tail wrapped around the front */}
      <Tube d="M152 146C160 160 144 170 118 170C104 170 96 168 90 164" w={11} color={f.base} />
      <path d="M96 166C100 168 104 169 108 169" stroke={f.stripe} strokeWidth={8} strokeLinecap="round" fill="none" />
      <CatHead
        fur={f}
        eyes="closed"
        mouth="o"
        transform="translate(76 114) rotate(-12) scale(0.78)"
      >
        {/* sleep mask pushed up */}
        <path d="M-37 -28L-50 -20M37 -28L50 -20" stroke={INK} strokeWidth={8} strokeLinecap="round" />
        <path d="M-37 -28L-50 -20M37 -28L50 -20" stroke={mask} strokeWidth={4} strokeLinecap="round" />
        <path
          d="M-36 -30C-36 -43 -8 -43 0 -35C8 -43 36 -43 36 -30C36 -17 8 -17 0 -23C-8 -17 -36 -17 -36 -30Z"
          fill={mask}
          stroke={INK}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path d="M-25 -31Q-18 -26 -11 -31M11 -31Q18 -26 25 -31" fill="none" stroke="#ffb3d1" strokeWidth={2.6} strokeLinecap="round" />
        {/* snot bubble */}
        <circle cx={16} cy={23} r={9.5} fill="#c7f4ff" fillOpacity={0.8} stroke={INK} strokeWidth={1.8} />
        <circle cx={13} cy={19} r={2.2} fill={WHITE} />
      </CatHead>
      <Paw x={62} y={152} r={8} fill={f.base} rotate={8} />
      <Paw x={88} y={154} r={8} fill={f.base} rotate={-6} />
      <Glyph x={124} y={78} size={30} color={WHITE} rotate={-10}>Z</Glyph>
      <Glyph x={150} y={52} size={22} color={WHITE} rotate={-6}>z</Glyph>
      <Glyph x={170} y={30} size={16} color={WHITE} rotate={4}>z</Glyph>
      <Sparkle x={36} y={50} r={6} color={YELLOW} />
      <Sparkle x={178} y={92} r={5} color={WHITE} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Довтлогч Муур: fierce boxer                                         */
/* ------------------------------------------------------------------ */
function Glove({ transform, flip = false }: { transform: string; flip?: boolean }) {
  return (
    <g transform={`${transform}${flip ? ' scale(-1 1)' : ''}`}>
      <rect x={-25} y={-12} width={13} height={24} rx={4} fill={WHITE} stroke={INK} strokeWidth={SW} />
      <Blob d="M-15 -15C-7 -25 15 -24 22 -10C28 3 21 20 4 21C-7 22 -15 16 -15 8Z" fill="#ff2e4d" shade="#b8102e" shift={[-3, -4]} />
      <path d="M-7 -6C-2 0 -2 8 -6 13" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <ellipse cx={2} cy={-13} rx={7} ry={3.5} fill={WHITE} opacity={0.65} transform="rotate(-12 2 -13)" />
    </g>
  );
}

export function AttackArt() {
  const f = FUR.gray;
  return (
    <g>
      <Glow cx={98} cy={106} r={96} opacity={0.6} />
      <Shadow cx={94} cy={186} rx={54} />
      {/* speed lines */}
      <g stroke={WHITE} strokeWidth={5} strokeLinecap="round" opacity={0.95}>
        <path d="M120 106H150" />
        <path d="M128 148H152" />
        <path d="M108 128H124" />
      </g>
      <Blob d="M64 108C56 138 60 170 74 180L114 180C128 170 132 138 124 108Z" fill={f.base} shade={f.shade}>
        <ellipse cx={94} cy={152} rx={15} ry={22} fill={f.light} />
      </Blob>
      <ellipse cx={78} cy={182} rx={13} ry={7.5} fill={f.base} stroke={INK} strokeWidth={SW} />
      <ellipse cx={110} cy={182} rx={13} ry={7.5} fill={f.base} stroke={INK} strokeWidth={SW} />
      {/* punching arm */}
      <Tube d="M116 124C132 126 144 126 152 125" w={12} color={f.base} />
      <Glove transform="translate(168 124) scale(1.12)" />
      <g stroke={YELLOW} strokeWidth={4} strokeLinecap="round">
        <path d="M186 98L192 90M190 124H197M186 150L192 158" />
      </g>
      {/* guard arm */}
      <Tube d="M70 118C58 126 56 140 64 148" w={12} color={f.base} />
      <Glove transform="translate(74 150) rotate(-35) scale(0.9)" />
      <CatHead
        fur={f}
        pattern="tabby"
        eyes="angry"
        brows="angry"
        mouth="grit"
        transform="translate(92 66) rotate(-6) scale(0.9)"
      >
        {/* sweatband */}
        <path d="M-49 -24C-20 -36 20 -36 49 -24L50 -13C20 -25 -20 -25 -50 -13Z" fill="#2fd3ff" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d="M-50 -20C-62 -26 -70 -22 -78 -30L-74 -16C-66 -12 -58 -14 -50 -14Z" fill="#2fd3ff" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      </CatHead>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Эргүүлэгч Муур: chasing its own tail                                */
/* ------------------------------------------------------------------ */
const pt = (cx: number, cy: number, r: number, a: number): [number, number] => {
  const t = (a * Math.PI) / 180;
  return [+(cx + r * Math.cos(t)).toFixed(1), +(cy + r * Math.sin(t)).toFixed(1)];
};

function ArcArrow({ cx, cy, r, a0, a1, color }: { cx: number; cy: number; r: number; a0: number; a1: number; color: string }) {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1 - 4);
  const tip = pt(cx, cy, r, a1 + 10);
  const b1 = pt(cx, cy, r - 12, a1 - 6);
  const b2 = pt(cx, cy, r + 12, a1 - 6);
  return (
    <g>
      <Tube d={`M${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}`} w={7} color={color} />
      <path d={`M${tip[0]} ${tip[1]}L${b1[0]} ${b1[1]}L${b2[0]} ${b2[1]}Z`} fill={color} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
    </g>
  );
}

export function ReverseArt() {
  const f = FUR.calico;
  const [nx, ny] = pt(100, 122, 35, 236);
  const [hx, hy] = pt(100, 122, 35, 12);
  const ring = `M${nx} ${ny}A35 35 0 1 0 ${hx} ${hy}`;
  const tail = `M${hx} ${hy}C${hx + 14} ${hy - 12} 164 100 162 82C161 72 156 66 150 64`;
  const feet: [number, number, number][] = [
    [...pt(100, 122, 55, 196), 106],
    [...pt(100, 122, 55, 160), 70],
    [...pt(100, 122, 55, 74), -16],
    [...pt(100, 122, 55, 44), -46],
  ];
  return (
    <g>
      <Glow cx={100} cy={112} r={96} opacity={0.5} />
      <ArcArrow cx={100} cy={118} r={74} a0={150} a1={222} color={CYAN} />
      <ArcArrow cx={100} cy={118} r={74} a0={330} a1={42} color={ORANGE} />
      {feet.map(([x, y, r], i) => (
        <Paw key={i} x={x} y={y} r={9} rotate={r} fill={i === 1 ? f.stripe! : f.base} />
      ))}
      <Tube d={tail} w={11} color={f.base} />
      <path d="M154 66C158 68 161 74 162 80" stroke={f.patch} strokeWidth={11} strokeLinecap="round" fill="none" />
      <Tube d={ring} w={32} color={f.base} />
      <path d={ring} fill="none" stroke={f.stripe} strokeWidth={30} strokeLinecap="round" strokeDasharray="0 36 8 200" />
      <path d={ring} fill="none" stroke={f.patch} strokeWidth={30} strokeLinecap="round" strokeDasharray="0 108 2 200" />
      <path
        d="M100 122m-3 -3a3 3 0 1 1 -1 5a7 7 0 1 1 11 -7a10 10 0 1 1 -16 -2"
        fill="none"
        stroke={WHITE}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <CatHead
        fur={f}
        pattern="calico"
        eyes="open"
        look={[4, -1]}
        brows="raised"
        mouth="smile"
        transform="translate(98 70) rotate(8) scale(0.8)"
      />
      <Sparkle x={168} y={40} r={7} color={YELLOW} />
      <Sparkle x={30} y={186} r={6} color={WHITE} />
    </g>
  );
}
