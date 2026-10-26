import type { ReactElement } from 'react';
import type { CardType } from '../../shared/cards';
import { AttackArt, ExplodeArt, ReverseArt, RescueArt, SkipArt } from './cardsA';
import { ChallengeArt, DoubleArt, FutureArt, ShuffleArt, StealArt } from './cardsB';

const SCENES: Record<CardType, () => ReactElement> = {
  explode: ExplodeArt,
  rescue: RescueArt,
  skip: SkipArt,
  attack: AttackArt,
  reverse: ReverseArt,
  future: FutureArt,
  shuffle: ShuffleArt,
  steal: StealArt,
  challenge: ChallengeArt,
  double: DoubleArt,
};

/** Card-face illustration, viewBox 0 0 200 200, transparent background. */
export function CardArt({ type, className }: { type: CardType; className?: string }) {
  const Scene = SCENES[type] ?? ExplodeArt;
  return (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <Scene />
    </svg>
  );
}
