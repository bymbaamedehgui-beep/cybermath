// Mongolian text for game events (the log and pop-up messages).

import { CARD_INFO } from '../../shared/cards';
import type { DoubleChoice, GameEvent, GameView } from '../../shared/game/types';

export type Tone = 'info' | 'good' | 'bad' | 'warn';

export const DOUBLE_NAMES: Record<DoubleChoice, string> = {
  future: 'Ирээдүйг харах',
  steal: 'Карт хулгайлах',
  skip: 'Ээлжээ алгасах',
};

export function playerName(view: GameView, id: string | null | undefined, you = 'Та'): string {
  if (!id) return '';
  if (id === view.you) return you;
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

const card = (t: keyof typeof CARD_INFO) => `«${CARD_INFO[t].name}»`;

export function eventText(ev: GameEvent, view: GameView): { text: string; tone: Tone } | null {
  const n = (id: string) => playerName(view, id);
  const mine = (id: string) => id === view.you;
  switch (ev.type) {
    case 'start':
      return { text: `Тоглоом эхэллээ! Эхний ээлж: ${n(ev.firstId)}`, tone: 'info' };
    case 'turn':
      return {
        text: mine(ev.playerId)
          ? `Таны ээлж${ev.turnsRemaining > 1 ? ` (${ev.turnsRemaining} ээлж үлдсэн)` : ''}`
          : `Ээлж: ${n(ev.playerId)}${ev.turnsRemaining > 1 ? ` (${ev.turnsRemaining} ээлж)` : ''}`,
        tone: 'info',
      };
    case 'play':
      return {
        text: `${n(ev.playerId)} ${card(ev.card.type)} тоглолоо${ev.targetId ? ` → ${n(ev.targetId)}` : ''}`,
        tone: 'info',
      };
    case 'draw':
      return {
        text: ev.card ? `${n(ev.playerId)} ${card(ev.card.type)} сугаллаа` : `${n(ev.playerId)} нэг карт сугаллаа`,
        tone: 'info',
      };
    case 'explodeDrawn':
      return { text: `💥 ${n(ev.playerId)} Тэсрэх Муур сугаллаа!`, tone: 'bad' };
    case 'mathStart':
      if (ev.purpose === 'challenge') return { text: `🎯 Сорилт: ${n(ev.sourceId)} → ${n(ev.playerId)}`, tone: 'warn' };
      if (ev.purpose === 'double') return { text: `⚡ ${n(ev.playerId)} давхар хүчний бодлого бодож байна`, tone: 'info' };
      if (ev.purpose === 'action') return { text: `🧮 ${n(ev.playerId)} картаа идэвхжүүлэхээр бодож байна`, tone: 'info' };
      return { text: `🧮 ${n(ev.playerId)} амь тэмцэн бодож байна!`, tone: 'warn' };
    case 'answer':
      if (ev.chosen === null) return { text: `⏰ ${n(ev.playerId)}: хугацаа дууслаа`, tone: 'bad' };
      return ev.correct
        ? { text: `✅ ${n(ev.playerId)} зөв бодлоо (+${ev.points} оноо)`, tone: 'good' }
        : { text: `❌ ${n(ev.playerId)} буруу хариуллаа`, tone: 'bad' };
    case 'rescueUsed':
      return { text: `🛡️ ${n(ev.playerId)} Аврагч Муураар аврагдлаа!`, tone: 'good' };
    case 'inserted':
      return {
        text:
          ev.position >= 0
            ? `🤫 Та тэсрэх муурыг дээрээс ${ev.position + 1}-р байранд нуулаа`
            : `🤫 ${n(ev.playerId)} тэсрэх муурыг тавцанд нууцаар нуулаа`,
        tone: 'warn',
      };
    case 'eliminated':
      return { text: `💀 ${n(ev.playerId)} тэсэрч хасагдлаа!`, tone: 'bad' };
    case 'future':
      return {
        text: mine(ev.playerId) ? '🔮 Та тавцангийн дээд 3 картыг харлаа' : `🔮 ${n(ev.playerId)} ирээдүйг харлаа`,
        tone: 'info',
      };
    case 'shuffle':
      return { text: `🔀 ${n(ev.playerId)} тавцанг холилоо`, tone: 'info' };
    case 'steal': {
      const head = ev.reason === 'challenge' ? '🎯 Сорилтын шагнал' : '🦝 Хулгай';
      return { text: `${head}: ${n(ev.fromId)} → ${n(ev.toId)}${ev.card ? ` ${card(ev.card.type)}` : ''}`, tone: 'warn' };
    }
    case 'nothingToSteal':
      return { text: `🤷 Авах карт олдсонгүй (${n(ev.fromId)})`, tone: 'info' };
    case 'reverse':
      return { text: `🔄 ${n(ev.playerId)} чиглэлийг эргүүллээ`, tone: 'info' };
    case 'attack':
      return { text: `⚔️ ${n(ev.playerId)} довтоллоо! ${n(ev.targetId)} ${ev.turns} ээлж тоглоно`, tone: 'warn' };
    case 'skip':
      return { text: `😴 ${n(ev.playerId)} ээлжээ алгаслаа`, tone: 'info' };
    case 'doubleChoice':
      return { text: `⚡ ${n(ev.playerId)}: ${DOUBLE_NAMES[ev.choice]}`, tone: 'good' };
    case 'fizzle':
      return { text: `💨 ${n(ev.playerId)}: ${card(ev.cardType)} хүчингүй боллоо`, tone: 'bad' };
    case 'finalStage':
      return { text: '⚠️ Сүүлчийн шат! Тавцанд зөвхөн тэсрэх муур үлдлээ — хугацаа богиносно!', tone: 'bad' };
    case 'timeout':
      if (ev.what === 'turn') return { text: `⏰ ${n(ev.playerId)}: хугацаа дуусч автоматаар карт сугаллаа`, tone: 'warn' };
      if (ev.what === 'insert') return { text: `⏰ ${n(ev.playerId)}: тэсрэх муур санамсаргүй байранд нуугдлаа`, tone: 'warn' };
      if (ev.what === 'double') return { text: `⏰ ${n(ev.playerId)}: автоматаар ирээдүйг харлаа`, tone: 'warn' };
      return null;
    case 'win':
      return { text: mine(ev.playerId) ? '🏆 Та яллаа!' : `🏆 ${n(ev.playerId)} ялагч боллоо!`, tone: 'good' };
  }
}

export function formatSeconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',');
}
