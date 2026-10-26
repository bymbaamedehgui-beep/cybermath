import type { GameSettings } from '../../shared/game/types';
import { DIFFICULTY_NAMES, GRADES, MIXED_TOPIC_NAME, TOPICS, topicName } from '../../shared/math/topics';
import type { Grade } from '../../shared/math/types';
import { Field, Segmented, Select } from '../ui/ui';

export const TIME_OPTIONS: { value: number | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Автомат (хүндрэлээр 10–30 с)' },
  { value: 10, label: '10 секунд' },
  { value: 15, label: '15 секунд' },
  { value: 20, label: '20 секунд' },
  { value: 25, label: '25 секунд' },
  { value: 30, label: '30 секунд' },
];

export function settingsSummary(s: GameSettings): string {
  const time = s.timeLimit === 'auto' ? 'автомат хугацаа' : `${s.timeLimit} секунд`;
  return `${s.grade}-р анги · ${topicName(s.topic)} · ${time}`;
}

export function SettingsForm({
  value,
  onChange,
  showSource = true,
}: {
  value: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  showSource?: boolean;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Анги">
        <Segmented<Grade> value={value.grade} onChange={(grade) => onChange({ grade })} options={GRADES.map((g) => ({ value: g, label: `${g}` }))} />
      </Field>
      <Field label="Сэдэв">
        <Select
          value={value.topic}
          onChange={(topic) => onChange({ topic })}
          options={[{ value: 'mixed' as const, label: `🎲 ${MIXED_TOPIC_NAME}` }, ...TOPICS.map((t) => ({ value: t.id, label: `${t.icon}  ${t.name}` }))]}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Хүндрэл">
          <Segmented
            value={value.difficulty}
            onChange={(difficulty) => onChange({ difficulty })}
            options={(['auto', 'easy', 'medium', 'hard'] as const).map((d) => ({ value: d, label: DIFFICULTY_NAMES[d] }))}
          />
        </Field>
        <Field label="Бодлого бүрийн хугацаа">
          <Select value={value.timeLimit} onChange={(timeLimit) => onChange({ timeLimit })} options={TIME_OPTIONS} />
        </Field>
      </div>
      {showSource && value.customQuestions.length > 0 && (
        <Field label={`Асуултын эх сурвалж (багшийн ${value.customQuestions.length} асуулт)`}>
          <Segmented
            value={value.questionSource}
            onChange={(questionSource) => onChange({ questionSource })}
            options={[
              { value: 'generated', label: 'Автомат' },
              { value: 'mixed', label: 'Холимог' },
              { value: 'custom', label: 'Зөвхөн багшийн' },
            ]}
          />
        </Field>
      )}
    </div>
  );
}
