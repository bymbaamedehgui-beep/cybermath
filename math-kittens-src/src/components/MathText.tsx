import { useId } from 'react';
import type { GraphSpec, PublicQuestion } from '../../shared/math/types';

export function QuestionBody({ q, compact = false }: { q: PublicQuestion; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className={`${compact ? 'text-base' : 'text-lg sm:text-xl'} whitespace-pre-line font-extrabold leading-snug text-white`}>
        {q.text}
      </p>
      {q.lines && q.lines.length > 0 && (
        <div className="flex items-stretch gap-2 rounded-2xl bg-black/30 px-4 py-2.5">
          {q.system && <Brace />}
          <div className="flex flex-col items-start justify-center gap-1">
            {q.lines.map((l, i) => (
              <span
                key={i}
                className={`${compact ? 'text-lg' : 'text-xl sm:text-2xl'} whitespace-nowrap font-black tracking-wide text-cyan-100 [font-variant-numeric:tabular-nums]`}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
      {q.graph && <Graph spec={q.graph} size={compact ? 150 : 210} />}
    </div>
  );
}

function Brace() {
  return (
    <svg viewBox="0 0 20 100" preserveAspectRatio="none" className="w-4 shrink-0 self-stretch text-cyan-300">
      <path
        d="M17 2 C 8 2, 10 14, 10 30 C 10 42, 8 48, 3 50 C 8 52, 10 58, 10 70 C 10 86, 8 98, 17 98"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Graph({ spec, size = 210 }: { spec: GraphSpec; size?: number }) {
  const clipId = `gc${useId().replace(/:/g, '')}`;
  const [x0, x1] = spec.xRange ?? [-6, 6];
  const [y0, y1] = spec.yRange ?? [-6, 6];
  const W = 240;
  const H = 240;
  const pad = 14;
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0)) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - y0) / (y1 - y0)) * (H - 2 * pad);
  const xs: number[] = [];
  for (let x = Math.ceil(x0); x <= x1; x++) xs.push(x);
  const ys: number[] = [];
  for (let y = Math.ceil(y0); y <= y1; y++) ys.push(y);
  const step = x1 - x0 > 14 ? 2 : 1;

  let path = '';
  const f =
    spec.kind === 'line'
      ? (x: number) => (spec.m ?? 0) * x + (spec.b ?? 0)
      : spec.kind === 'parabola'
        ? (x: number) => (spec.a ?? 1) * (x - (spec.h ?? 0)) ** 2 + (spec.k ?? 0)
        : null;
  if (f) {
    const N = 160;
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const y = f(x);
      if (y < y0 - 1 || y > y1 + 1) {
        pen = false;
        continue;
      }
      path += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(Math.max(y0 - 1, Math.min(y1 + 1, y))).toFixed(1)} `;
      pen = true;
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={size} height={size} className="rounded-2xl bg-[#0d0824]/90 ring-1 ring-cyan-300/25">
      <defs>
        <clipPath id={clipId}>
          <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} />
        </clipPath>
      </defs>
      {xs.map((x) => (
        <line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={pad} y2={H - pad} stroke="rgba(167,139,250,0.16)" strokeWidth={1} />
      ))}
      {ys.map((y) => (
        <line key={`gy${y}`} y1={sy(y)} y2={sy(y)} x1={pad} x2={W - pad} stroke="rgba(167,139,250,0.16)" strokeWidth={1} />
      ))}
      {x0 <= 0 && x1 >= 0 && <line x1={sx(0)} x2={sx(0)} y1={pad} y2={H - pad} stroke="#c4b5fd" strokeWidth={1.6} />}
      {y0 <= 0 && y1 >= 0 && <line y1={sy(0)} y2={sy(0)} x1={pad} x2={W - pad} stroke="#c4b5fd" strokeWidth={1.6} />}
      {xs
        .filter((x) => x !== 0 && x % step === 0)
        .map((x) => (
          <text key={`tx${x}`} x={sx(x)} y={Math.min(H - 3, sy(0) + 11)} fontSize="8.5" fill="#c4b5fd" textAnchor="middle" fontWeight="700">
            {x < 0 ? `−${-x}` : x}
          </text>
        ))}
      {ys
        .filter((y) => y !== 0 && y % step === 0)
        .map((y) => (
          <text key={`ty${y}`} x={Math.max(10, sx(0) - 4)} y={sy(y) + 3} fontSize="8.5" fill="#c4b5fd" textAnchor="end" fontWeight="700">
            {y < 0 ? `−${-y}` : y}
          </text>
        ))}
      <text x={W - pad + 2} y={sy(0) - 4} fontSize="10" fill="#e9e1ff" fontWeight="900" textAnchor="end">
        x
      </text>
      <text x={sx(0) + 5} y={pad + 8} fontSize="10" fill="#e9e1ff" fontWeight="900">
        y
      </text>
      {path && (
        <path d={path} clipPath={`url(#${clipId})`} fill="none" stroke="#22e5ff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {(spec.points ?? []).map(([px, py], i) => (
        <circle key={i} cx={sx(px)} cy={sy(py)} r={4.5} fill="#ff9f1c" stroke="#1b1035" strokeWidth={1.5} />
      ))}
    </svg>
  );
}
