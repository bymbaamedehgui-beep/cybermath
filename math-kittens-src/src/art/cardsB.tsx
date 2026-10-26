import { CatHead } from './CatHead';
import { Blob, CYAN, FONT, Glow, Glyph, INK, ORANGE, Paw, Shadow, Sparkle, SW, Tube, WHITE, YELLOW, useUid } from './core';
import { FUR } from './fur';

/* ------------------------------------------------------------------ */
/* Зөн Билэгч Муур: fortune teller with a crystal ball                 */
/* ------------------------------------------------------------------ */
export function FutureArt() {
  const f = FUR.siamese;
  const id = useUid();
  const robe = '#8b5cf6';
  return (
    <g>
      <defs>
        <radialGradient id={`${id}b`} cx="0.4" cy="0.36" r="0.7">
          <stop offset="0" stopColor={WHITE} />
          <stop offset="0.35" stopColor="#b6f6ff" />
          <stop offset="0.75" stopColor="#4fc9f2" />
          <stop offset="1" stopColor="#7a5cff" />
        </radialGradient>
      </defs>
      <Glow cx={100} cy={104} r={96} opacity={0.5} />
      <Shadow cy={186} rx={52} />
      <Blob d="M64 108C54 138 60 172 80 182L120 182C140 172 146 138 136 108Z" fill={robe} shade="#6a3bd6">
        <path d="M100 104L100 182" stroke={YELLOW} strokeWidth={4} />
        <circle cx={80} cy={170} r={2.6} fill={YELLOW} />
        <circle cx={124} cy={162} r={2.6} fill={YELLOW} />
      </Blob>
      <Glow cx={100} cy={142} r={50} color="#e6fdff" opacity={0.9} />
      {/* stand */}
      <Blob d="M76 184L124 184L114 164L86 164Z" fill={YELLOW} shade="#e0a21a" shift={[-3, -3]} />
      {/* ball */}
      <circle cx={100} cy={142} r={31} fill={`url(#${id}b)`} stroke={INK} strokeWidth={SW} />
      <Glyph x={100} y={145} size={32} color="#6d28d9" stroke={WHITE} sw={4}>
        ?
      </Glyph>
      <ellipse cx={86} cy={127} rx={9} ry={5} fill={WHITE} opacity={0.85} transform="rotate(-35 86 127)" />
      {/* hovering paws */}
      <Tube d="M72 114C62 120 58 130 60 138" w={12} color={f.base} />
      <Tube d="M128 114C138 120 142 130 140 138" w={12} color={f.base} />
      <Paw x={62} y={140} r={8} fill={f.patch} rotate={-30} />
      <Paw x={138} y={140} r={8} fill={f.patch} rotate={30} />
      <CatHead
        fur={f}
        pattern="siamese"
        eyes="half"
        look={[0, 1]}
        mouth="w"
        transform="translate(100 68) scale(0.88)"
      >
        {/* turban */}
        <path
          d="M-40 -28C-48 -56 -22 -76 0 -74C22 -76 48 -56 40 -28C24 -37 -24 -37 -40 -28Z"
          fill="#ff4fa3"
          stroke={INK}
          strokeWidth={SW}
          strokeLinejoin="round"
        />
        <path d="M-36 -40Q-4 -62 34 -44M-30 -56Q2 -70 28 -60" fill="none" stroke="#c42a78" strokeWidth={3} strokeLinecap="round" />
        <path d="M3 -42C-2 -60 8 -80 22 -90C24 -72 18 -54 3 -42Z" fill={ORANGE} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
        <circle cx={0} cy={-38} r={7.5} fill={CYAN} stroke={INK} strokeWidth={2.8} />
        <circle cx={-2.4} cy={-40.4} r={2.2} fill={WHITE} />
      </CatHead>
      <Sparkle x={34} y={110} r={8} color={WHITE} />
      <Sparkle x={168} y={110} r={7} color={YELLOW} />
      <Sparkle x={160} y={40} r={6} color={WHITE} />
      <Sparkle x={42} y={44} r={5} color={YELLOW} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Холигч Муур: juggling cards                                         */
/* ------------------------------------------------------------------ */
function MiniCard({ x, y, rot, kind }: { x: number; y: number; rot: number; kind: 0 | 1 | 2 }) {
  const glyph = kind === 0 ? '+' : kind === 2 ? '×' : '';
  const col = kind === 0 ? ORANGE : '#ff4fa3';
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-15} y={-20} width={30} height={40} rx={5} fill={kind === 1 ? '#3b1d7a' : WHITE} stroke={INK} strokeWidth={SW} />
      {kind === 1 ? (
        <g>
          <rect x={-10} y={-15} width={20} height={30} rx={3} fill="none" stroke={CYAN} strokeWidth={2.4} />
          <circle r={5} fill={ORANGE} stroke={INK} strokeWidth={2} />
        </g>
      ) : (
        <g>
          <rect x={-10} y={-15} width={20} height={30} rx={3} fill={col} opacity={0.25} />
          <Glyph x={0} y={1} size={22} color={col} sw={3}>
            {glyph}
          </Glyph>
        </g>
      )}
    </g>
  );
}

