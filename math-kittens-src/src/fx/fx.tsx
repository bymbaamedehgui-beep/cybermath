// Full-screen particle layer: explosions, confetti, sparkles and flying math symbols.

import { useEffect, useRef } from 'react';

type Shape = 'circle' | 'rect' | 'star' | 'text' | 'ring' | 'smoke';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: Shape;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
  text?: string;
  sway?: number;
}

const particles: Particle[] = [];
let wake: (() => void) | null = null;
const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function add(p: Partial<Particle> & { x: number; y: number }) {
  particles.push({
    vx: 0,
    vy: 0,
    life: 0,
    max: 1,
    size: 6,
    color: '#fff',
    shape: 'circle',
    rot: Math.random() * Math.PI * 2,
    vr: 0,
    gravity: 0,
    drag: 0.98,
    ...p,
  });
}

const FIRE = ['#fff3b0', '#ffd23f', '#ff9f1c', '#ff6b35', '#ff4d6d', '#e11d48'];
const CONFETTI = ['#22e5ff', '#ff9f1c', '#ff4d9d', '#a3ff6b', '#c084fc', '#facc15', '#ffffff'];
const SYMBOLS = ['+', '−', '×', '÷', '=', 'π', '√', 'x', 'y', '%', '²', '∑'];
const n = (k: number) => Math.round(reduced ? k * 0.3 : k);

export const fx = {
  explode(x: number, y: number, scale = 1) {
    add({ x, y, shape: 'ring', size: 10, max: 0.6, color: '#ffd23f' });
    add({ x, y, shape: 'ring', size: 4, max: 0.9, color: '#ff4d6d' });
    for (let i = 0; i < n(90); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (3 + Math.random() * 11) * scale;
      add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        max: 0.6 + Math.random() * 0.8,
        size: 3 + Math.random() * 7 * scale,
        color: FIRE[Math.floor(Math.random() * FIRE.length)],
        shape: Math.random() < 0.25 ? 'star' : 'circle',
        gravity: 0.12,
        drag: 0.93,
        vr: (Math.random() - 0.5) * 0.4,
      });
    }
    for (let i = 0; i < n(18); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        max: 0.9 + Math.random() * 0.5,
        size: 18 + Math.random() * 26 * scale,
        color: 'rgba(80,60,110,',
        shape: 'smoke',
        gravity: -0.03,
        drag: 0.96,
      });
    }
    for (let i = 0; i < n(14); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 7;
      add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        max: 1.1,
        size: 16 + Math.random() * 12,
        color: FIRE[2 + Math.floor(Math.random() * 3)],
        shape: 'text',
        text: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        gravity: 0.15,
        drag: 0.95,
        vr: (Math.random() - 0.5) * 0.3,
      });
    }
    wake?.();
  },
  confetti(count = 170) {
    const w = window.innerWidth;
    for (let i = 0; i < n(count); i++) {
      add({
        x: Math.random() * w,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 3,
        max: 3 + Math.random() * 2,
        size: 6 + Math.random() * 7,
        color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        shape: Math.random() < 0.2 ? 'star' : 'rect',
        gravity: 0.05,
        drag: 0.99,
        vr: (Math.random() - 0.5) * 0.3,
        sway: Math.random() * Math.PI * 2,
      });
    }
    wake?.();
  },
  burstConfetti(x: number, y: number) {
    for (let i = 0; i < n(70); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 5 + Math.random() * 9;
      add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        max: 1.6 + Math.random(),
        size: 5 + Math.random() * 6,
        color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        shape: Math.random() < 0.3 ? 'star' : 'rect',
        gravity: 0.22,
        drag: 0.97,
        vr: (Math.random() - 0.5) * 0.4,
        sway: Math.random() * 6,
      });
    }
    wake?.();
  },
  sparkle(x: number, y: number, color = '#22e5ff', count = 22) {
    for (let i = 0; i < n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 5;
      add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        max: 0.6 + Math.random() * 0.6,
        size: 4 + Math.random() * 6,
        color: Math.random() < 0.3 ? '#ffffff' : color,
        shape: 'star',
        drag: 0.92,
        vr: 0.2,
      });
    }
    wake?.();
  },
  mathBurst(x: number, y: number, color = '#a3ff6b') {
    for (let i = 0; i < n(16); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 2,
        max: 1 + Math.random() * 0.5,
        size: 18 + Math.random() * 14,
        color,
        shape: 'text',
        text: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        gravity: 0.08,
        drag: 0.95,
        vr: (Math.random() - 0.5) * 0.2,
      });
    }
    wake?.();
  },
};

function drawStar(c: CanvasRenderingContext2D, r: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

export function FxCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const c = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let running = false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const k = dt * 60;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.max) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * k;
        p.vx *= Math.pow(p.drag, k);
        p.vy *= Math.pow(p.drag, k);
        if (p.sway !== undefined) {
          p.sway += dt * 4;
          p.x += Math.sin(p.sway) * 0.8 * k;
        }
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.rot += p.vr * k;
        const f = 1 - p.life / p.max;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        switch (p.shape) {
          case 'circle':
            c.globalAlpha = Math.min(1, f * 1.5);
            c.fillStyle = p.color;
            c.beginPath();
            c.arc(0, 0, p.size * (0.4 + f * 0.6), 0, Math.PI * 2);
            c.fill();
            break;
          case 'smoke':
            c.fillStyle = `${p.color}${(0.35 * f).toFixed(3)})`;
            c.beginPath();
            c.arc(0, 0, p.size * (1.4 - f * 0.6), 0, Math.PI * 2);
            c.fill();
            break;
          case 'rect':
            c.globalAlpha = Math.min(1, f * 3);
            c.fillStyle = p.color;
            c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            break;
          case 'star':
            c.globalAlpha = Math.min(1, f * 2);
            c.fillStyle = p.color;
            drawStar(c, p.size);
            break;
          case 'ring': {
            const r = p.size + (1 - f) * 220;
            c.globalAlpha = f;
            c.strokeStyle = p.color;
            c.lineWidth = 10 * f + 1;
            c.beginPath();
            c.arc(0, 0, r, 0, Math.PI * 2);
            c.stroke();
            break;
          }
          case 'text':
            c.globalAlpha = Math.min(1, f * 2);
            c.fillStyle = p.color;
            c.font = `900 ${p.size}px Nunito Variable, Nunito, sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(p.text ?? '+', 0, 0);
            break;
        }
        c.restore();
      }
      if (particles.length > 0) raf = requestAnimationFrame(frame);
      else running = false;
    };
    wake = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      wake = null;
    };
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />;
}

/** Center of an element with data-anchor="name", or the screen center. */
export function anchorPoint(name: string): { x: number; y: number } {
  const el = document.querySelector(`[data-anchor="${name}"]`);
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
