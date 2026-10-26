import { useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '../../../shared/game/engine';
import { DIFFICULTY_NAMES, topicName } from '../../../shared/math/topics';
import { SettingsForm } from '../../components/SettingsForm';
import { formatSeconds } from '../../game/text';
import { clearHistory, loadHistory } from '../../game/history';
import { ONLINE_ENABLED } from '../../net/config';
import { useNet } from '../../net/net';
import { setGameSettings, setPrefs, usePrefs } from '../../store/prefs';
import { dateStamp, downloadCsv, formatDateTime } from '../../util/csv';
import { Button, Field, Modal, Panel, Screen, Segmented, Toggle } from '../../ui/ui';
import { BOT_LEVEL_NAMES } from '../Setup';
import { ClassroomTab } from './Classroom';
import { QuestionsTab } from './Questions';

type Tab = 'settings' | 'questions' | 'class' | 'results';

function SettingsTab() {
  const prefs = usePrefs();
  const s = prefs.settings;
  const [saved, setSaved] = useState(false);
  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel>
        <h2 className="mb-1 text-lg font-black">🧮 Бодлогын тохиргоо</h2>
        <p className="mb-4 text-sm font-semibold text-violet-100/75">
          Эдгээр тохиргоо энэ төхөөрөмж дээр эхлүүлэх бүх тоглоом, шинээр үүсгэх өрөө, ангид хэрэглэгдэнэ.
        </p>
        <SettingsForm
          value={s}
          onChange={(p) => {
            setGameSettings(p);
            flash();
          }}
          showSource={false}
        />
        <div className="mt-4">
          <Field label="Асуултын эх сурвалж" hint={s.customQuestions.length ? `Танд ${s.customQuestions.length} асуулт бий.` : 'Өөрийн асуултыг «Асуултууд» хэсэгт нэмнэ.'}>
            <Segmented
              value={s.questionSource}
              onChange={(questionSource) => {
                setGameSettings({ questionSource });
                flash();
              }}
              options={[
                { value: 'generated', label: 'Автомат бодлого' },
                { value: 'mixed', label: 'Холимог' },
                { value: 'custom', label: 'Зөвхөн миний' },
              ]}
            />
          </Field>
          {s.questionSource !== 'generated' && s.customQuestions.length === 0 && (
            <div className="mt-2 rounded-xl bg-orange-500/20 px-3 py-2 text-xs font-bold text-orange-100">
              Өөрийн асуулт алга тул автомат бодлого ашиглагдана.
            </div>
          )}
        </div>
      </Panel>
      <div className="grid content-start gap-4">
        <Panel>
          <h2 className="mb-3 text-lg font-black">🏫 Ангийн тохиргоо</h2>
          <div className="grid gap-3">
            <Toggle
              checked={s.mathOnActions}
              onChange={(mathOnActions) => {
                setGameSettings({ mathOnActions });
                flash();
              }}
              label="Үйлдлийн карт бүрт бодлого"
              hint="Карт тоглохын өмнө бодлого бодно. Буруу бол карт үйлчлэхгүй."
            />
            <Toggle
              checked={s.showExplanations}
              onChange={(showExplanations) => {
                setGameSettings({ showExplanations });
                flash();
              }}
              label="Хариултын дараа тайлбар харуулах"
              hint="Бодолтын товч тайлбар хариулсны дараа гарна."
            />
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-lg font-black">🎮 «Шинэ тоглоом»-ын тохиргоо</h2>
          <div className="grid gap-3">
            <Field label="Тоглогчийн тоо (та оролцоно)">
              <Segmented value={prefs.players} onChange={(players) => setPrefs({ players })} options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n}` }))} />
            </Field>
            <Field label="Компьютерийн чадвар">
              <Segmented
                value={prefs.botLevel}
                onChange={(botLevel) => setPrefs({ botLevel })}
                options={(['easy', 'medium', 'hard'] as const).map((l) => ({ value: l, label: BOT_LEVEL_NAMES[l] }))}
              />
            </Field>
          </div>
        </Panel>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setGameSettings({ ...DEFAULT_SETTINGS, customQuestions: s.customQuestions });
              setPrefs({ players: 4, botLevel: 'medium' });
              flash();
            }}
          >
            ↺ Анхны тохиргоо (9-р анги, систем, 20 с)
          </Button>
          {saved && <span className="text-sm font-bold text-emerald-300">✓ Хадгалагдлаа</span>}
        </div>
      </div>
    </div>
  );
}

function ResultsTab() {
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const history = useMemo(() => loadHistory(), [version]);
  const people = useMemo(() => {
    const map = new Map<string, { name: string; games: number; wins: number; score: number; answered: number; correct: number; ms: number }>();
    for (const g of history) {
      for (const p of g.players) {
        if (p.isBot) continue;
        const r = map.get(p.name) ?? { name: p.name, games: 0, wins: 0, score: 0, answered: 0, correct: 0, ms: 0 };
        r.games++;
        r.wins += p.place === 1 ? 1 : 0;
        r.score += p.score;
        r.answered += p.answered;
        r.correct += p.correct;
        r.ms += p.avgMs * p.answered;
        map.set(p.name, r);
      }
    }
    return [...map.values()].sort((a, b) => b.score - a.score);
  }, [history]);

  const exportAll = () => {
    downloadCsv(`math-kittens-ur-dun_${dateStamp()}.csv`, [
      ['Нэр', 'Тоглолт', 'Ялалт', 'Оноо', 'Хариулсан', 'Зөв', 'Нарийвчлал (%)', 'Дундаж хугацаа (с)'],
      ...people.map((p) => [
        p.name,
        p.games,
        p.wins,
        p.score,
        p.answered,
        p.correct,
        p.answered ? Math.round((p.correct / p.answered) * 100) : '',
        p.answered ? (p.ms / p.answered / 1000).toFixed(1) : '',
      ]),
      [],
      ['Огноо', 'Горим', 'Анги', 'Сэдэв', 'Нэр', 'Байр', 'Оноо', 'Зөв', 'Хариулсан', 'Дундаж хугацаа (с)'],
      ...history.flatMap((g) =>
        g.players
          .filter((p) => !p.isBot)
          .map((p) => [
            formatDateTime(g.at),
            g.mode === 'ai' ? 'Компьютертэй' : g.mode === 'hotseat' ? 'Нэг төхөөрөмж' : 'Онлайн',
            g.grade,
            topicName(g.topic as any),
            p.name,
            p.place,
            p.score,
            p.correct,
            p.answered,
            p.answered ? (p.avgMs / 1000).toFixed(1) : '',
          ]),
      ),
      [],
      ['Огноо', 'Нэр', 'Сэдэв', 'Хүндрэл', 'Зөв эсэх', 'Хугацаа (с)', 'Асуулт'],
      ...history.flatMap((g) =>
        g.answers.map((a) => [
          formatDateTime(a.at),
          a.name,
          topicName(a.topic as any),
          DIFFICULTY_NAMES[a.difficulty] ?? a.difficulty,
          a.correct ? 'Зөв' : a.timedOut ? 'Хугацаа дууссан' : 'Буруу',
          (a.ms / 1000).toFixed(1),
          a.text,
        ]),
      ),
    ]);
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-black">📊 Энэ төхөөрөмж дээрх үр дүн</h2>
            <p className="text-sm font-semibold text-violet-100/70">
              Компьютертэй болон нэг төхөөрөмж дээр тоглосон тоглоомууд. Ангийн дүнг «Ангийн горим» хэсгээс харна.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={exportAll} disabled={!history.length}>
              ⬇ CSV татах
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} disabled={!history.length}>
              🗑 Цэвэрлэх
            </Button>
          </div>
        </div>
        {people.length === 0 ? (
          <p className="rounded-2xl bg-black/20 p-4 text-center font-semibold text-violet-100/75">Одоогоор дууссан тоглоом алга.</p>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-violet-200/70">
                  <th className="px-2 py-2">Нэр</th>
                  <th className="px-2 py-2 text-right">Тоглолт</th>
                  <th className="px-2 py-2 text-right">Ялалт</th>
                  <th className="px-2 py-2 text-right">Оноо</th>
                  <th className="px-2 py-2 text-right">Зөв / Нийт</th>
                  <th className="px-2 py-2 text-right">Нарийвчлал</th>
                  <th className="px-2 py-2 text-right">Дундаж хугацаа</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.name} className="border-t border-white/8">
                    <td className="px-2 py-2 font-black">{p.name}</td>
                    <td className="px-2 py-2 text-right font-bold">{p.games}</td>
                    <td className="px-2 py-2 text-right font-bold">{p.wins}</td>
                    <td className="px-2 py-2 text-right font-black text-orange-200">{p.score}</td>
                    <td className="px-2 py-2 text-right font-bold">
                      {p.correct} / {p.answered}
                    </td>
                    <td className="px-2 py-2 text-right font-bold">{p.answered ? `${Math.round((p.correct / p.answered) * 100)}%` : '–'}</td>
                    <td className="px-2 py-2 text-right font-bold">{p.answered ? `${formatSeconds(p.ms / p.answered)} с` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {history.length > 0 && (
        <Panel>
          <h3 className="mb-3 text-lg font-black">🕘 Тоглоомын түүх</h3>
          <div className="grid gap-2">
            {history.slice(0, 20).map((g) => (
              <div key={g.id} className="rounded-2xl bg-black/20 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-violet-200/80">
                  <span>{formatDateTime(g.at)}</span>
                  <span>
                    {g.grade}-р анги · {topicName(g.topic as any)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {[...g.players]
                    .sort((a, b) => a.place - b.place)
                    .map((p, i) => (
                      <span key={i} className={`rounded-lg px-2 py-0.5 text-xs font-black ${p.place === 1 ? 'bg-orange-400/30' : 'bg-white/8'}`}>
                        {p.place === 1 ? '🏆' : `${p.place}.`} {p.name}
                        {p.isBot ? ' 🤖' : ''} · {p.score}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} className="max-w-sm">
        <h2 className="text-center text-xl font-black">Түүхийг устгах уу?</h2>
        <p className="mt-2 text-center text-sm font-semibold text-violet-100/80">Энэ төхөөрөмж дээрх бүх үр дүн устана. Эхлээд CSV татаж авахыг зөвлөе.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Үгүй
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearHistory();
              setConfirm(false);
              setVersion((v) => v + 1);
            }}
          >
            Устгах
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export function TeacherScreen({ onBack }: { onBack: () => void }) {
  const st = useNet();
  const [tab, setTab] = useState<Tab>(st.teacher && ONLINE_ENABLED ? 'class' : 'settings');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'settings', label: '⚙️ Тохиргоо' },
    { id: 'questions', label: '✍️ Асуултууд' },
    ...(ONLINE_ENABLED ? [{ id: 'class' as const, label: st.classView?.active ? '🟢 Ангийн горим' : '🏫 Ангийн горим' }] : []),
    { id: 'results', label: '📊 Үр дүн' },
  ];
  return (
    <Screen title="Багшийн тохиргоо" onBack={onBack} wide>
      <div className="scrollbar-none -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <Button key={t.id} size="sm" variant={tab === t.id ? 'neon' : 'ghost'} className="shrink-0" onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>
      {tab === 'settings' && <SettingsTab />}
      {tab === 'questions' && <QuestionsTab />}
      {tab === 'class' && <ClassroomTab />}
      {tab === 'results' && <ResultsTab />}
    </Screen>
  );
}
