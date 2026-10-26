import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { CARD_INFO, type Card } from '../../../shared/cards';
import { RESULT_MS } from '../../../shared/game/engine';
import type { GameEvent, GameView } from '../../../shared/game/types';
import { topicName } from '../../../shared/math/topics';
import { sfx } from '../../audio/sfx';
import { anchorPoint, fx } from '../../fx/fx';
import type { ActionInput, GameController } from '../../game/controller';
import { eventText, playerName, type Tone } from '../../game/text';
import { useNow } from '../../game/useNow';
import { setPrefs, usePrefs } from '../../store/prefs';
import { Button, Modal, Spinner } from '../../ui/ui';
import { RulesContent } from '../Rules';
import { FlyLayer, makeFlight, type Flight } from './FlyLayer';
import { GameOver } from './GameOver';
import { MathModal } from './MathModal';
import { DoubleModal, FutureModal, InsertModal, PassScreen, RescueModal, TargetPicker } from './Prompts';
import { Hand, PlayerBadge, TableCenter } from './Table';

type AnswerEvent = Extract<GameEvent, { type: 'answer' }>;

function useNarrow() {
  const q = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

function pendingOf(v: GameView): string | null {
  switch (v.phase.kind) {
    case 'turn':
      return v.currentId;
    case 'math':
    case 'rescue':
    case 'insert':
    case 'double':
      return v.phase.playerId;
    default:
      return null;
  }
}

export function GameScreen({ controller, onExit }: { controller: GameController; onExit: () => void }) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => controller.subscribe(force), [controller]);
  const [revealed, setRevealed] = useState<string | null>(null);
  const view = controller.view(controller.kind === 'hotseat' ? revealed : undefined);
  if (!view) {
    return (
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3">
        <Spinner className="h-10 w-10" />
        <div className="font-bold text-violet-100/80">Тоглоомд холбогдож байна…</div>
        <Button variant="ghost" onClick={onExit}>
          Гарах
        </Button>
      </div>
    );
  }
  return <Board controller={controller} view={view} revealed={revealed} setRevealed={setRevealed} onExit={onExit} />;
}

interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
}

let toastId = 1;

