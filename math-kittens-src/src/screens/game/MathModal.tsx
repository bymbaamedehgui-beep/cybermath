import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { CARD_INFO } from '../../../shared/cards';
import type { GameEvent, GameView, PhaseView } from '../../../shared/game/types';
import type { PublicQuestion } from '../../../shared/math/types';
import { topicName } from '../../../shared/math/topics';
import { sfx } from '../../audio/sfx';
import { QuestionBody } from '../../components/MathText';
import { CardFace } from '../../components/GameCard';
import { playerName } from '../../game/text';
import { useNow } from '../../game/useNow';

type MathPhase = Extract<PhaseView, { kind: 'math' }>;
type AnswerEvent = Extract<GameEvent, { type: 'answer' }>;

const LETTERS = ['A', 'B', 'C', 'D'];
const CHOICE_COLORS = [
  'from-cyan-400/90 to-cyan-600/90 ring-cyan-200/60',
  'from-orange-400/90 to-orange-600/90 ring-orange-200/60',
  'from-pink-400/90 to-fuchsia-600/90 ring-pink-200/60',
  'from-lime-400/90 to-emerald-600/90 ring-lime-200/60',
];

function header(purpose: MathPhase['purpose'], view: GameView, phase: { playerId: string; sourceId: string; cardType?: string }, mine: boolean) {
  const who = playerName(view, phase.playerId);
  switch (purpose) {
    case 'explode':
      return {
        title: '💣 ТЭСРЭХ МУУР!',
        sub: mine ? 'Зөв бодвол амьд үлдэнэ!' : `${who} амь тэмцэн бодож байна`,
        color: 'text-rose-300',
      };
    case 'challenge':
      return {
        title: '🎯 СОРИЛТ!',
        sub: mine
          ? `${playerName(view, phase.sourceId)} танд бодлого илгээлээ. Зөв бол түүнээс карт авна, буруу бол картаа алдана.`
          : `${playerName(view, phase.sourceId)} → ${who}: сорилтын бодлого`,
        color: 'text-orange-300',
      };
    case 'double':
      return {
        title: '⚡ ДАВХАР ХҮЧ',
        sub: mine ? 'Зөв бодвол нэмэлт үйлдэл хийнэ!' : `${who} давхар хүчний бодлого бодож байна`,
        color: 'text-fuchsia-300',
      };
    case 'action':
      return {
        title: '🧮 КАРТ ИДЭВХЖҮҮЛЭХ',
        sub: `${mine ? 'Зөв бодвол' : `${who} зөв бодвол`} ${phase.cardType ? `«${CARD_INFO[phase.cardType as keyof typeof CARD_INFO].name}»` : 'карт'} үйлчилнэ`,
        color: 'text-cyan-300',
      };
  }
}

function TimerRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, remaining / total));
  const color = f > 0.5 ? '#22e5ff' : f > 0.25 ? '#ff9f1c' : '#ff4d6d';
  const secs = Math.ceil(remaining / 1000);
  return (
    <div className={`relative h-[72px] w-[72px] shrink-0 ${f <= 0.25 && remaining > 0 ? 'wiggle' : ''}`}>
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={r} stroke="rgba(255,255,255,0.12)" strokeWidth="7" fill="rgba(0,0,0,0.3)" />
        <circle
          cx="36"
          cy="36"
          r={r}
          stroke={color}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-2xl font-black" style={{ color }}>
        {Math.max(0, secs)}
      </div>
    </div>
  );
}

