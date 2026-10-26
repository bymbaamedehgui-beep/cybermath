import { useRef, useState } from 'react';
import type { CustomQuestion, Difficulty } from '../../../shared/math/types';
import { DIFFICULTY_NAMES } from '../../../shared/math/topics';
import { QuestionBody } from '../../components/MathText';
import { setGameSettings, usePrefs } from '../../store/prefs';
import { dateStamp, downloadCsv, parseCsv } from '../../util/csv';
import { Button, Field, inputCls, Modal, Panel, Segmented, Select } from '../../ui/ui';

const LETTERS = ['A', 'B', 'C', 'D'];

function emptyDraft(): CustomQuestion {
  return { id: '', text: '', choices: ['', '', '', ''], answer: 0, difficulty: 'medium' };
}

function validate(q: CustomQuestion): string | null {
  if (!q.text.trim()) return 'Асуултаа бичнэ үү.';
  if (q.choices.some((c) => !c.trim())) return 'Дөрвөн хариултыг бүгдийг бөглөнө үү.';
  if (new Set(q.choices.map((c) => c.trim())).size !== 4) return 'Хариултууд давхардахгүй байх ёстой.';
  return null;
}

export function QuestionsTab() {
  const prefs = usePrefs();
  const list = prefs.settings.customQuestions;
  const [draft, setDraft] = useState<CustomQuestion>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CustomQuestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = (q: CustomQuestion[]) => setGameSettings({ customQuestions: q });

  const submit = () => {
    const e = validate(draft);
    if (e) {
      setError(e);
      return;
    }
    const clean: CustomQuestion = {
      ...draft,
      text: draft.text.trim(),
      choices: draft.choices.map((c) => c.trim()) as CustomQuestion['choices'],
      explanation: draft.explanation?.trim() || undefined,
      id: draft.id || Math.random().toString(36).slice(2, 10),
    };
    if (draft.id) save(list.map((q) => (q.id === draft.id ? clean : q)));
    else save([...list, clean]);
    setDraft(emptyDraft());
    setError(null);
    setNotice(draft.id ? 'Асуулт шинэчлэгдлээ.' : 'Асуулт нэмэгдлээ.');
    setTimeout(() => setNotice(null), 2000);
  };

  const exportCsv = () => {
    downloadCsv(`math-kittens-asuultuud_${dateStamp()}.csv`, [
      ['Асуулт', 'A', 'B', 'C', 'D', 'Зөв хариулт', 'Хүндрэл', 'Хугацаа (с)', 'Тайлбар'],
      ...list.map((q) => [q.text, ...q.choices, LETTERS[q.answer], DIFFICULTY_NAMES[q.difficulty], q.time ?? '', q.explanation ?? '']),
    ]);
  };

  const importCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    const diffByName: Record<string, Difficulty> = { хялбар: 'easy', дунд: 'medium', хэцүү: 'hard', easy: 'easy', medium: 'medium', hard: 'hard' };
    const added: CustomQuestion[] = [];
    let skipped = 0;
    for (const r of rows) {
      if (r[0]?.trim().toLowerCase() === 'асуулт') continue;
      const ans = LETTERS.indexOf((r[5] ?? '').trim().toUpperCase());
      const q: CustomQuestion = {
        id: Math.random().toString(36).slice(2, 10),
        text: (r[0] ?? '').trim(),
        choices: [r[1], r[2], r[3], r[4]].map((c) => (c ?? '').trim()) as CustomQuestion['choices'],
        answer: ans >= 0 ? ans : Math.max(0, Math.min(3, Number(r[5]) - 1 || 0)),
        difficulty: diffByName[(r[6] ?? '').trim().toLowerCase()] ?? 'medium',
        time: Number(r[7]) ? Math.max(5, Math.min(60, Math.round(Number(r[7])))) : undefined,
        explanation: (r[8] ?? '').trim() || undefined,
      };
      if (validate(q)) skipped++;
      else added.push(q);
    }
    save([...list, ...added]);
    setNotice(`${added.length} асуулт нэмэгдлээ${skipped ? `, ${skipped} мөр алдаатай тул алгаслаа` : ''}.`);
    setTimeout(() => setNotice(null), 3500);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Panel>
        <h2 className="mb-3 text-lg font-black">{draft.id ? '✏️ Асуулт засах' : '➕ Шинэ асуулт'}</h2>
        <div className="grid gap-3">
          <Field label="Асуулт">
            <textarea
              className={`${inputCls} min-h-24 resize-y`}
              value={draft.text}
              maxLength={400}
              placeholder="Жишээ нь: x + y = 7, x − y = 1 бол x = ?"
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </Field>
          <div className="text-sm font-bold text-violet-200/90">Хариултууд (зөвийг нь сонгоно уу)</div>
          {draft.choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, answer: i })}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black transition ${
                  draft.answer === i ? 'bg-emerald-400 text-[#03261a] shadow-[0_0_14px_rgba(52,211,153,0.6)]' : 'bg-white/10 text-white'
                }`}
                title="Зөв хариулт болгох"
              >
                {draft.answer === i ? '✓' : LETTERS[i]}
              </button>
              <input
                className={inputCls}
                value={c}
                maxLength={120}
                placeholder={`${LETTERS[i]} хариулт`}
                onChange={(e) => {
                  const choices = [...draft.choices] as CustomQuestion['choices'];
                  choices[i] = e.target.value;
                  setDraft({ ...draft, choices });
                }}
              />
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Хүндрэл">
              <Segmented
                value={draft.difficulty}
                onChange={(difficulty) => setDraft({ ...draft, difficulty })}
                options={(['easy', 'medium', 'hard'] as const).map((d) => ({ value: d, label: DIFFICULTY_NAMES[d] }))}
              />
            </Field>
            <Field label="Хугацаа">
              <Select
                value={draft.time ?? 0}
                onChange={(v) => setDraft({ ...draft, time: v || undefined })}
                options={[{ value: 0, label: 'Ерөнхий тохиргоогоор' }, ...[10, 15, 20, 25, 30, 45, 60].map((n) => ({ value: n, label: `${n} секунд` }))]}
              />
            </Field>
          </div>
          <Field label="Тайлбар (заавал биш)" hint="Хариулсны дараа сурагчдад харагдана.">
            <input
              className={inputCls}
              value={draft.explanation ?? ''}
              maxLength={300}
              placeholder="Жишээ нь: Тэгшитгэлүүдийг нэмбэл 2x = 8 ⇒ x = 4"
              onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
            />
          </Field>
          {error && <div className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-bold text-rose-100">{error}</div>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setPreview({ ...draft, id: 'preview' })} disabled={!!validate(draft)}>
              👁 Урьдчилан харах
            </Button>
            <Button onClick={submit}>{draft.id ? 'Хадгалах' : 'Нэмэх'}</Button>
          </div>
          {draft.id && (
            <Button
              variant="plain"
              size="sm"
              onClick={() => {
                setDraft(emptyDraft());
                setError(null);
              }}
            >
              Засварлахыг болих
            </Button>
          )}
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black">📚 Миний асуултууд ({list.length})</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              ⬆ CSV оруулах
            </Button>
            <Button size="sm" variant="ghost" onClick={exportCsv} disabled={!list.length}>
              ⬇ CSV татах
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {notice && <div className="mb-3 rounded-xl bg-emerald-500/20 px-3 py-2 text-sm font-bold text-emerald-100">{notice}</div>}
        {list.length === 0 ? (
          <p className="rounded-2xl bg-black/20 p-4 text-sm font-semibold text-violet-100/75">
            Одоогоор асуулт алга. Зүүн талын маягтаар нэмэх эсвэл CSV файл оруулна уу. CSV багануудын дараалал: Асуулт, A, B, C, D, Зөв хариулт (A–D), Хүндрэл, Хугацаа, Тайлбар.
          </p>
        ) : (
          <div className="thin-scroll grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
            {list.map((q, idx) => (
              <div key={q.id} className="rounded-2xl bg-black/20 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded-lg bg-white/10 px-2 text-xs font-black">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-pre-line break-words font-bold">{q.text}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-bold">
                      {q.choices.map((c, i) => (
                        <span key={i} className={`rounded-lg px-2 py-0.5 ${i === q.answer ? 'bg-emerald-400/30 text-emerald-100' : 'bg-white/8 text-violet-100/80'}`}>
                          {LETTERS[i]}. {c}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-violet-200/60">
                      {DIFFICULTY_NAMES[q.difficulty]}
                      {q.time ? ` · ${q.time} с` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDraft(structuredClone(q))} title="Засах">
                      ✏️
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => save(list.filter((x) => x.id !== q.id))} title="Устгах">
                      🗑
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {list.length > 0 && (
          <div className="mt-3 rounded-2xl bg-cyan-400/10 p-3 text-xs font-semibold text-cyan-100/90">
            «Тохиргоо» хэсгийн «Асуултын эх сурвалж»-аас эдгээрийг тоглоомд хэрхэн ашиглахаа сонгоно.
          </div>
        )}
      </Panel>

      <Modal open={!!preview} onClose={() => setPreview(null)}>
        {preview && (
          <>
            <div className="mb-3 text-center text-sm font-black text-violet-200/80">Сурагчдад ингэж харагдана</div>
            <QuestionBody
              q={{ id: 'p', topic: 'custom', difficulty: preview.difficulty, grade: prefs.settings.grade, text: preview.text, choices: preview.choices, timeSuggested: 20, custom: true }}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {preview.choices.map((c, i) => (
                <div key={i} className={`rounded-2xl px-3 py-2.5 font-black ${i === preview.answer ? 'bg-emerald-500/40 ring-2 ring-emerald-300' : 'bg-white/10'}`}>
                  {LETTERS[i]}. {c}
                </div>
              ))}
            </div>
            <Button variant="neon" className="mt-4 w-full" onClick={() => setPreview(null)}>
              Хаах
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