export function ShuffleArt() {
  const f = FUR.tuxedo;
  return (
    <g>
      <Glow cx={100} cy={108} r={96} opacity={0.55} />
      <Shadow cy={188} rx={50} />
      {/* juggling swirl */}
      <path
        d="M44 108C26 66 56 22 100 20C144 22 174 66 156 108"
        fill="none"
        stroke={WHITE}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeDasharray="2 9"
      />
      <Blob d="M70 140C62 160 66 182 80 188L120 188C134 182 138 160 130 140Z" fill={f.base} shade={f.shade}>
        <path d="M86 136L114 136L108 190L92 190Z" fill={f.light} />
      </Blob>
      <Tube d="M78 146C62 140 52 126 48 108" w={12} color={f.base} />
      <Tube d="M122 146C138 140 148 126 152 108" w={12} color={f.base} />
      <Paw x={47} y={103} r={8.5} fill={f.light} rotate={-14} />
      <Paw x={153} y={103} r={8.5} fill={f.light} rotate={14} />
      <CatHead
        fur={f}
        pattern="tuxedo"
        eyes="open"
        look={[0, -4]}
        brows="raised"
        mouth="blep"
        transform="translate(100 118) scale(0.8)"
      />
      <MiniCard x={36} y={62} rot={-28} kind={0} />
      <MiniCard x={100} y={30} rot={8} kind={1} />
      <MiniCard x={164} y={62} rot={26} kind={2} />
      <g fill="none" stroke={WHITE} strokeWidth={3} strokeLinecap="round">
        <path d="M20 46Q14 62 22 78" />
        <path d="M78 18Q76 32 82 42" />
        <path d="M180 46Q186 62 178 78" />
        <path d="M122 18Q124 32 118 42" />
      </g>
      <Sparkle x={66} y={18} r={6} color={WHITE} />
      <Sparkle x={140} y={92} r={5} color={WHITE} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Хулгайч Муур: tiptoeing burglar with a loot sack                    */
/* ------------------------------------------------------------------ */
export function StealArt() {
  const f = FUR.sandy;
  const shirt = '#2a2245';
  const mask = '#1f1733';
  return (
    <g>
      <Glow cx={100} cy={106} r={96} opacity={0.55} />
      <Shadow cx={98} cy={188} rx={50} />
      {/* loot sack over the shoulder */}
      <Blob d="M30 98C12 122 16 162 46 168C76 172 86 142 80 114C76 100 66 94 58 92Z" fill="#ead7ab" shade="#c9aa72">
        <path d="M34 140L48 136M38 150L52 147" stroke="#b8925a" strokeWidth={2.4} strokeLinecap="round" />
      </Blob>
      <g transform="translate(46 86) rotate(-18)">
        <rect x={-11} y={-15} width={22} height={30} rx={4} fill={WHITE} stroke={INK} strokeWidth={3} />
        <Glyph x={0} y={0} size={16} color="#ff4d6d" sw={2.5}>
          ÷
        </Glyph>
      </g>
      <path d="M44 96C50 100 62 100 68 94" fill="none" stroke="#b8925a" strokeWidth={5} strokeLinecap="round" />
      {/* legs: tiptoe + raised */}
      <Tube d="M90 164C88 172 86 178 84 184" w={12} color={f.base} />
      <Tube d="M112 164C120 170 128 172 136 166" w={12} color={f.base} />
      <ellipse cx={84} cy={186} rx={8} ry={6} fill={f.base} stroke={INK} strokeWidth={SW} />
      <ellipse cx={139} cy={163} rx={8} ry={6} fill={f.base} stroke={INK} strokeWidth={SW} transform="rotate(-30 139 163)" />
      {/* striped shirt */}
      <Blob d="M76 106C66 132 68 158 80 168L120 168C132 158 134 132 124 106Z" fill={WHITE} shade="#d8d2ea">
        <g fill={shirt}>
          <rect x={60} y={116} width={80} height={7} />
          <rect x={60} y={131} width={80} height={7} />
          <rect x={60} y={146} width={80} height={7} />
          <rect x={60} y={161} width={80} height={7} />
        </g>
      </Blob>
      {/* arm holding the sack, arm reaching forward */}
      <Tube d="M80 114C70 108 66 100 64 94" w={12} color={f.base} />
      <Paw x={63} y={92} r={8} fill={f.base} rotate={-10} />
      <Tube d="M122 116C136 116 146 110 150 100" w={12} color={f.base} />
      <Paw x={151} y={96} r={8} fill={f.base} rotate={20} />
      <CatHead
        fur={f}
        pattern="tabby"
        eyes="half"
        look={[4, 0]}
        mouth="smirk"
        transform="translate(100 64) rotate(5) scale(0.88)"
        facePaint={
          <g>
            <path d="M-58 -6C-62 -12 -76 -6 -86 -14L-82 -1C-74 4 -64 2 -58 4Z" fill={mask} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
            <path d="M-58 -9C-38 -19 38 -19 58 -9L57 13C38 6 -38 6 -57 13Z" fill={mask} />
            <ellipse cx={-21} cy={5} rx={14.5} ry={11} fill={f.base} />
            <ellipse cx={21} cy={5} rx={14.5} ry={11} fill={f.base} />
          </g>
        }
      />
      <g fill="none" stroke={WHITE} strokeWidth={3} strokeLinecap="round">
        <path d="M70 186Q64 180 66 172" />
        <path d="M148 176Q156 172 156 164" />
      </g>
      <Sparkle x={170} y={40} r={7} color={YELLOW} />
      <Sparkle x={26} y={50} r={5} color={WHITE} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Сорилтын Муур: professor at the chalkboard                          */
/* ------------------------------------------------------------------ */
export function ChallengeArt() {
  const f = FUR.blue;
  return (
    <g>
      <Glow cx={96} cy={108} r={96} opacity={0.55} />
      <Shadow cx={66} cy={188} rx={44} />
      {/* chalkboard */}
      <path d="M118 96L110 132M178 96L186 132" stroke={INK} strokeWidth={9} strokeLinecap="round" />
      <path d="M118 96L110 132M178 96L186 132" stroke="#b86e30" strokeWidth={4} strokeLinecap="round" />
      <rect x={96} y={22} width={100} height={78} rx={7} fill="#c97c3c" stroke={INK} strokeWidth={SW} />
      <rect x={103} y={29} width={86} height={64} rx={4} fill="#1d5a45" stroke={INK} strokeWidth={2} />
      <text
        x={146}
        y={63}
        fontSize={24}
        fontFamily={FONT}
        fontWeight={900}
        textAnchor="middle"
        dominantBaseline="central"
        fill={WHITE}
      >
        x+y=?
      </text>
      <path d="M112 84Q124 80 134 84" stroke={WHITE} strokeWidth={2} opacity={0.5} fill="none" strokeLinecap="round" />
      <rect x={160} y={86} width={14} height={5} rx={2} fill={WHITE} stroke={INK} strokeWidth={1.5} />
      {/* body */}
      <Blob d="M38 134C30 158 34 180 46 188L86 188C98 180 102 158 94 134Z" fill={f.base} shade={f.shade}>
        <ellipse cx={66} cy={164} rx={14} ry={20} fill={f.light} />
      </Blob>
      <Tube d="M42 142C34 152 34 164 40 172" w={11} color={f.base} />
      <Paw x={42} y={174} r={8} fill={f.base} />
      {/* pointer */}
      <path d="M120 124L166 82" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      <path d="M120 124L166 82" stroke="#e9a35b" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={166} cy={82} r={3.5} fill="#ff4d6d" stroke={INK} strokeWidth={2} />
      <Tube d="M90 142C102 138 110 132 116 126" w={11} color={f.base} />
      <Paw x={119} y={124} r={8} fill={f.base} rotate={-40} />
      {/* bow tie */}
      <path d="M66 136L52 128L52 144ZM66 136L80 128L80 144Z" fill="#ff4d6d" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
      <circle cx={66} cy={136} r={4} fill="#ff4d6d" stroke={INK} strokeWidth={2.4} />
      <CatHead
        fur={f}
        eyes="open"
        look={[4, -2]}
        brows="raised"
        mouth="smile"
        transform="translate(64 100) rotate(4) scale(0.76)"
      >
        {/* glasses */}
        <g fill={WHITE} fillOpacity={0.22} stroke={INK} strokeWidth={3.4}>
          <circle cx={-21} cy={3} r={15} />
          <circle cx={21} cy={3} r={15} />
        </g>
        <path d="M-6 1Q0 -3 6 1M-36 0L-52 -6M36 0L52 -6" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        {/* mortarboard */}
        <path d="M-30 -42L-30 -28C-12 -22 12 -22 30 -28L30 -42Z" fill="#2a2245" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d="M-60 -46L0 -66L60 -46L0 -28Z" fill="#3a3160" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        <path d="M0 -47L38 -40L40 -20" fill="none" stroke={YELLOW} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M35 -22L45 -22L43 -10L37 -10Z" fill={YELLOW} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={0} cy={-47} r={3.5} fill={YELLOW} stroke={INK} strokeWidth={1.8} />
      </CatHead>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Давхар Хүчит Муур: flexing with a x2 badge                          */
/* ------------------------------------------------------------------ */
export function DoubleArt() {
  const f = FUR.gold;
  const id = useUid();
  const arm = (s: 1 | -1) => {
    const x = (v: number) => 100 + s * (v - 100);
    return (
      <g>
        <Tube d={`M${x(70)} 114L${x(36)} 118`} w={18} color={f.base} />
        <Tube d={`M${x(34)} 120L${x(31)} 86`} w={15} color={f.base} />
        <ellipse cx={x(52)} cy={106} rx={14} ry={11} fill={f.base} stroke={INK} strokeWidth={SW} />
        <path d={`M${x(46)} ${103}Q${x(52)} 98 ${x(58)} 103`} fill="none" stroke={f.light} strokeWidth={3} strokeLinecap="round" />
        <Paw x={x(31)} y={80} r={10} fill={f.base} rotate={s * -8} />
      </g>
    );
  };
  return (
    <g>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor="#bdf8ff" stopOpacity={1} />
          <stop offset="0.5" stopColor={CYAN} stopOpacity={0.6} />
          <stop offset="1" stopColor={CYAN} stopOpacity={0} />
        </radialGradient>
      </defs>
      <Glow cx={100} cy={108} r={96} opacity={0.55} />
      <Shadow cy={188} rx={50} />
      <ellipse cx={84} cy={184} rx={13} ry={7.5} fill={f.base} stroke={INK} strokeWidth={SW} />
      <ellipse cx={116} cy={184} rx={13} ry={7.5} fill={f.base} stroke={INK} strokeWidth={SW} />
      <Blob d="M64 106C70 100 130 100 136 106C140 132 128 156 122 180L78 180C72 156 60 132 64 106Z" fill={f.base} shade={f.shade}>
        <ellipse cx={100} cy={164} rx={17} ry={16} fill={f.light} />
        <path d="M78 116Q89 126 100 118Q111 126 122 116" fill="none" stroke={f.shade} strokeWidth={3} strokeLinecap="round" />
      </Blob>
      {arm(1)}
      {arm(-1)}
      <circle cx={100} cy={136} r={30} fill={`url(#${id})`} />
      <circle cx={100} cy={136} r={18} fill="#fff7c2" stroke={INK} strokeWidth={SW} />
      <circle cx={100} cy={136} r={14} fill="none" stroke={CYAN} strokeWidth={3} />
      <Glyph x={100} y={137} size={17} color="#c026d3" stroke={WHITE} sw={2}>
        ×2
      </Glyph>
      <CatHead
        fur={f}
        pattern="tabby"
        eyes={['open', 'happy']}
        brows="raised"
        mouth="grin"
        transform="translate(100 62) scale(0.84)"
      />
      <Sparkle x={20} y={40} r={9} color={YELLOW} outline />
      <Sparkle x={180} y={38} r={8} color={WHITE} outline />
      <Sparkle x={170} y={150} r={7} color={YELLOW} outline />
      <Sparkle x={28} y={152} r={6} color={WHITE} outline />
    </g>
  );
}
