import { memo } from 'react';
import { CARD_INFO, type CardType } from '../../shared/cards';
import { CardArt, CardBack } from '../art';

/** A card face. Size it with the parent (width); height follows the 5:7 ratio. */
export const CardFace = memo(function CardFace({
  type,
  className = '',
  showText = true,
  glow = false,
}: {
  type: CardType;
  className?: string;
  showText?: boolean;
  glow?: boolean;
}) {
  const info = CARD_INFO[type];
  return (
    <div
      className={`card-shell relative aspect-[5/7] overflow-hidden rounded-[9%/6.4%] ${className}`}
      style={{
        background: `linear-gradient(155deg, ${info.color2} 0%, ${info.color} 55%, ${shade(info.color)} 100%)`,
        boxShadow: glow
          ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 28px ${info.color}, 0 12px 26px rgba(0,0,0,0.45)`
          : `0 0 0 1.5px rgba(255,255,255,0.55), 0 8px 18px rgba(5,2,20,0.5)`,
      }}
    >
      <div className="absolute inset-[3.5cqw] rounded-[7cqw] border-[1.2cqw] border-white/35 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.28),rgba(255,255,255,0)_62%)]" />
      <div className="absolute inset-x-[6cqw] top-[6cqw] flex min-h-[19cqw] items-center justify-center rounded-[5cqw] bg-[#1b1035]/80 px-[3cqw] py-[1.5cqw] text-center">
        <span className="text-[9.5cqw] font-black leading-[1.05] text-white [text-wrap:balance]">{info.name}</span>
      </div>
      <div className={`absolute inset-x-[4cqw] ${showText ? 'top-[25cqw] bottom-[34cqw]' : 'top-[27cqw] bottom-[8cqw]'} flex items-center justify-center`}>
        <CardArt type={type} className="h-full w-full drop-shadow-[0_4px_0_rgba(27,16,53,0.35)]" />
      </div>
      {showText && (
        <div className="absolute inset-x-[6cqw] bottom-[6cqw] flex min-h-[25cqw] items-center justify-center rounded-[5cqw] bg-white/85 px-[3cqw] py-[2cqw] text-center">
          <span className="text-[8cqw] font-extrabold leading-[1.12] text-[#1b1035] [text-wrap:balance]">{info.short}</span>
        </div>
      )}
    </div>
  );
});

export const CardBackFace = memo(function CardBackFace({ className = '' }: { className?: string }) {
  return (
    <div className={`card-shell relative aspect-[5/7] overflow-hidden rounded-[9%/6.4%] shadow-[0_0_0_1.5px_rgba(34,229,255,0.5),0_8px_18px_rgba(5,2,20,0.55)] ${className}`}>
      <CardBack className="absolute inset-0 h-full w-full" />
    </div>
  );
});

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.62);
  const g = Math.round(((n >> 8) & 255) * 0.62);
  const b = Math.round((n & 255) * 0.62);
  return `rgb(${r},${g},${b})`;
}
