// Where the game server lives (online rooms, classroom mode).
//   VITE_SERVER_URL unset        → same site (local dev, or the Node server serving this page)
//   VITE_SERVER_URL=off          → no server: computer and same-device games only
//   VITE_SERVER_URL=https://…    → separate server (the game pages are hosted elsewhere, e.g. cyber-math.com)

const raw = String(import.meta.env.VITE_SERVER_URL ?? '').trim();

export const ONLINE_ENABLED = raw.toLowerCase() !== 'off';

const SERVER_ORIGIN = raw && ONLINE_ENABLED ? raw.replace(/\/+$/, '') : location.origin;

/** True when the server is this page's own origin (local dev or the server-hosted build). */
export const SAME_ORIGIN_SERVER = SERVER_ORIGIN === location.origin;

export function wsUrl(): string {
  return `${SERVER_ORIGIN.replace(/^http/, 'ws')}/ws`;
}

export function apiUrl(path: string): string {
  return `${SERVER_ORIGIN}${path}`;
}

/** Address of this game page without query or file name, e.g. https://cyber-math.com/math-kittens/ */
export function pageBase(origin = location.origin): string {
  return `${origin}${location.pathname.replace(/[^/]*$/, '')}`;
}
