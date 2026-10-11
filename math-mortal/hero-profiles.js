// Shared class tuning used by both the Three.js arena and its 2D fallback.
export const HERO_PROFILES = Object.freeze({
  swordsman: Object.freeze({
    key: 'swordsman', name: 'СЭЛЭМЧИН',
    hp: 112, stamina: 100, staminaRegen: 22, speed: 3.8, damage: 32, recovery: 0.52,
    preferredRange: 2.15, rangeLabel: '2.95м сэлэм',
    strength: 'Тэнцвэртэй, найдвартай', weakness: 'Онцгой давуу талгүй',
    rhythm: 'Тэнцвэртэй, тогтвортой дайралт',
    actionCycle: ['slash', 'attack', 'kick', 'punch'],
    actions: Object.freeze({
      basic: Object.freeze({ mult: 1, range: 2.7, duration: 0.44, cost: 0 }),
      slash: Object.freeze({ mult: 1.16, range: 2.95, duration: 0.55, cost: 14 }),
      kick: Object.freeze({ mult: 0.82, range: 2.55, duration: 0.48, cost: 12 }),
      punch: Object.freeze({ mult: 0.65, range: 2.05, duration: 0.4, cost: 9 })
    })
  }),
  barbarian: Object.freeze({
    key: 'barbarian', name: 'БАРБАР',
    hp: 150, stamina: 90, staminaRegen: 13, speed: 3.1, damage: 43, recovery: 1.02,
    preferredRange: 2.45, rangeLabel: '3.1м хүнд цохилт',
    strength: 'Их HP, өндөр гэмтэл', weakness: 'Удаан, stamina удаан сэргэнэ',
    rhythm: 'Удаан боловч асар хүчтэй цохилт',
    actionCycle: ['kick', 'slash', 'kick', 'attack'],
    actions: Object.freeze({
      basic: Object.freeze({ mult: 1.18, range: 2.75, duration: 0.58, cost: 0 }),
      slash: Object.freeze({ mult: 1.48, range: 3.1, duration: 0.7, cost: 22 }),
      kick: Object.freeze({ mult: 1.08, range: 2.8, duration: 0.62, cost: 16 }),
      punch: Object.freeze({ mult: 0.88, range: 2.2, duration: 0.52, cost: 12 })
    })
  }),
  spearman: Object.freeze({
    key: 'spearman', name: 'ЖАДТАН',
    hp: 96, stamina: 120, staminaRegen: 25, speed: 3.6, damage: 30, recovery: 0.58,
    preferredRange: 3.15, rangeLabel: '4.0м жад',
    strength: 'Алсын хатгалт, их stamina', weakness: 'HP бага, ойрын цохилт сул',
    rhythm: 'Зайгаа барьж, хэмнэлтэй хатгана',
    actionCycle: ['spear', 'spear', 'spear', 'attack'],
    actions: Object.freeze({
      basic: Object.freeze({ mult: 0.9, range: 2.4, duration: 0.44, cost: 0 }),
      spear: Object.freeze({ mult: 1.42, range: 4, duration: 0.52, cost: 8 }),
      kick: Object.freeze({ mult: 0.72, range: 2.45, duration: 0.48, cost: 12 }),
      punch: Object.freeze({ mult: 0.58, range: 2, duration: 0.4, cost: 9 })
    })
  }),
  bomber: Object.freeze({
    key: 'bomber', name: 'ТЭСРЭГЧ',
    hp: 102, stamina: 105, staminaRegen: 18, speed: 3.4, damage: 25, recovery: 0.76,
    preferredRange: 5.2, rangeLabel: '9.5м бөмбөг',
    strength: '68 DMG, 4.5м дэлбэрэлт', weakness: 'Өндөр өртөг, 2.2с хүлээлт',
    rhythm: 'Алсаас ховор, том талбайн дэлбэрэлт',
    actionCycle: ['bomb', 'kick', 'bomb', 'attack'],
    actions: Object.freeze({
      basic: Object.freeze({ mult: 0.78, range: 2.3, duration: 0.44, cost: 0 }),
      bomb: Object.freeze({ mult: 1, damage: 68, range: 9.5, duration: 0.52, cost: 28, cooldown: 2.2, radius: 4.5, towerDamage: 74 }),
      kick: Object.freeze({ mult: 0.7, range: 2.35, duration: 0.48, cost: 12 }),
      punch: Object.freeze({ mult: 0.55, range: 1.95, duration: 0.4, cost: 9 })
    })
  }),
  archer: Object.freeze({
    key: 'archer', name: 'ХАРВААЧ',
    hp: 78, stamina: 125, staminaRegen: 27, speed: 3.9, damage: 24, recovery: 0.48,
    preferredRange: 10.5, rangeLabel: '13м сум',
    strength: '13м хурдан харваа', weakness: 'Хамгийн эмзэг, ойрын тулаан сул',
    rhythm: 'Хурдан, холын зайны тасралтгүй харваа',
    actionCycle: ['arrow', 'arrow', 'arrow', 'arrow', 'kick'],
    actions: Object.freeze({
      basic: Object.freeze({ mult: 0.65, range: 2, duration: 0.42, cost: 0 }),
      arrow: Object.freeze({ mult: 1.2, range: 13, duration: 0.46, cost: 7, cooldown: 0.82 }),
      kick: Object.freeze({ mult: 0.62, range: 2.2, duration: 0.46, cost: 11 }),
      punch: Object.freeze({ mult: 0.5, range: 1.8, duration: 0.38, cost: 8 })
    })
  })
});

export function getHeroProfile(key) {
  return HERO_PROFILES[key] || HERO_PROFILES.swordsman;
}

export function getHeroAction(key, action) {
  const profile = getHeroProfile(key);
  if (action === 'attack' || action === 'sword') action = 'basic';
  return profile.actions[action] || profile.actions.basic;
}
