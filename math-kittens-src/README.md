# Математик Муурнууд (Math Kittens)

A multiplayer math card battle game for grades 6–12. All in-game text is Mongolian.
Draw a **Тэсрэх Муур** (bomb cat) and you must solve a timed problem to survive.

Default settings: **grade 9 · Шугаман тэгшитгэлийн систем · 20 seconds per problem · 4 players**
(change them in **Багшийн тохиргоо**).

## Run it

```bash
npm install
npm run dev        # game server on :8787 + web app on http://localhost:5173
```

Other devices on the same Wi-Fi open `http://<this-computer's-IP>:5173`. The lobby and the
classroom screen show the right address and a QR code automatically.

Production (one process serves the app and the WebSocket on the same port):

```bash
npm run build
npm start          # http://localhost:8787  (PORT env var to change)
```

Rooms, classrooms and results are saved to `data/state.json`, so a server restart does not
lose running games. Offline games are saved in the browser and continue after a reload.

To host it on the internet, deploy the repository to any Node host that supports WebSockets
(Render, Railway, Fly.io, a VPS, or the included `Dockerfile`). Static hosts such as Vercel
cannot run the WebSocket server.

## Modes

- **Шинэ тоглоом / Компьютертэй тоглох** — you against 1–4 computer cats (easy / medium / strong).
- **Найзуудтайгаа тоглох** — pass-and-play on one device (hands are hidden between turns), or online rooms.
- **Өрөө үүсгэх / Өрөөнд нэгдэх** — online room with a 6-character code; play from separate devices.
- **Багшийн тохиргоо** — grade, topic, difficulty, time limit, custom questions (CSV import/export),
  classroom mode (one code for the whole class, students are seated at tables automatically,
  live scores / accuracy / response times, CSV export), and results of games on this device.

## How it is built

- `shared/game` — the rules engine (pure TypeScript), computer players, and per-player views that
  hide other hands, the deck order, where a bomb was hidden, and the answer of a running problem.
- `shared/math` — problem generators for 11 topics × grades 6–12 × 3 difficulties; 4 choices,
  exactly one correct.
- `server` — WebSocket server. It is authoritative: clients only send intentions, and the server
  validates every move, keeps all timers, and plays for disconnected players.
- `src` — React + Tailwind client, canvas particle effects, Web Audio sound effects, SVG artwork.

```bash
npm test           # engine simulations, math validity, server rooms/classrooms
npm run typecheck
```

## On cyber-math.com

This folder is the source; the built game lives in `../math-kittens/` and is served at
**cyber-math.com/math-kittens/** (card «Математик Муурнууд» in the game hub, `index.html`).

```bash
npm install
npm run build:cybermath   # rebuilds ../math-kittens/ — commit both folders
```

Online rooms and classroom mode need the Node server from this folder running on a host with
WebSockets (Vercel can't). On Render: New → Web Service → this repository, Root Directory
`math-kittens-src`, build `npm ci --include=dev && npm run build`, start `npm start`.
Then put its address in `.env.cybermath` (`VITE_SERVER_URL=https://…`) and rebuild.
Until then `.env.cybermath` says `off`, and the cyber-math.com copy shows only the computer
and same-device modes.
