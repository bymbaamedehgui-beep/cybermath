import type { Difficulty, Grade, TopicId } from './types';

export interface TopicInfo {
  id: TopicId;
  name: string;
  icon: string;
  /** Lowest grade the topic is usually taught in (used by "mixed"). */
  minGrade: Grade;
}

export const TOPICS: TopicInfo[] = [
  { id: 'arithmetic', name: 'Арифметик', icon: '➕', minGrade: 6 },
  { id: 'fractions', name: 'Энгийн ба аравтын бутархай', icon: '½', minGrade: 6 },
  { id: 'percent', name: 'Хувь ба харьцаа', icon: '%', minGrade: 6 },
  { id: 'linear', name: 'Шугаман тэгшитгэл', icon: 'x', minGrade: 7 },
  { id: 'systems', name: 'Шугаман тэгшитгэлийн систем', icon: '{', minGrade: 8 },
  { id: 'inequalities', name: 'Тэнцэтгэл биш', icon: '<', minGrade: 7 },
  { id: 'quadratic', name: 'Квадрат тэгшитгэл', icon: 'x²', minGrade: 9 },
  { id: 'functions', name: 'Функц ба график', icon: 'ƒ', minGrade: 8 },
  { id: 'geometry', name: 'Геометр', icon: '△', minGrade: 6 },
  { id: 'trig', name: 'Тригонометр', icon: 'sin', minGrade: 10 },
  { id: 'probability', name: 'Магадлал', icon: '🎲', minGrade: 6 },
];

export const MIXED_TOPIC_NAME = 'Холимог (ангид тохирсон)';

export const GRADES: Grade[] = [6, 7, 8, 9, 10, 11, 12];

export const DIFFICULTY_NAMES: Record<Difficulty | 'auto', string> = {
  auto: 'Автомат',
  easy: 'Хялбар',
  medium: 'Дунд',
  hard: 'Хэцүү',
};

export function topicName(id: TopicId | 'mixed' | 'custom'): string {
  if (id === 'mixed') return MIXED_TOPIC_NAME;
  if (id === 'custom') return 'Багшийн асуулт';
  return TOPICS.find((t) => t.id === id)?.name ?? id;
}

export function topicsForGrade(grade: Grade): TopicId[] {
  return TOPICS.filter((t) => t.minGrade <= grade).map((t) => t.id);
}
