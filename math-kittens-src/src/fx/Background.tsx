// Slow drifting stars and faint math symbols behind every screen.

import { useEffect, useRef } from 'react';

const GLYPHS = ['+', '−', '×', '÷', '=', 'π', '√', 'x', 'y', '%', '∞', '²', '∑', '≤', '½'];

export function Background() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const c = canvas.getContext('2d')!;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const stars = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.4 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));
    const glyphs = Array.from({ length: 22 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 14 + Math.random() * 30,
      v: 0.004 + Math.random() * 0.01,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.004,
      g: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      hue: Math.random() < 0.5 ? '34,229,255' : Math.random() < 0.5 ? '255,159,28' : '196,148,255',
      a: 0.05 + Math.random() * 0.08,
    }));
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 40) return; // ~25 fps is plenty for a background
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.tw += dt * 1.5;
        c.globalAlpha = 0.35 + 0.35 * Math.sin(s.tw);
        c.fillStyle = '#e9e1ff';
        c.beginPath();
        c.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        c.fill();
      }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const g of glyphs) {
        if (!reduced) {
          g.y -= g.v * dt;
          g.rot += g.vr;
          if (g.y < -0.08) {
            g.y = 1.08;
            g.x = Math.random();
          }
        }
        c.save();
        c.translate(g.x * w, g.y * h);
        c.rotate(g.rot);
        c.globalAlpha = 1;
        c.fillStyle = `rgba(${g.hue},${g.a})`;
        c.font = `900 ${g.s}px Nunito Variable, Nunito, sans-serif`;
        c.fillText(g.g, 0, 0);
        c.restore();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return (
    <div className="app-bg pointer-events-none fixed inset-0 -z-0">
      <canvas ref={ref} className="h-full w-full" />
    </div>
  );
}
