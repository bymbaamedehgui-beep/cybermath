/** Coat colors for one cat. */
export interface Fur {
  /** Main fur color. */
  base: string;
  /** Cel-shade tone (lower-right crescent). */
  shade: string;
  /** Muzzle / belly / highlight tone. */
  light: string;
  /** Stripes, points or first patch color. */
  stripe?: string;
  /** Second patch color (calico). */
  patch?: string;
  /** Inner-ear pink. */
  ear: string;
  /** Outer ear colors when they differ from `base`. */
  earL?: string;
  earR?: string;
  /** Iris color. */
  iris: string;
  /** Brow color (lighter on dark cats so brows stay readable). */
  brow?: string;
}

export const FUR = {
  charcoal: { base: '#5e5a7c', shade: '#47435f', light: '#9893b8', stripe: '#46415f', ear: '#ff9ec0', iris: '#ffd23f', brow: '#2a2245' },
  ginger: { base: '#ffa54f', shade: '#ef8430', light: '#ffe6c2', stripe: '#dc6d1f', ear: '#ff9ec0', iris: '#55d66b' },
  cream: { base: '#fff5e6', shade: '#efdcc6', light: '#ffffff', stripe: '#f3d2ad', ear: '#ffa9c6', iris: '#5ab4ff' },
  gray: { base: '#bcb7d0', shade: '#9b95b4', light: '#efeef7', stripe: '#7c7698', ear: '#ff9ec0', iris: '#ffc23d' },
  calico: { base: '#fffaf1', shade: '#ece0cd', light: '#ffffff', stripe: '#ff9a3d', patch: '#3f3856', ear: '#ffa9c6', earL: '#ff9a3d', earR: '#3f3856', iris: '#f7a623' },
  siamese: { base: '#f7e9d3', shade: '#e6d1b0', light: '#fff9ee', stripe: '#9a6b52', patch: '#5e4034', ear: '#e3a3ad', earL: '#5e4034', earR: '#5e4034', iris: '#47b2ff' },
  tuxedo: { base: '#3b3556', shade: '#2c2745', light: '#ffffff', ear: '#ff9ec0', iris: '#7ee06b', brow: '#a59fd0' },
  black: { base: '#3d3759', shade: '#2d2846', light: '#6f6894', ear: '#ff9ec0', iris: '#c6f23f', brow: '#a59fd0' },
  white: { base: '#ffffff', shade: '#e2dcf2', light: '#ffffff', ear: '#ffa9c6', iris: '#4aa8ff' },
  sandy: { base: '#efc27f', shade: '#d9a460', light: '#fff1d9', stripe: '#b8783c', ear: '#ff9ec0', iris: '#8bd450' },
  blue: { base: '#95a9d3', shade: '#778dbb', light: '#e2eaf9', stripe: '#7086b5', ear: '#ffa3c4', iris: '#ffcf3d' },
  gold: { base: '#ffcb4f', shade: '#f2a92c', light: '#fff2c8', stripe: '#e3891f', ear: '#ff9ec0', iris: '#38c7ff' },
  peach: { base: '#ffd8b0', shade: '#f5bb88', light: '#fff4e6', stripe: '#f39a5b', ear: '#ff9ec0', iris: '#c77dff' },
} satisfies Record<string, Fur>;