function Board({
  controller,
  view,
  revealed,
  setRevealed,
  onExit,
}: {
  controller: GameController;
  view: GameView;
  revealed: string | null;
  setRevealed: (id: string | null) => void;
  onExit: () => void;
}) {
  const prefs = usePrefs();
  const narrow = useNarrow();
  const hotseat = controller.kind === 'hotseat';
  const online = controller.kind === 'online';
  const humans = controller.humans();
  const getNow = useCallback(() => controller.now(), [controller]);
  const me = view.you;
  const meView = view.players.find((p) => p.id === me);
  const pending = pendingOf(view);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetCard, setTargetCard] = useState<Card | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [log, setLog] = useState<ToastItem[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rules, setRules] = useState(false);
  const [confirm, setConfirm] = useState<null | 'restart' | 'exit'>(null);
  const [result, setResult] = useState<AnswerEvent | null>(null);
  const [future, setFuture] = useState<Card[] | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [shaking, setShaking] = useState(false);
  const shake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 700);
  }, []);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [overOpen, setOverOpen] = useState(view.phase.kind === 'over');

  const viewRef = useRef(view);
  viewRef.current = view;

  const toast = useCallback((text: string, tone: Tone = 'info') => {
    const id = toastId++;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const fly = useCallback((f: Flight) => setFlights((fs) => [...fs, f]), []);
  const anchorOf = (id: string) => (id === viewRef.current.you ? 'hand' : `p-${id}`);

  // Hot-seat: hide the screen and stop the clock while the device changes hands.
  const needPass =
    hotseat && !!pending && humans.includes(pending) && pending !== revealed && view.phase.kind !== 'over' && !result;
  useEffect(() => {
    if (controller.kind === 'online') return;
    controller.setPaused?.(needPass || menu || rules);
  }, [controller, needPass, menu, rules]);

  // ---- react to new game events ----
  const seen = useRef<{ game: string; seq: number } | null>(null);
  useEffect(() => {
    const v = viewRef.current;
    const evs = v.events;
    let fresh: GameEvent[];
    if (!seen.current || seen.current.game !== v.gameId) {
      const now = getNow();
      fresh = seen.current ? evs : evs.filter((e) => now - e.at < 1500);
      if (seen.current) {
        setOverOpen(false);
        setResult(null);
        setFuture(null);
        setLog([]);
      }
    } else {
      const last = seen.current.seq;
      fresh = evs.filter((e) => e.seq > last);
    }
    seen.current = { game: v.gameId, seq: evs.length ? evs[evs.length - 1].seq : seen.current?.seq ?? 0 };
    for (const e of fresh) handleEvent(e, v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.gameId, view.version]);

  function handleEvent(e: GameEvent, v: GameView) {
    const t = eventText(e, v);
    if (t) {
      setLog((l) => [...l.slice(-119), { id: e.seq, text: t.text, tone: t.tone }]);
      const quiet = (e.type === 'turn' && e.playerId !== v.you) || (e.type === 'draw' && e.playerId !== v.you) || e.type === 'mathStart' || e.type === 'answer';
      if (!quiet && e.type !== 'turn') toast(t.text, t.tone);
    }
    switch (e.type) {
      case 'turn':
        if (e.playerId === v.you) {
          sfx.turn();
          setBanner(e.turnsRemaining > 1 ? `Таны ээлж! (×${e.turnsRemaining})` : 'Таны ээлж!');
          setTimeout(() => setBanner(null), 1300);
        }
        break;
      case 'play':
        sfx.card();
        fly(makeFlight(anchorOf(e.playerId), 'discard', e.card.type, { toDiscard: true }));
        if (e.card.type === 'attack') setTimeout(() => sfx.attack(), 250);
        if (e.card.type === 'challenge') setTimeout(() => sfx.challenge(), 250);
        if (e.card.type === 'double') setTimeout(() => sfx.power(), 250);
        break;
      case 'draw':
        sfx.draw();
        if (e.playerId !== v.you) fly(makeFlight('deck', anchorOf(e.playerId), null, { endScale: 0.5 }));
        break;
      case 'explodeDrawn': {
        sfx.fuse();
        setTimeout(() => {
          const c = anchorPoint('center');
          fx.explode(c.x, c.y - 60, 1.3);
          sfx.explode();
          shake();
        }, 380);
        break;
      }
      case 'answer': {
        setResult(e);
        setTimeout(() => setResult((r) => (r === e ? null : r)), RESULT_MS);
        if (e.correct) {
          sfx.correct();
          const c = anchorPoint('center');
          fx.mathBurst(c.x, c.y - 80);
        } else sfx.wrong();
        break;
      }
      case 'rescueUsed': {
        sfx.rescue();
        fly(makeFlight(anchorOf(e.playerId), 'discard', 'rescue', { toDiscard: true, duration: 0.7 }));
        const p = anchorPoint(anchorOf(e.playerId));
        fx.sparkle(p.x, p.y, '#34d399', 30);
        break;
      }
      case 'inserted':
        sfx.card();
        fly(makeFlight(anchorOf(e.playerId), 'deck', null, { endScale: 1, duration: 0.6 }));
        break;
      case 'eliminated': {
        const p = anchorPoint(anchorOf(e.playerId));
        fx.explode(p.x, p.y, 1);
        sfx.explode();
        shake();
        setTimeout(() => sfx.eliminated(), 500);
        break;
      }
      case 'future':
        sfx.future();
        if (e.playerId === v.you) setFuture(e.cards);
        break;
      case 'shuffle':
        sfx.shuffle();
        setShuffleKey((k) => k + 1);
        break;
      case 'steal':
        sfx.steal();
        fly(makeFlight(anchorOf(e.fromId), anchorOf(e.toId), e.card ? e.card.type : null, { endScale: 0.6, duration: 0.6 }));
        break;
      case 'reverse':
        sfx.reverse();
        break;
      case 'attack': {
        const p = anchorPoint(anchorOf(e.targetId));
        fx.sparkle(p.x, p.y, '#ff4d6d', 26);
        break;
      }
      case 'fizzle':
        sfx.wrong();
        break;
      case 'finalStage':
        sfx.fuse();
        break;
      case 'win':
        if (e.playerId === v.you || (hotseat && humans.includes(e.playerId))) {
          sfx.win();
          fx.confetti();
        } else {
          sfx.meow();
          fx.confetti(70);
        }
        setTimeout(() => setOverOpen(true), 1800);
        break;
    }
  }

  const send = useCallback(
    async (a: ActionInput) => {
      const err = await controller.send(a, hotseat ? (revealed ?? undefined) : undefined);
      if (err) toast(err, 'bad');
      return err;
    },
    [controller, hotseat, revealed, toast],
  );

  const resultActive = !!result;
  const myTurn = view.phase.kind === 'turn' && view.currentId === me && !!meView?.alive;
  const canAct = myTurn && !resultActive && !needPass;

  const playCard = (id: string) => {
    const c = view.hand.find((x) => x.id === id);
    if (!c) return;
    const info = CARD_INFO[c.type];
    if (!info.playable) {
      toast(c.type === 'rescue' ? 'Аврагч Муур тэсрэлтийн үед өөрөө ажиллана.' : 'Энэ картыг тоглох боломжгүй.');
      return;
    }
    if (!canAct) {
      toast('Таны ээлж биш байна.');
      return;
    }
    if (info.needsTarget) {
      setTargetCard(c);
      return;
    }
    setSelectedId(null);
    void send({ type: 'play', cardId: c.id });
  };

  const draw = () => {
    if (!canAct) return;
    setSelectedId(null);
    void send({ type: 'draw' });
  };

  // ---- status line ----
  const now = useNow(getNow, view.turnDeadline !== null && view.phase.kind === 'turn', 500);
  const who = (id: string | null) => playerName(view, id);
  let status = '';
  let sub: string | undefined;
  switch (view.phase.kind) {
    case 'turn':
      if (myTurn) {
        status = view.turnsRemaining > 1 ? `Таны ээлж — ${view.turnsRemaining} ээлж үлдлээ` : 'Таны ээлж!';
        sub = 'Карт тоглох эсвэл тавцангаас сугална уу';
      } else {
        status = `${who(view.currentId)} бодолхийлж байна…`;
        if (view.turnsRemaining > 1) sub = `${view.turnsRemaining} ээлж тоглоно`;
      }
      if (view.turnDeadline) sub = `${sub ? `${sub} · ` : ''}⏱ ${Math.max(0, Math.ceil((view.turnDeadline - now) / 1000))} с`;
      break;
    case 'math':
      status = `${who(view.phase.playerId)} бодлого бодож байна…`;
      break;
    case 'insert':
      status = view.phase.playerId === me ? 'Тэсрэх муурыг нуух байраа сонго' : `${who(view.phase.playerId)} тэсрэх муурыг нууж байна 🤫`;
      break;
    case 'rescue':
      status = `${who(view.phase.playerId)} Аврагч Муураа дуудаж байна…`;
      break;
    case 'double':
      status = `${who(view.phase.playerId)} нэмэлт үйлдлээ сонгож байна`;
      break;
    case 'over':
      status = 'Тоглоом дууслаа';
      break;
  }

  const ph = view.phase;
  const mathPhase = ph.kind === 'math' ? ph : null;
  const selected = view.hand.find((c) => c.id === selectedId) ?? null;
  const opponents = view.players.filter((p) => p.id !== me);
  const pendingDiscard = flights.filter((f) => f.toDiscard).length;
  const settings = view.settings;
  const timeLabel = settings.timeLimit === 'auto' ? 'автомат' : `${settings.timeLimit} с`;

  return (
    <div className={`relative z-10 flex h-full flex-col overflow-hidden ${shaking ? 'shake' : ''}`}>
      {/* top bar */}
      <div className="flex items-center gap-2 px-2 pt-[calc(8px+var(--safe-t))] sm:px-4">
        <Button variant="ghost" size="sm" onClick={() => setMenu(true)} className="!min-h-10 !px-3" title="Цэс">
          ☰
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-cyan-200">{controller.label()}</span>
          <span className="hidden truncate rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-violet-100/85 sm:inline">
            {topicName(settings.topic)} · {settings.grade}-р анги · {timeLabel}
          </span>
          {view.finalStage && (
            <span className="shrink-0 animate-pulse rounded-full bg-rose-600/80 px-3 py-1 text-xs font-black">⚠️ Сүүлчийн шат</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowLog((s) => !s)} className="!min-h-10 !px-3" title="Тэмдэглэл">
          📜
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPrefs({ muted: !prefs.muted })} className="!min-h-10 !px-3" title="Дуу">
          {prefs.muted ? '🔇' : '🔊'}
        </Button>
      </div>

      {/* opponents */}
      <div
        className={narrow ? 'grid gap-1.5 px-2 py-2' : 'flex justify-center gap-2 px-4 py-2'}
        style={narrow ? { gridTemplateColumns: `repeat(${Math.max(opponents.length, 2)}, minmax(0, 1fr))` } : undefined}
      >
        {opponents.map((p) => (
          <PlayerBadge
            key={p.id}
            p={p}
            current={view.currentId === p.id && view.phase.kind !== 'over'}
            pending={pending === p.id}
            turns={view.turnsRemaining}
            stacked={narrow}
          />
        ))}
      </div>

      {/* table */}
      <div className="relative min-h-0 flex-1">
        <TableCenter
          view={view}
          pendingDiscard={pendingDiscard}
          shuffleKey={shuffleKey}
          canDraw={canAct}
          onDraw={draw}
          status={status}
          sub={sub}
        />
        <AnimatePresence>
          {banner && (
            <motion.div
              key="banner"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.4, opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="neon-text rounded-3xl bg-[#1b1035]/70 px-6 py-3 text-3xl font-black text-cyan-100 sm:text-5xl">{banner}</div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* toasts */}
        <div className="pointer-events-none absolute inset-x-0 top-1 z-30 flex flex-col items-center gap-1.5 px-3">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ y: -12, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`max-w-md rounded-2xl border px-3.5 py-1.5 text-center text-sm font-bold shadow-xl backdrop-blur ${
                  t.tone === 'bad'
                    ? 'border-rose-400/60 bg-rose-600/35'
                    : t.tone === 'good'
                      ? 'border-emerald-300/60 bg-emerald-600/30'
                      : t.tone === 'warn'
                        ? 'border-orange-300/60 bg-orange-500/25'
                        : 'border-cyan-300/30 bg-[#1b1035]/85'
                }`}
              >
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {/* log drawer */}
        <AnimatePresence>
          {showLog && (
            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              className="glass thin-scroll absolute bottom-2 right-2 top-2 z-40 w-[min(320px,86vw)] overflow-y-auto rounded-2xl p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-black">📜 Тоглолтын тэмдэглэл</span>
                <button type="button" className="text-xl" onClick={() => setShowLog(false)}>
                  ✕
                </button>
              </div>
              <div className="flex flex-col-reverse gap-1">
                {log.map((l) => (
                  <div
                    key={l.id}
                    className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                      l.tone === 'bad' ? 'bg-rose-500/15' : l.tone === 'good' ? 'bg-emerald-500/15' : l.tone === 'warn' ? 'bg-orange-500/12' : 'bg-white/5'
                    }`}
                  >
                    {l.text}
                  </div>
                ))}
                {log.length === 0 && <div className="text-sm text-violet-200/60">Одоогоор юу ч болоогүй байна.</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* my area */}
      {meView ? (
        <div className="relative z-20 px-2 pb-[calc(6px+var(--safe-b))] sm:px-4">
          <AnimatePresence>
            {selected && (
              <motion.div
                key={selected.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="absolute bottom-[calc(var(--card-h)+76px)] left-1/2 z-30 w-[min(420px,94vw)] -translate-x-1/2 rounded-2xl border border-violet-300/30 bg-[#1d1142]/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-black" style={{ color: CARD_INFO[selected.type].color2 }}>
                      {CARD_INFO[selected.type].name}
                    </div>
                    <div className="text-sm font-semibold leading-snug text-violet-100/90">{CARD_INFO[selected.type].desc}</div>
                  </div>
                  <button type="button" className="text-xl text-violet-200/70" onClick={() => setSelectedId(null)} aria-label="Хаах">
                    ✕
                  </button>
                </div>
                {CARD_INFO[selected.type].playable ? (
                  <Button className="mt-2 w-full" onClick={() => playCard(selected.id)} disabled={!canAct}>
                    {canAct ? '▶ Тоглох' : 'Ээлжээ хүлээнэ үү'}
                  </Button>
                ) : (
                  <div className="mt-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-center text-sm font-bold text-emerald-200">
                    🛡️ Тэсрэлтийн үед автоматаар хамгаална
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mb-1 flex items-center gap-2">
            <PlayerBadge p={meView} current={view.currentId === me && view.phase.kind !== 'over'} pending={pending === me} turns={view.turnsRemaining} />
            <div className="flex-1" />
            <Button size="md" onClick={draw} disabled={!canAct} className={canAct ? 'pulse-ring' : ''}>
              🃏 Карт сугалах
            </Button>
          </div>
          {meView.alive ? (
            <Hand cards={view.hand} selectedId={selectedId} onSelect={setSelectedId} onPlay={playCard} active={canAct} />
          ) : (
            <div className="flex h-[calc(var(--card-h)+22px)] items-center justify-center text-center font-black text-rose-200">
              💀 Та хасагдлаа. Бусдын тоглолтыг үзэж байна…
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pb-[calc(10px+var(--safe-b))] pt-2 text-center text-sm font-bold text-violet-200/70">
          {hotseat ? 'Компьютерийн ээлж…' : '👀 Та тоглолтыг ажиглаж байна'}
        </div>
      )}

      <FlyLayer flights={flights} onDone={(id) => setFlights((fs) => fs.filter((f) => f.id !== id))} />

      <MathModal
        view={view}
        phase={mathPhase}
        result={result}
        getNow={getNow}
        onAnswer={(choice) => send({ type: 'answer', choice })}
      />

      {ph.kind === 'insert' && ph.playerId === me && !resultActive && !needPass && (
        <InsertModal
          key={`ins-${ph.deadline}`}
          open
          deckCount={view.deckCount}
          deadline={ph.deadline}
          getNow={getNow}
          onConfirm={(position) => void send({ type: 'insert', position })}
        />
      )}
      {ph.kind === 'rescue' && ph.playerId === me && !resultActive && !needPass && (
        <RescueModal key={`res-${ph.deadline}`} open deadline={ph.deadline} getNow={getNow} onUse={() => void send({ type: 'useRescue' })} />
      )}
      {ph.kind === 'double' && ph.playerId === me && !resultActive && !needPass && (
        <DoubleModal
          key={`dbl-${ph.deadline}`}
          open
          view={view}
          deadline={ph.deadline}
          getNow={getNow}
          onChoose={(choice, targetId) => void send({ type: 'doubleChoice', choice, targetId })}
        />
      )}
      <TargetPicker
        open={!!targetCard}
        view={view}
        cardType={targetCard?.type ?? null}
        onCancel={() => setTargetCard(null)}
        onPick={(targetId) => {
          const c = targetCard;
          setTargetCard(null);
          setSelectedId(null);
          if (c) void send({ type: 'play', cardId: c.id, targetId });
        }}
      />
      <FutureModal cards={future} onClose={() => setFuture(null)} />

      <GameOver
        open={overOpen && view.phase.kind === 'over'}
        view={view}
        canRematch={controller.isHost()}
        onRematch={() => {
          setOverOpen(false);
          controller.rematch();
        }}
        onExit={() => {
          controller.leave();
          onExit();
        }}
      />

      {needPass && (
        <PassScreen
          player={view.players.find((p) => p.id === pending)}
          onReady={() => {
            setSelectedId(null);
            setRevealed(pending);
          }}
        />
      )}

      {/* menu */}
      <Modal open={menu} onClose={() => setMenu(false)} z="z-[66]" className="max-w-sm">
        <h2 className="mb-4 text-center text-2xl font-black">Цэс</h2>
        <div className="grid gap-2">
          <Button variant="neon" onClick={() => setMenu(false)}>
            ▶ Үргэлжлүүлэх
          </Button>
          {controller.isHost() && (
            <Button variant="ghost" onClick={() => setConfirm('restart')}>
              🔁 Дахин эхлүүлэх
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setMenu(false);
              setRules(true);
            }}
          >
            📖 Дүрэм
          </Button>
          <Button variant="ghost" onClick={() => setPrefs({ muted: !prefs.muted })}>
            {prefs.muted ? '🔇 Дуу унтраалттай' : '🔊 Дуу асаалттай'}
          </Button>
          <Button variant="danger" onClick={() => setConfirm('exit')}>
            🏠 Үндсэн цэс рүү гарах
          </Button>
        </div>
        {!online && <p className="mt-3 text-center text-xs font-semibold text-violet-200/65">Цэс нээлттэй үед цаг зогсоно. Гарсан ч тоглоом хадгалагдана.</p>}
      </Modal>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} z="z-[67]" className="max-w-sm">
        <h2 className="text-center text-xl font-black">
          {confirm === 'restart' ? 'Шинээр эхлүүлэх үү?' : online ? 'Өрөөнөөс гарах уу?' : 'Үндсэн цэс рүү гарах уу?'}
        </h2>
        <p className="mt-2 text-center text-sm font-semibold text-violet-100/80">
          {confirm === 'restart'
            ? 'Одоогийн тоглоом дуусч, ижил тоглогчидтой шинэ тоглоом эхэлнэ.'
            : online
              ? 'Тоглоом үргэлжилж байвал та хасагдана.'
              : 'Тоглоом хадгалагдах тул дараа нь “Үргэлжлүүлэх”-ээр буцаж болно.'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Үгүй
          </Button>
          <Button
            variant={confirm === 'exit' ? 'danger' : 'primary'}
            onClick={() => {
              const c = confirm;
              setConfirm(null);
              setMenu(false);
              if (c === 'restart') controller.rematch();
              else {
                controller.leave();
                onExit();
              }
            }}
          >
            Тийм
          </Button>
        </div>
      </Modal>

      <Modal open={rules} onClose={() => setRules(false)} z="z-[66]" className="max-w-3xl">
        <RulesContent />
        <Button variant="neon" className="mt-4 w-full" onClick={() => setRules(false)}>
          Ойлголоо
        </Button>
      </Modal>
    </div>
  );
}
