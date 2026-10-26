import { motion } from 'framer-motion';
import type { GameView } from '../../../shared/game/types';
import { CatAvatar } from '../../art';
import { formatSeconds } from '../../game/text';
import { Button, Modal } from '../../ui/ui';

export function GameOver({
  open,
  view,
  canRematch,
  onRematch,
  onExit,
  waitingText,
}: {
  open: boolean;
  view: GameView;
  canRematch: boolean;
  onRematch: () => void;
  onExit: () => void;
  waitingText?: string;
}) {
  const winner = view.players.find((p) => p.id === view.winnerId);
  const youWon = !!winner && winner.id === view.you;
  const ranked = [...view.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  return (
    <Modal open={open} z="z-[65]" className="max-w-2xl">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.4, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          className="mx-auto h-28 w-28 sm:h-36 sm:w-36"
        >
          <CatAvatar index={winner?.avatar ?? 0} mood="happy" className="h-full w-full float-y" />
        </motion.div>
        <div className="mt-1 text-4xl">🏆</div>
        <h2 className="sun-text mt-1 text-3xl font-black text-orange-200 sm:text-4xl">
          {youWon ? 'Та яллаа!' : winner ? `${winner.name} яллаа!` : 'Тоглоом дууслаа'}
        </h2>
        <p className="mt-1 font-bold text-violet-100/80">
          {youWon ? 'Математикийн жинхэнэ баатар муур! 🐾' : 'Дахин тоглож хариугаа аваарай!'}
        </p>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl bg-black/25">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-violet-200/70">
              <th className="px-3 py-2">Байр</th>
              <th className="px-3 py-2">Тоглогч</th>
              <th className="px-3 py-2 text-right">Оноо</th>
              <th className="px-3 py-2 text-right">Зөв</th>
              <th className="px-3 py-2 text-right">Нарийвчлал</th>
              <th className="px-3 py-2 text-right">Дундаж хугацаа</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p) => {
              const acc = p.stats.answered ? Math.round((p.stats.correct / p.stats.answered) * 100) : 0;
              return (
                <tr key={p.id} className={`border-t border-white/8 ${p.id === view.you ? 'bg-cyan-400/10' : ''}`}>
                  <td className="px-3 py-2 text-lg font-black">{p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : p.place ?? '–'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <CatAvatar index={p.avatar} mood={p.place === 1 ? 'happy' : 'ko'} className="h-8 w-8" />
                      <span className="font-black">{p.name}</span>
                      {p.isBot && <span className="text-xs">🤖</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-black text-orange-200">{p.stats.score}</td>
                  <td className="px-3 py-2 text-right font-bold">
                    {p.stats.correct}/{p.stats.answered}
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{p.stats.answered ? `${acc}%` : '–'}</td>
                  <td className="px-3 py-2 text-right font-bold">
                    {p.stats.answered ? `${formatSeconds(p.stats.totalMs / p.stats.answered)} с` : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {canRematch ? (
          <Button size="lg" onClick={onRematch}>
            🔁 Дахин тоглох
          </Button>
        ) : (
          <div className="flex items-center justify-center rounded-2xl bg-white/5 px-4 py-3 text-center text-sm font-bold text-violet-200/80">
            {waitingText ?? 'Хост дахин эхлүүлэхийг хүлээж байна…'}
          </div>
        )}
        <Button size="lg" variant="ghost" onClick={onExit}>
          🏠 Үндсэн цэс
        </Button>
      </div>
    </Modal>
  );
}
