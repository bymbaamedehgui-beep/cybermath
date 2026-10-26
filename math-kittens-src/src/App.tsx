import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { GameSettings, SeatInfo } from '../shared/game/types';
import { unlockAudio } from './audio/sfx';
import { Background } from './fx/Background';
import { FxCanvas } from './fx/fx';
import { LocalGame } from './game/local';
import { ONLINE_ENABLED } from './net/config';
import { net, useNet } from './net/net';
import { OnlineGame } from './net/online';
import { GameScreen } from './screens/game/GameScreen';
import { MainMenu, type MenuTarget } from './screens/MainMenu';
import { CreateRoom, JoinRoom, Lobby } from './screens/Online';
import { RulesScreen } from './screens/Rules';
import { aiSeats, AiSetup, FriendsScreen } from './screens/Setup';
import { TeacherScreen } from './screens/teacher/Teacher';
import { getPrefs } from './store/prefs';

const ArtGallery = import.meta.env.DEV ? lazy(() => import('./art/ArtGallery')) : () => null;

type ScreenName = 'menu' | 'ai' | 'friends' | 'create' | 'join' | 'teacher' | 'rules' | 'game';

function readJoinParam(): string | null {
  if (!ONLINE_ENABLED) return null;
  const p = new URLSearchParams(location.search);
  const code = p.get('join');
  if (code) {
    p.delete('join');
    const q = p.toString();
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}`);
  }
  return code ? code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : null;
}

export function App() {
  const st = useNet();
  const [joinCode] = useState(readJoinParam);
  const [screen, setScreen] = useState<ScreenName>(joinCode ? 'join' : 'menu');
  const [local, setLocal] = useState<LocalGame | null>(null);
  const [hasSave, setHasSave] = useState(() => LocalGame.hasSave());
  const [notice, setNotice] = useState<string | null>(null);
  const online = useMemo(() => new OnlineGame(), []);
  const gallery = import.meta.env.DEV && new URLSearchParams(location.search).has('gallery');

  useEffect(() => {
    if (ONLINE_ENABLED && (net.hasSession() || net.state.teacher)) net.connect();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    if (!st.notice) return;
    setNotice(st.notice);
    net.clearNotice();
    setScreen('menu');
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [st.notice]);

  const startLocal = (kind: 'ai' | 'hotseat', seats: SeatInfo[], settings: GameSettings) => {
    local?.leave();
    LocalGame.clearSave();
    setLocal(LocalGame.start(kind, seats, settings));
    setScreen('game');
  };

  const onMenu = (t: MenuTarget) => {
    switch (t) {
      case 'continue': {
        const g = LocalGame.resume();
        if (g) {
          setLocal(g);
          setScreen('game');
        } else setHasSave(false);
        break;
      }
      case 'new': {
        const p = getPrefs();
        startLocal('ai', aiSeats(p.players, p.botLevel), p.settings);
        break;
      }
      default:
        setScreen(t);
    }
  };

  const toMenu = () => {
    setLocal(null);
    setHasSave(LocalGame.hasSave());
    setScreen('menu');
  };

  let content: JSX.Element;
  let key: string = screen;
  if (gallery) {
    key = 'gallery';
    content = (
      <Suspense fallback={null}>
        <div className="relative z-10 h-full overflow-y-auto">
          <ArtGallery />
        </div>
      </Suspense>
    );
  } else if (screen === 'game' && local) {
    key = 'local-game';
    content = <GameScreen controller={local} onExit={toMenu} />;
  } else if (st.session) {
    if (st.room && st.room.status !== 'lobby' && st.view) {
      key = `online-game-${st.room.code}`;
      content = <GameScreen controller={online} onExit={toMenu} />;
    } else {
      key = 'lobby';
      content = <Lobby onLeave={toMenu} />;
    }
  } else {
    switch (screen) {
      case 'ai':
        content = <AiSetup onBack={toMenu} onStart={(seats, settings) => startLocal('ai', seats, settings)} />;
        break;
      case 'friends':
        content = (
          <FriendsScreen
            onBack={toMenu}
            onStart={(seats, settings) => startLocal(seats.filter((s) => !s.isBot).length >= 2 ? 'hotseat' : 'ai', seats, settings)}
            onCreate={() => setScreen('create')}
            onJoin={() => setScreen('join')}
          />
        );
        break;
      case 'create':
        content = <CreateRoom onBack={toMenu} />;
        break;
      case 'join':
        content = <JoinRoom onBack={toMenu} initialCode={joinCode ?? undefined} />;
        break;
      case 'teacher':
        content = <TeacherScreen onBack={toMenu} />;
        break;
      case 'rules':
        content = <RulesScreen onBack={toMenu} />;
        break;
      default:
        key = 'menu';
        content = <MainMenu hasSave={hasSave} onSelect={onMenu} />;
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Background />
      <div key={key} className="screen-in relative z-10 h-full">
        {content}
      </div>
      {st.session && st.status === 'reconnecting' && (
        <div className="fixed left-1/2 top-[calc(8px+var(--safe-t))] z-[90] -translate-x-1/2 rounded-full bg-orange-500/90 px-4 py-1.5 text-sm font-black shadow-lg">
          📡 Холболт тасарлаа, дахин холбогдож байна…
        </div>
      )}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className="fixed left-1/2 top-[calc(12px+var(--safe-t))] z-[90] -translate-x-1/2 rounded-2xl bg-[#1b1035]/95 px-5 py-2.5 text-sm font-bold shadow-xl ring-1 ring-cyan-300/40"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
      <FxCanvas />
    </div>
  );
}
