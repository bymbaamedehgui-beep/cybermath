import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { BotLevel } from '../../../shared/game/types';
import type { ClassStudentView, ClassView } from '../../../shared/net';
import { DIFFICULTY_NAMES, topicName } from '../../../shared/math/topics';
import { CatAvatar } from '../../art';
import { QrCode } from '../../components/Qr';
import { settingsSummary } from '../../components/SettingsForm';
import { formatSeconds } from '../../game/text';
import { net, useNet } from '../../net/net';
import { getPrefs, setPrefs, usePrefs } from '../../store/prefs';
import { dateStamp, downloadCsv, formatDateTime } from '../../util/csv';
import { Button, Field, inputCls, Modal, Panel, Segmented, Spinner, Toggle } from '../../ui/ui';
import { useShareBase } from '../Online';
import { BOT_LEVEL_NAMES } from '../Setup';

const STATUS: Record<ClassStudentView['status'], { text: string; cls: string }> = {
  lobby: { text: 'Хүлээж байна', cls: 'bg-white/10' },
  playing: { text: 'Тоглож байна', cls: 'bg-cyan-400/25 text-cyan-100' },
  out: { text: 'Хасагдсан', cls: 'bg-rose-500/25 text-rose-100' },
  won: { text: '🏆 Ялсан', cls: 'bg-orange-400/30 text-orange-100' },
  done: { text: 'Дууссан', cls: 'bg-violet-400/25' },
  left: { text: 'Гарсан', cls: 'bg-white/5 text-violet-200/60' },
};

const PURPOSE: Record<string, string> = { explode: 'Тэсрэх муур', challenge: 'Сорилт', double: 'Давхар хүч', action: 'Карт идэвхжүүлэх' };

const acc = (s: { answered: number; correct: number }) => (s.answered ? Math.round((s.correct / s.answered) * 100) : 0);

export function exportClassSummary(cv: ClassView) {
  downloadCsv(`math-kittens-${cv.code}-dun_${dateStamp()}.csv`, [
    ['Анги', cv.name, 'Код', cv.code, 'Огноо', formatDateTime(cv.createdAt)],
    [],
    ['Нэр', 'Ширээ', 'Төлөв', 'Тоглолт', 'Ялалт', 'Оноо', 'Хариулсан', 'Зөв', 'Нарийвчлал (%)', 'Дундаж хугацаа (с)'],
    ...[...cv.students]
      .sort((a, b) => b.score - a.score)
      .map((s) => [s.name, s.table, STATUS[s.status].text, s.games, s.wins, s.score, s.answered, s.correct, acc(s), s.answered ? (s.avgMs / 1000).toFixed(1) : '']),
  ]);
}

export function exportClassAnswers(cv: ClassView) {
  downloadCsv(`math-kittens-${cv.code}-hariultuud_${dateStamp()}.csv`, [
    ['Цаг', 'Нэр', 'Ширээ', 'Сэдэв', 'Хүндрэл', 'Төрөл', 'Зөв эсэх', 'Хугацаа (с)', 'Асуулт'],
    ...cv.answers.map((a) => [
      formatDateTime(a.at),
      a.name,
      a.table,
      topicName(a.topic as any),
      DIFFICULTY_NAMES[a.difficulty] ?? a.difficulty,
      PURPOSE[a.purpose] ?? a.purpose,
      a.correct ? 'Зөв' : a.timedOut ? 'Хугацаа дууссан' : 'Буруу',
      (a.ms / 1000).toFixed(1),
      a.text,
    ]),
  ]);
}

