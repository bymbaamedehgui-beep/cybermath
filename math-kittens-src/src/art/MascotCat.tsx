import { Bomb } from './Bomb';
import { CatHead } from './CatHead';
import { Blob, CYAN, Glow, Glyph, INK, ORANGE, Paw, Sparkle, SW, Tube, WHITE, YELLOW } from './core';
import { FUR } from './fur';

/** Main-menu hero: cheerful cat with a bow tie, a lit bomb and chalk. viewBox 0 0 320 260. */
export function MascotCat({ className }: { className?: string }) {
  const f = FUR.ginger;
  return (
    <svg viewBox="0 0 320 260" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <Glow cx={160} cy={150} r={140} color="#c49bff" opacity={0.45} />
      <ellipse cx={160} cy={250} rx={70} ry={8} fill="#0b0620" opacity={0.5} />
      {/* floating math */}
      <Glyph x={30} y={40} size={34} color={CYAN} rotate={-14}>+</Glyph>
      <Glyph x={292} y={40} size={32} color={ORANGE} rotate={12}>×</Glyph>
      <Glyph x={26} y={212} size={30} color={YELLOW} rotate={-8}>π</Glyph>
      <Glyph x={296} y={204} size={32} color="#ff6bb5" rotate={10}>÷</Glyph>
      <Glyph x={300} y={118} size={26} color={CYAN} rotate={6}>√</Glyph>
      <Glyph x={262} y={24} size={24} color={WHITE} rotate={-6}>=</Glyph>
      <Glyph x={74} y={204} size={26} color="#ff6bb5" rotate={-10}>−</Glyph>
      {/* tail */}
      <Tube d="M204 226C236 230 262 212 262 186C262 170 254 160 246 156" w={15} color={f.base} />
      <path d="M254 166L263 170M259 194L268 192M246 216L252 223" stroke={f.stripe} strokeWidth={5} strokeLinecap="round" />
      {/* body */}
      <Blob d="M114 146C102 186 106 236 128 248L192 248C214 236 218 186 206 146Z" fill={f.base} shade={f.shade}>
        <ellipse cx={160} cy={206} rx={26} ry={34} fill={f.light} />
        <path d="M110 186L122 184M110 202L120 200M210 186L198 184M210 202L200 200" stroke={f.stripe} strokeWidth={5} strokeLinecap="round" />
      </Blob>
      <ellipse cx={140} cy={250} rx={18} ry={9} fill={f.base} stroke={INK} strokeWidth={SW} />
      <ellipse cx={180} cy={250} rx={18} ry={9} fill={f.base} stroke={INK} strokeWidth={SW} />
      {/* bomb paw */}
      <Glow cx={56} cy={146} r={56} color="#ffb86b" opacity={0.45} />
      <Tube d="M120 168C102 168 90 162 82 154" w={16} color={f.base} />
      <Bomb transform="translate(54 146) scale(1.05)" fuse="M26 -26C32 -42 18 -52 6 -54" spark={[3, -56]} sparkR={15} />
      <Paw x={80} y={156} r={10.5} fill={f.base} rotate={-30} />
      {/* chalk paw */}
      <Tube d="M200 168C218 166 230 156 236 144" w={16} color={f.base} />
      <g transform="translate(250 124) rotate(38)">
        <rect x={-6} y={-20} width={12} height={34} rx={4} fill={WHITE} stroke={INK} strokeWidth={3} />
        <rect x={-6} y={-20} width={12} height={8} rx={4} fill="#ffe3f1" stroke={INK} strokeWidth={3} />
      </g>
      <Paw x={238} y={140} r={10.5} fill={f.base} rotate={30} />
      <g fill={WHITE} opacity={0.85}>
        <circle cx={268} cy={98} r={2.2} />
        <circle cx={276} cy={106} r={1.6} />
        <circle cx={262} cy={90} r={1.4} />
      </g>
      <Sparkle x={274} y={80} r={7} color={WHITE} />
      {/* bow tie */}
      <path d="M160 152L138 140L138 166ZM160 152L182 140L182 166Z" fill={CYAN} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M142 146L150 150M178 146L170 150" stroke="#0aa5c4" strokeWidth={3} strokeLinecap="round" />
      <circle cx={160} cy={152} r={6.5} fill={CYAN} stroke={INK} strokeWidth={3} />
      <CatHead
        fur={f}
        pattern="tabby"
        eyes="open"
        look={[1, -1]}
        brows="raised"
        mouth="smile"
        whiskerColor="#f3e8ff"
        transform="translate(160 92) rotate(-3) scale(1.22)"
      />
      <Sparkle x={112} y={20} r={8} color={YELLOW} />
      <Sparkle x={214} y={14} r={6} color={WHITE} />
      <Sparkle x={70} y={228} r={6} color={WHITE} />
    </svg>
  );
}
