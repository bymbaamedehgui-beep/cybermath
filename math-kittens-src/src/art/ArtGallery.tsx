import type { CSSProperties, ReactNode } from 'react';
import { CARD_INFO, CARD_TYPES, type CardType } from '../../shared/cards';
import {
  AVATAR_COLORS,
  AVATAR_COUNT,
  BombIcon,
  CardArt,
  CardBack,
  CatAvatar,
  ExplosionBurst,
  MascotCat,
  type AvatarMood,
} from './index';

const MOODS: AvatarMood[] = ['idle', 'happy', 'sad', 'shocked', 'ko'];
const AVATAR_NAMES = ['Orange tabby', 'Gray', 'Black', 'White + bow', 'Calico', 'Siamese', 'Tuxedo + glasses', 'Cream ginger'];

const page: CSSProperties = {
  minHeight: '100vh',
  background: '#140b2e',
  color: '#f3ecff',
  padding: '24px 16px 64px',
  fontFamily: "'Nunito Variable', Nunito, Arial, sans-serif",
};
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' };
const label: CSSProperties = { fontSize: 12, opacity: 0.7, textAlign: 'center', marginTop: 4 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 12px', color: '#22e5ff' }}>{title}</h2>
      {children}
    </section>
  );
}

function CardSample({ type, width }: { type: CardType; width: number }) {
  const info = CARD_INFO[type];
  const small = width < 150;
  return (
    <div
      style={{
        width,
        height: width * 1.4,
        borderRadius: width * 0.09,
        background: `linear-gradient(135deg, ${info.color}, ${info.color2})`,
        border: '3px solid #1b1035',
        boxShadow: '0 6px 18px rgba(0,0,0,.45)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <CardArt type={type} className="mk-fill" />
      <div
        style={{
          fontWeight: 900,
          fontSize: small ? 11 : 17,
          color: '#fff',
          textShadow: '0 2px 0 #1b1035',
          textAlign: 'center',
          padding: '0 6px',
          lineHeight: 1.1,
        }}
      >
        {info.name}
      </div>
    </div>
  );
}

/** Review page for every illustration in src/art. */
export default function ArtGallery() {
  return (
    <div style={page}>
      <style>{'.mk-fill{display:block;width:100%;height:auto}'}</style>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 24px' }}>Математик Муурнууд: art gallery</h1>

      <Section title="Card art (200px)">
        <div style={row}>
          {CARD_TYPES.map((t) => (
            <div key={t}>
              <CardSample type={t} width={200} />
              <div style={label}>{t}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Phone hand size (110px)">
        <div style={{ ...row, gap: 8 }}>
          {CARD_TYPES.map((t) => (
            <CardSample key={t} type={t} width={110} />
          ))}
        </div>
      </Section>

      <Section title="Card back">
        <div style={{ ...row, alignItems: 'flex-end' }}>
          <div style={{ width: 200 }}>
            <CardBack className="mk-fill" />
          </div>
          <div style={{ width: 110 }}>
            <CardBack className="mk-fill" />
          </div>
        </div>
      </Section>

      <Section title="Avatars (8 × 5 moods)">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 8 }}>
            <thead>
              <tr>
                <th />
                {MOODS.map((m) => (
                  <th key={m} style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>
                    {m}
                  </th>
                ))}
                <th style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>48px</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: AVATAR_COUNT }, (_, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap', paddingRight: 8 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        background: AVATAR_COLORS[i],
                        marginRight: 6,
                      }}
                    />
                    {i}. {AVATAR_NAMES[i]}
                  </td>
                  {MOODS.map((m) => (
                    <td key={m} style={{ width: 72 }}>
                      <CatAvatar index={i} mood={m} className="mk-fill" />
                    </td>
                  ))}
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {MOODS.map((m) => (
                        <div key={m} style={{ width: 48 }}>
                          <CatAvatar index={i} mood={m} className="mk-fill" />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Mascot">
        <div style={{ maxWidth: 640 }}>
          <MascotCat className="mk-fill" />
        </div>
      </Section>

      <Section title="Bomb icon & explosion burst">
        <div style={{ ...row, alignItems: 'center' }}>
          <div style={{ width: 128 }}>
            <BombIcon className="mk-fill" />
          </div>
          <div style={{ width: 64 }}>
            <BombIcon className="mk-fill" />
          </div>
          <div style={{ width: 32 }}>
            <BombIcon className="mk-fill" />
          </div>
          <div style={{ width: 200 }}>
            <ExplosionBurst className="mk-fill" />
          </div>
        </div>
      </Section>
    </div>
  );
}
