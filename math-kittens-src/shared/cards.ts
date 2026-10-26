export type CardType =
  | 'explode'
  | 'rescue'
  | 'skip'
  | 'attack'
  | 'reverse'
  | 'future'
  | 'shuffle'
  | 'steal'
  | 'challenge'
  | 'double';

export interface Card {
  id: string;
  type: CardType;
}

export interface CardInfo {
  name: string;
  /** One-line effect shown on the card face. */
  short: string;
  /** Longer rule text for the rules screen / card preview. */
  desc: string;
  /** Frame gradient colors. */
  color: string;
  color2: string;
  /** Can be played from the hand on your own turn. */
  playable: boolean;
  /** Needs another player as a target. */
  needsTarget: boolean;
}

export const CARD_INFO: Record<CardType, CardInfo> = {
  explode: {
    name: 'Тэсрэх Муур',
    short: 'Бодлогоо бод, эс бөгөөс тэсэрнэ!',
    desc: 'Энэ картыг сугалбал хугацаатай бодлого гарна. Зөв бодвол амьд үлдэж, картыг тавцангийн хүссэн байрлалд нууцаар буцаана. Буруу бол Аврагч Муураа ашиглана, байхгүй бол хасагдана.',
    color: '#ff4d6d',
    color2: '#ff9f1c',
    playable: false,
    needsTarget: false,
  },
  rescue: {
    name: 'Аврагч Муур',
    short: 'Тэсрэлтээс нэг удаа аврана',
    desc: 'Тэсрэх Муурын бодлогыг буруу бодсон эсвэл хугацаа дууссан үед автоматаар хамгаалж, тэсрэх картыг тавцанд буцаана.',
    color: '#10b981',
    color2: '#6ee7b7',
    playable: false,
    needsTarget: false,
  },
  skip: {
    name: 'Алгасагч Муур',
    short: 'Сугалахгүйгээр ээлжээ дуусга',
    desc: 'Карт сугалахгүйгээр ээлжээ шууд дуусгана. Довтолгоонд өртөж 2 ээлжтэй бол зөвхөн нэг ээлжийг алгасна.',
    color: '#3b82f6',
    color2: '#93c5fd',
    playable: true,
    needsTarget: false,
  },
  attack: {
    name: 'Довтлогч Муур',
    short: 'Дараагийнх нь 2 ээлж тоглоно',
    desc: 'Карт сугалахгүйгээр ээлжээ дуусгаж, дараагийн тоглогчийг дараалан 2 ээлж тоглуулна.',
    color: '#e11d48',
    color2: '#fb7185',
    playable: true,
    needsTarget: false,
  },
  reverse: {
    name: 'Эргүүлэгч Муур',
    short: 'Чиглэлийг эргүүлж, ээлжээ дуусга',
    desc: 'Тоглолтын чиглэлийг эсрэгээр нь эргүүлж, карт сугалахгүйгээр ээлжээ дуусгана.',
    color: '#8b5cf6',
    color2: '#c4b5fd',
    playable: true,
    needsTarget: false,
  },
  future: {
    name: 'Зөн Билэгч Муур',
    short: 'Дээд 3 картыг нууцаар хар',
    desc: 'Тавцангийн хамгийн дээд 3 картыг зөвхөн өөрөө харна. Дараалал нь өөрчлөгдөхгүй.',
    color: '#06b6d4',
    color2: '#67e8f9',
    playable: true,
    needsTarget: false,
  },
  shuffle: {
    name: 'Холигч Муур',
    short: 'Тавцанг холино',
    desc: 'Үлдсэн тавцанг санамсаргүйгээр сайтар холино. Нуусан тэсрэх муурын байрлал хэнд ч мэдэгдэхгүй болно.',
    color: '#eab308',
    color2: '#fde047',
    playable: true,
    needsTarget: false,
  },
  steal: {
    name: 'Хулгайч Муур',
    short: 'Нэг тоглогчоос карт хулгайл',
    desc: 'Тоглогч сонгоод түүний гараас санамсаргүй нэг картыг өөртөө авна.',
    color: '#475569',
    color2: '#94a3b8',
    playable: true,
    needsTarget: true,
  },
  challenge: {
    name: 'Сорилтын Муур',
    short: 'Өрсөлдөгчдөө бодлого илгээ',
    desc: 'Тоглогч сонгож бодлого илгээнэ. Тэр буруу бодвол чи түүнээс санамсаргүй карт авна. Зөв бодвол тэр чамаас карт авна!',
    color: '#f97316',
    color2: '#fdba74',
    playable: true,
    needsTarget: true,
  },
  double: {
    name: 'Давхар Хүчит Муур',
    short: 'Бодлого бодоод нэмэлт үйлдэл хий',
    desc: 'Бодлого бодно. Зөв бол нэмэлт үйлдэл сонгоно: ирээдүйг харах, карт хулгайлах эсвэл ээлжээ алгасах.',
    color: '#d946ef',
    color2: '#f0abfc',
    playable: true,
    needsTarget: false,
  },
};

export const CARD_TYPES: CardType[] = [
  'explode',
  'rescue',
  'skip',
  'attack',
  'reverse',
  'future',
  'shuffle',
  'steal',
  'challenge',
  'double',
];

export const ACTION_TYPES: CardType[] = [
  'skip',
  'attack',
  'reverse',
  'future',
  'shuffle',
  'steal',
  'challenge',
  'double',
];
