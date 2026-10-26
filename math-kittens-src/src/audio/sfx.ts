// All game sounds are synthesized with the Web Audio API (no audio files to load).

import { getPrefs } from '../store/prefs';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (getPrefs().muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Browsers only allow audio after a user gesture; call this from the first tap. */
export function unlockAudio() {
  audio();
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, slideTo?: number) {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.01, vol, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, delay = 0, q = 1) {
  const c = audio();
  if (!c || !master || !noiseBuf) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const bf = c.createBiquadFilter();
  bf.type = filter;
  bf.Q.value = q;
  bf.frequency.setValueAtTime(f0, t);
  bf.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  env(g, t, 0.008, vol, dur);
  src.connect(bf).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function meowAt(base: number, delay = 0, vol = 0.22) {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(base, t);
  o.frequency.linearRampToValueAtTime(base * 1.55, t + 0.14);
  o.frequency.linearRampToValueAtTime(base * 0.9, t + 0.42);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(900, t);
  f.frequency.linearRampToValueAtTime(1800, t + 0.15);
  f.frequency.linearRampToValueAtTime(700, t + 0.42);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.setValueAtTime(vol, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.5);
}

export const sfx = {
  click() {
    tone(660, 0.05, 'triangle', 0.18);
  },
  card() {
    noise(0.14, 0.35, 'bandpass', 2400, 900, 0, 1.2);
  },
  draw() {
    noise(0.1, 0.3, 'bandpass', 1200, 3200, 0, 1.4);
    noise(0.1, 0.22, 'bandpass', 1600, 3600, 0.08, 1.4);
  },
  shuffle() {
    for (let i = 0; i < 9; i++) noise(0.05, 0.22, 'bandpass', 2000 + i * 120, 1400, i * 0.045, 2);
  },
  fuse() {
    noise(1.3, 0.16, 'highpass', 5000, 7000, 0, 0.7);
  },
  explode() {
    noise(1.4, 0.9, 'lowpass', 3000, 60, 0, 0.6);
    tone(110, 0.8, 'sine', 0.7, 0, 28);
    tone(70, 1.1, 'triangle', 0.4, 0.05, 25);
    if (navigator.vibrate) navigator.vibrate([90, 40, 160]);
  },
  correct() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.18, 'triangle', 0.25, i * 0.075));
  },
  wrong() {
    tone(220, 0.22, 'sawtooth', 0.18, 0, 150);
    tone(160, 0.35, 'sawtooth', 0.18, 0.2, 100);
  },
  tick(urgent = false) {
    tone(urgent ? 1320 : 990, 0.035, 'square', urgent ? 0.1 : 0.06);
  },
  turn() {
    tone(784, 0.12, 'sine', 0.22);
    tone(1175, 0.2, 'sine', 0.2, 0.1);
  },
  steal() {
    noise(0.25, 0.3, 'bandpass', 600, 3800, 0, 2);
    tone(520, 0.12, 'square', 0.06, 0.12, 900);
  },
  attack() {
    noise(0.18, 0.5, 'lowpass', 1600, 200, 0, 1);
    tone(180, 0.18, 'square', 0.15, 0, 90);
  },
  reverse() {
    tone(400, 0.25, 'triangle', 0.18, 0, 800);
    tone(800, 0.25, 'triangle', 0.14, 0.15, 400);
  },
  future() {
    [880, 1108, 1318, 1760].forEach((f, i) => tone(f, 0.35, 'sine', 0.1, i * 0.06));
  },
  rescue() {
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.18, i * 0.06));
    noise(0.6, 0.08, 'highpass', 6000, 9000, 0.1);
  },
  eliminated() {
    tone(392, 0.32, 'sawtooth', 0.14, 0, 370);
    tone(370, 0.32, 'sawtooth', 0.14, 0.33, 349);
    tone(349, 0.32, 'sawtooth', 0.14, 0.66, 330);
    tone(330, 0.8, 'sawtooth', 0.14, 0.99, 220);
  },
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.12));
    [523.25, 659.25, 783.99].forEach((f) => tone(f, 0.9, 'sine', 0.14, 0.75));
    meowAt(620, 1.2);
  },
  meow() {
    meowAt(480 + Math.random() * 180);
  },
  challenge() {
    tone(660, 0.1, 'square', 0.08);
    tone(880, 0.1, 'square', 0.08, 0.1);
    tone(990, 0.18, 'square', 0.08, 0.2);
  },
  power() {
    tone(220, 0.5, 'sawtooth', 0.12, 0, 880);
    [880, 1320].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 0.45 + i * 0.08));
  },
};