function CreateClass() {
  const prefs = usePrefs();
  const [name, setName] = useState('9-р анги');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    const p = getPrefs();
    const r = await net.request({
      t: 'classCreate',
      name: name.trim() || 'Анги',
      settings: { ...p.settings, turnTimeLimit: 60 },
      tableSize: p.tableSize,
      fillBots: p.fillBots,
      botLevel: p.botLevel,
    });
    setBusy(false);
    if (r.error) setError(r.error);
  };
  return (
    <Panel className="mx-auto max-w-2xl">
      <h2 className="text-xl font-black">🏫 Ангийн горим</h2>
      <p className="mt-1 text-sm font-semibold text-violet-100/80">
        Ангийн код үүсгэхэд сурагчид өөрсдийн төхөөрөмжөөс нэгдэж, автоматаар ширээнд хуваагдана. Та бүх ширээг нэг дор эхлүүлж, оноо, нарийвчлал,
        хариулах хугацааг шууд харна.
      </p>
      <div className="mt-4 grid gap-4">
        <Field label="Ангийн нэр">
          <input className={inputCls} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Нэг ширээнд хэдэн тоглогч">
          <Segmented value={prefs.tableSize} onChange={(tableSize) => setPrefs({ tableSize })} options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n}` }))} />
        </Field>
        <Toggle
          checked={prefs.fillBots}
          onChange={(fillBots) => setPrefs({ fillBots })}
          label="Дутуу ширээг компьютерээр дүүргэх"
          hint="Хүрэлцэхгүй сурагчтай ширээнд компьютер тоглогч нэмнэ."
        />
        <Field label="Компьютерийн чадвар">
          <Segmented<BotLevel>
            value={prefs.botLevel}
            onChange={(botLevel) => setPrefs({ botLevel })}
            options={(['easy', 'medium', 'hard'] as const).map((l) => ({ value: l, label: BOT_LEVEL_NAMES[l] }))}
          />
        </Field>
        <div className="rounded-2xl bg-black/25 px-4 py-3 text-sm font-bold">
          🧮 {settingsSummary(prefs.settings)}
          {prefs.settings.customQuestions.length > 0 && ` · Багшийн ${prefs.settings.customQuestions.length} асуулт`}
          {prefs.settings.mathOnActions && ' · Карт бүрт бодлого'}
          <div className="text-xs font-semibold text-violet-200/70">Бодлогын тохиргоог «Тохиргоо» хэсгээс өөрчилнө.</div>
        </div>
        {error && <div className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-bold text-rose-100">{error}</div>}
        <Button size="lg" onClick={create} disabled={busy}>
          {busy ? <Spinner /> : '🏫'} Ангийн горим идэвхжүүлэх
        </Button>
      </div>
    </Panel>
  );
}

export function ClassroomTab() {
  const st = useNet();
  const base = useShareBase();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [sort, setSort] = useState<'score' | 'name' | 'acc' | 'time' | 'table'>('score');

  useEffect(() => {
    const t = net.state.teacher;
    if (t && !net.state.classView) {
      void net.request({ t: 'classResume', code: t.code, token: t.token }).then((r) => {
        if (r.error) net.forgetTeacher();
      });
    }
    return () => net.detachTeacher();
  }, []);

  const cv = st.classView;
  const students = useMemo(() => {
    if (!cv) return [];
    const list = [...cv.students];
    list.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name, 'mn');
        case 'acc':
          return acc(b) - acc(a);
        case 'time':
          return (a.avgMs || 1e9) - (b.avgMs || 1e9);
        case 'table':
          return a.table - b.table;
        default:
          return b.score - a.score;
      }
    });
    return list;
  }, [cv, sort]);

  if (st.teacher && !cv) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Spinner className="h-10 w-10" />
        <div className="font-bold">Ангид холбогдож байна…</div>
        <Button variant="ghost" size="sm" onClick={() => net.forgetTeacher()}>
          Болих
        </Button>
      </div>
    );
  }
  if (!cv) return <CreateClass />;

  const run = async (msg: Parameters<typeof net.request>[0], ok?: string) => {
    setError(null);
    const r = await net.request(msg);
    if (r.error) setError(r.error);
    else if (ok) {
      setInfo(ok);
      setTimeout(() => setInfo(null), 2500);
    }
  };
  const link = `${base}?join=${cv.code}`;
  const totalAnswered = cv.students.reduce((n, s) => n + s.answered, 0);
  const totalCorrect = cv.students.reduce((n, s) => n + s.correct, 0);
  const timed = cv.students.filter((s) => s.answered);
  const avgTime = timed.length ? timed.reduce((n, s) => n + s.avgMs * s.answered, 0) / totalAnswered : 0;
  const lobbyTables = cv.tables.filter((t) => t.status === 'lobby' && t.players.some((p) => !p.isBot)).length;

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex-1">
            <div className="text-sm font-bold text-violet-200/80">
              {cv.name} · {cv.active ? '🟢 Идэвхтэй' : '⏹ Хаагдсан'}
            </div>
            <div className="neon-text mt-1 select-text text-5xl font-black tracking-[0.25em] text-cyan-200 sm:text-6xl">{cv.code}</div>
            {cv.active ? (
              <p className="mt-2 text-sm font-semibold text-violet-100/85">
                Сурагчид <b>«Өрөөнд нэгдэх»</b> дээр дарж энэ кодыг оруулна, эсвэл QR кодыг уншуулна.
                <br />
                <span className="break-all text-xs text-violet-200/65">{link}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-violet-100/80">Хичээл дууссан. Дүнгээ CSV-ээр татаж авна уу.</p>
            )}
            <div className="mt-2 text-xs font-bold text-violet-200/70">
              {settingsSummary({ ...cv.settings, customQuestions: [] })} · {cv.tableSize} хүний ширээ
              {cv.settings.customCount > 0 && ` · Багшийн ${cv.settings.customCount} асуулт`}
            </div>
          </div>
          {cv.active && <QrCode text={link} size={170} />}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {cv.active && (
            <>
              <Button onClick={() => run({ t: 'classStart' }, 'Тоглоом эхэллээ!')} disabled={!lobbyTables && !cv.tables.some((t) => t.status === 'over')}>
                ▶ Бүх ширээг эхлүүлэх{lobbyTables ? ` (${lobbyTables})` : ''}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const p = getPrefs();
                  void run(
                    { t: 'classSettings', settings: { ...p.settings, turnTimeLimit: 60 }, tableSize: p.tableSize, fillBots: p.fillBots, botLevel: p.botLevel },
                    'Тохиргоо шинэчлэгдлээ. Дараагийн тоглолтоос үйлчилнэ.',
                  );
                }}
                title="Тохиргоо табын одоогийн утгуудыг ангид хэрэглэнэ"
              >
                🔄 Тохиргоог шинэчлэх
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => exportClassSummary(cv)} disabled={!cv.students.length}>
            ⬇ Дүн (CSV)
          </Button>
          <Button variant="ghost" onClick={() => exportClassAnswers(cv)} disabled={!cv.answers.length}>
            ⬇ Хариултууд (CSV)
          </Button>
          {cv.active ? (
            <Button variant="danger" onClick={() => setConfirmClose(true)}>
              ⏹ Ангийн горимыг хаах
            </Button>
          ) : (
            <Button variant="neon" onClick={() => net.forgetTeacher()}>
              🏫 Шинэ анги
            </Button>
          )}
        </div>
        {error && <div className="mt-3 rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-bold text-rose-100">{error}</div>}
        {info && <div className="mt-3 rounded-xl bg-emerald-500/20 px-3 py-2 text-sm font-bold text-emerald-100">{info}</div>}
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: 'Сурагч', v: `${cv.students.filter((s) => s.status !== 'left').length}`, i: '🧑‍🎓' },
          { k: 'Нийт хариулт', v: `${totalAnswered}`, i: '✍️' },
          { k: 'Дундаж нарийвчлал', v: totalAnswered ? `${Math.round((totalCorrect / totalAnswered) * 100)}%` : '–', i: '🎯' },
          { k: 'Дундаж хугацаа', v: totalAnswered ? `${formatSeconds(avgTime)} с` : '–', i: '⏱' },
        ].map((x) => (
          <div key={x.k} className="glass rounded-2xl p-3 text-center">
            <div className="text-2xl">{x.i}</div>
            <div className="text-2xl font-black text-cyan-100">{x.v}</div>
            <div className="text-xs font-bold text-violet-200/75">{x.k}</div>
          </div>
        ))}
      </div>

      {cv.tables.length > 0 && (
        <Panel>
          <h3 className="mb-3 text-lg font-black">🪑 Ширээнүүд</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cv.tables.map((t) => (
              <motion.div layout key={t.code} className="rounded-2xl bg-black/25 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-black">Ширээ {t.no}</div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                      t.status === 'playing' ? 'bg-cyan-400/25 text-cyan-100' : t.status === 'over' ? 'bg-violet-400/25' : 'bg-white/10'
                    }`}
                  >
                    {t.status === 'playing' ? `Тоглож байна · ${t.turn}-р ээлж` : t.status === 'over' ? 'Дууссан' : 'Хүлээж байна'}
                  </span>
                </div>
                <div className="grid gap-1">
                  {t.players.map((p, i) => (
                    <div key={i} className={`flex items-center gap-2 text-sm ${!p.alive ? 'opacity-50' : ''}`}>
                      <CatAvatar index={p.avatar} mood={!p.alive ? 'ko' : p.place === 1 ? 'happy' : 'idle'} className="h-7 w-7" />
                      <span className="min-w-0 flex-1 truncate font-bold">
                        {p.name} {p.isBot && '🤖'} {!p.connected && '📴'}
                      </span>
                      {t.status !== 'lobby' && (
                        <span className="text-xs font-bold text-violet-100/80">
                          {p.place === 1 ? '🏆 ' : ''}⭐ {p.score}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {cv.active && t.players.some((p) => !p.isBot) && (
                  <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => run({ t: 'classStart', table: t.code })}>
                    {t.status === 'lobby' ? '▶ Эхлүүлэх' : '🔁 Дахин эхлүүлэх'}
                  </Button>
                )}
              </motion.div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-black">🧑‍🎓 Сурагчдын дүн</h3>
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'score', label: 'Оноо' },
              { value: 'acc', label: 'Нарийвчлал' },
              { value: 'time', label: 'Хурд' },
              { value: 'table', label: 'Ширээ' },
              { value: 'name', label: 'Нэр' },
            ]}
          />
        </div>
        {students.length === 0 ? (
          <p className="rounded-2xl bg-black/20 p-4 text-center font-semibold text-violet-100/75">Сурагчид кодоор нэгдэхийг хүлээж байна…</p>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-violet-200/70">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Нэр</th>
                  <th className="px-2 py-2">Ширээ</th>
                  <th className="px-2 py-2">Төлөв</th>
                  <th className="px-2 py-2 text-right">Оноо</th>
                  <th className="px-2 py-2 text-right">Зөв / Нийт</th>
                  <th className="px-2 py-2 text-right">Нарийвчлал</th>
                  <th className="px-2 py-2 text-right">Дундаж хугацаа</th>
                  <th className="px-2 py-2 text-right">Ялалт</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s.sid} className="border-t border-white/8">
                    <td className="px-2 py-2 font-black text-violet-200/70">{i + 1}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <CatAvatar index={s.avatar} mood="idle" className="h-8 w-8" />
                        <span className="font-black">{s.name}</span>
                        {!s.connected && s.status !== 'left' && <span title="Холболт тасарсан">📴</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-bold">{s.table}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS[s.status].cls}`}>{STATUS[s.status].text}</span>
                    </td>
                    <td className="px-2 py-2 text-right font-black text-orange-200">{s.score}</td>
                    <td className="px-2 py-2 text-right font-bold">
                      {s.correct} / {s.answered}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-2 w-16 overflow-hidden rounded-full bg-white/10 sm:block">
                          <div
                            className={`h-full ${acc(s) >= 75 ? 'bg-emerald-400' : acc(s) >= 50 ? 'bg-orange-400' : 'bg-rose-400'}`}
                            style={{ width: `${acc(s)}%` }}
                          />
                        </div>
                        <span className="font-bold">{s.answered ? `${acc(s)}%` : '–'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-bold">{s.answered ? `${formatSeconds(s.avgMs)} с` : '–'}</td>
                    <td className="px-2 py-2 text-right font-bold">{s.wins}</td>
                    <td className="px-2 py-2 text-right">
                      {cv.active && s.status !== 'left' && (
                        <button type="button" className="text-violet-200/60 hover:text-rose-300" title="Ангиас хасах" onClick={() => run({ t: 'classKick', sid: s.sid })}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {cv.answers.length > 0 && (
        <Panel>
          <h3 className="mb-3 text-lg font-black">📝 Сүүлийн хариултууд</h3>
          <div className="thin-scroll grid max-h-80 gap-1.5 overflow-y-auto pr-1">
            {[...cv.answers]
              .reverse()
              .slice(0, 60)
              .map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-1.5 text-sm">
                  <span className="text-lg">{a.correct ? '✅' : a.timedOut ? '⏰' : '❌'}</span>
                  <span className="w-28 shrink-0 truncate font-black">{a.name}</span>
                  <span className="min-w-0 flex-1 truncate text-violet-100/80">{a.text}</span>
                  <span className="shrink-0 text-xs font-bold text-violet-200/70">{formatSeconds(a.ms)} с</span>
                </div>
              ))}
          </div>
        </Panel>
      )}

      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} className="max-w-sm">
        <h2 className="text-center text-xl font-black">Ангийн горимыг хаах уу?</h2>
        <p className="mt-2 text-center text-sm font-semibold text-violet-100/80">
          Бүх ширээний тоглоом дуусч, сурагчид үндсэн цэс рүү буцна. Дүн хадгалагдаж, CSV-ээр татах боломжтой хэвээр үлдэнэ.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirmClose(false)}>
            Үгүй
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmClose(false);
              void run({ t: 'classClose' });
            }}
          >
            Хаах
          </Button>
        </div>
      </Modal>
    </div>
  );
}
