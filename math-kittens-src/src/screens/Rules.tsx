import { CARD_INFO, CARD_TYPES } from '../../shared/cards';
import { CardFace } from '../components/GameCard';
import { Panel, Screen } from '../ui/ui';

const SECTIONS: { icon: string; title: string; text: string }[] = [
  {
    icon: '🎯',
    title: 'Зорилго',
    text: 'Тэсрэх муурнаас зугтаж, математикаараа амьд үлд! Хамгийн сүүлд үлдсэн тоглогч ялна.',
  },
  {
    icon: '🃏',
    title: 'Эхлэл',
    text: '2–5 тоглогч оролцоно. Хүн бүр 5 карт авна, тэдгээрийн нэг нь заавал Аврагч Муур. Тавцанд тоглогчдын тооноос нэгээр цөөн Тэсрэх Муур нуугдсан байдаг.',
  },
  {
    icon: '🔁',
    title: 'Ээлж',
    text: 'Ээлжиндээ хүссэн тооны үйлдлийн карт тоглож болно, эсвэл огт тоглохгүй байж болно. Эцэст нь тавцангаас нэг карт сугалж ээлжээ дуусгана. Алгасагч, Довтлогч, Эргүүлэгч карт сугалахгүйгээр ээлжийг дуусгана.',
  },
  {
    icon: '💣',
    title: 'Тэсрэх Муур',
    text: 'Сугалмагц хугацаатай бодлого гарна: 4 хариултаас ганц нь зөв. Зөв бодвол амьд үлдэж, картыг тавцангийн хүссэн байрлалд нууцаар буцаана. Буруу эсвэл хугацаа дуусвал Аврагч Муур хамгаална. Аврагчгүй бол тэсэрч хасагдана.',
  },
  {
    icon: '⚠️',
    title: 'Сүүлчийн шат',
    text: 'Тавцанд зөвхөн тэсрэх муур үлдвэл бодлого бүрийн хугацаа 2 секундээр богиносно. Хурдан бод!',
  },
  {
    icon: '⭐',
    title: 'Оноо',
    text: 'Зөв хариулт бүр 100 оноо дээр хурдны урамшуулал (100 хүртэл) нэмнэ. Ялагч нэмэлт 200 оноо авна. Зөв хариулт гарсны дараа бодолтын тайлбар харагдана.',
  },
  {
    icon: '👆',
    title: 'Удирдлага',
    text: 'Карт дээр дарж сонгоод «Тоглох» товч дарна. Хулгайч ба Сорилтын Муурт тоглогч сонгоно. Компьютер дээр картыг давхар товшиж, бодлогод 1–4 эсвэл A–D товч ашиглаж болно.',
  },
];

export function RulesContent() {
  return (
    <div>
      <h2 className="text-center text-2xl font-black text-cyan-200">📖 Тоглоомын дүрэм</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-2xl bg-black/20 p-3.5">
            <div className="text-lg font-black">
              {s.icon} {s.title}
            </div>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-violet-100/85">{s.text}</p>
          </div>
        ))}
      </div>
      <h3 className="mt-6 text-center text-xl font-black text-orange-200">Картууд</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {CARD_TYPES.map((t) => (
          <div key={t} className="flex gap-3 rounded-2xl bg-black/20 p-3">
            <div className="w-20 shrink-0 sm:w-24">
              <CardFace type={t} showText={false} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-black" style={{ color: CARD_INFO[t].color2 }}>
                {CARD_INFO[t].name}
              </div>
              <p className="mt-1 text-sm font-semibold leading-snug text-violet-100/85">{CARD_INFO[t].desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RulesScreen({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="Дүрэм" onBack={onBack} wide>
      <Panel>
        <RulesContent />
      </Panel>
    </Screen>
  );
}