export function MathModal({
  view,
  phase,
  result,
  getNow,
  onAnswer,
}: {
  view: GameView;
  phase: MathPhase | null;
  result: AnswerEvent | null;
  getNow: () => number;
  onAnswer: (choice: number) => Promise<string | null> | void;
}) {
  const active = !!phase || !!result;
  const now = useNow(getNow, active, 100);
  const question: PublicQuestion | undefined = result?.question ?? phase?.question;
  const qid = question?.id;
  const [picked, setPicked] = useState<number | null>(null);
  const [minimized, setMinimized] = useState(false);
  const lastTick = useRef(-1);

  useEffect(() => {
    setPicked(null);
    setMinimized(false);
    lastTick.current = -1;
  }, [qid]);

  const submit = (i: number) => {
    setPicked(i);
    void Promise.resolve(onAnswer(i)).then((err) => {
      if (err) setPicked(null);
    });
  };

  const ownerId = result?.playerId ?? phase?.playerId ?? null;
  const mine = !!ownerId && ownerId === view.you;
  const intro = !!phase && !result && now < phase.startsAt;
  const remaining = phase ? Math.max(0, phase.deadline - now) : 0;
  const total = phase ? phase.seconds * 1000 : 1;

  // Ticking clock in the last seconds.
  useEffect(() => {
    if (!phase || result || intro || !mine) return;
    const s = Math.ceil(remaining / 1000);
    if (s <= 5 && s > 0 && s !== lastTick.current) {
      lastTick.current = s;
      sfx.tick(s <= 3);
    }
  }, [remaining, phase, result, intro, mine]);

  // Keyboard: 1-4 / A-D.
  useEffect(() => {
    if (!phase || !mine || result || intro || picked !== null) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const i = ['1', '2', '3', '4'].indexOf(k) >= 0 ? ['1', '2', '3', '4'].indexOf(k) : ['a', 'b', 'c', 'd'].indexOf(k);
      if (i >= 0) submit(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mine, result, intro, picked, onAnswer]);

  if (!question || !ownerId) return null;
  const purpose = result?.purpose ?? phase!.purpose;
  const h = header(purpose, view, { playerId: ownerId, sourceId: phase?.sourceId ?? '', cardType: phase?.cardType }, mine);

  const choiceState = (i: number): 'idle' | 'picked' | 'correct' | 'wrong' | 'dim' => {
    if (result) {
      if (i === result.answer) return 'correct';
      if (i === result.chosen) return 'wrong';
      return 'dim';
    }
    if (picked === i) return 'picked';
    if (picked !== null) return 'dim';
    return 'idle';
  };

  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className={`text-xl font-black tracking-wide sm:text-2xl ${h.color}`}>{h.title}</div>
          <div className="mt-0.5 text-sm font-bold text-violet-100/85">{h.sub}</div>
          <div className="mt-1 text-xs font-bold text-violet-300/70">
            {question.custom ? 'Багшийн асуулт' : topicName(question.topic as any)} · {question.grade}-р анги
          </div>
        </div>
        {phase && !result ? (
          <TimerRing remaining={remaining} total={total} />
        ) : result ? (
          <motion.div
            initial={{ scale: 0.3, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full text-4xl ${result.correct ? 'bg-emerald-400/25' : 'bg-rose-500/25'}`}
          >
            {result.correct ? '✅' : result.chosen === null ? '⏰' : '❌'}
          </motion.div>
        ) : null}
      </div>

      <div className="my-4">
        <QuestionBody q={question} compact={!mine} />
      </div>

      <div className={`grid gap-2.5 ${mine ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>
        {question.choices.map((c, i) => {
          const st = choiceState(i);
          const base =
            st === 'correct'
              ? 'from-emerald-400 to-emerald-600 ring-4 ring-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.7)]'
              : st === 'wrong'
                ? 'from-rose-500 to-rose-700 ring-4 ring-rose-200'
                : st === 'picked'
                  ? `${CHOICE_COLORS[i]} ring-4 ring-white`
                  : st === 'dim'
                    ? 'from-white/10 to-white/5 opacity-55'
                    : `${CHOICE_COLORS[i]} ring-1`;
          const clickable = mine && phase && !result && !intro && picked === null;
          return (
            <motion.button
              key={i}
              type="button"
              disabled={!clickable}
              whileTap={clickable ? { scale: 0.96 } : undefined}
              animate={st === 'wrong' ? { x: [0, -8, 8, -5, 5, 0] } : st === 'correct' ? { scale: [1, 1.05, 1] } : {}}
              onClick={() => {
                if (!clickable) return;
                sfx.click();
                submit(i);
              }}
              className={`flex items-center gap-3 rounded-2xl bg-gradient-to-b px-3 text-left font-black text-white shadow-lg ${mine ? 'min-h-14 py-2.5 text-lg' : 'min-h-11 py-1.5 text-sm'} ${base} ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/25 text-base">{LETTERS[i]}</span>
              <span className="min-w-0 flex-1 break-words [font-variant-numeric:tabular-nums]">{c}</span>
            </motion.button>
          );
        })}
      </div>

      {picked !== null && !result && <div className="mt-3 text-center text-sm font-bold text-cyan-200">Хариултыг шалгаж байна…</div>}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-2xl bg-black/30 p-3 text-center">
          <div className={`text-lg font-black ${result.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
            {result.correct
              ? `Зөв! +${result.points} оноо`
              : result.chosen === null
                ? 'Хугацаа дууслаа!'
                : 'Буруу хариулт!'}
          </div>
          {result.explanation && <div className="mt-1 text-sm font-semibold text-violet-100/90">{result.explanation}</div>}
        </motion.div>
      )}
    </>
  );

  if (intro && phase) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[55] flex flex-col items-center justify-center">
        {phase.purpose === 'explode' ? (
          <motion.div
            initial={{ scale: 0.2, rotate: -30, opacity: 0 }}
            animate={{ scale: 1, rotate: [0, -6, 6, -4, 4, 0], opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="w-[min(46vw,230px)]">
              <CardFace type="explode" glow />
            </div>
            <div className="sun-text text-3xl font-black text-orange-200 sm:text-4xl">ТЭСРЭХ МУУР!</div>
            <div className="text-base font-bold text-white/90">{mine ? 'Бодлогоо бэлдээрэй…' : `${playerName(view, phase.playerId)} аюулд орлоо!`}</div>
          </motion.div>
        ) : (
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass rounded-3xl px-6 py-4 text-center">
            <div className={`text-2xl font-black ${h.color}`}>{h.title}</div>
            <div className="mt-1 text-sm font-bold text-white/85">{h.sub}</div>
          </motion.div>
        )}
      </div>
    );
  }

  if (mine) {
    return (
      <AnimatePresence>
        <motion.div
          key="math-mine"
          className="fixed inset-0 z-[55] flex items-center justify-center bg-[#05020f]/75 p-3 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            initial={{ scale: 0.85, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={`glass thin-scroll max-h-[calc(100dvh-24px)] w-full max-w-xl overflow-y-auto rounded-3xl p-4 sm:p-6 ${purpose === 'explode' ? 'ring-2 ring-rose-400/60 shadow-[0_0_60px_rgba(255,77,109,0.35)]' : 'ring-2 ring-cyan-300/40'}`}
          >
            {body}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Someone else is solving: a smaller panel the viewer can tuck away.
  return (
    <motion.div
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-2 top-[calc(56px+var(--safe-t))] z-[45] mx-auto max-w-md"
    >
      <div className="glass rounded-3xl p-3 sm:p-4">
        {minimized ? (
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setMinimized(false)}>
            <span className={`font-black ${h.color}`}>{h.title}</span>
            <span className="text-sm font-bold text-violet-100/80">{phase && !result ? `${Math.ceil(remaining / 1000)} с` : result?.correct ? '✅' : '❌'} · Харах ▾</span>
          </button>
        ) : (
          <>
            {body}
            <button type="button" className="mt-2 w-full text-center text-xs font-bold text-violet-200/70" onClick={() => setMinimized(true)}>
              Жижигрүүлэх ▴
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
