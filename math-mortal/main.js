import { initQuizSettings } from './quiz.js';
import { lbLoad } from './leaderboard.js';
import { initMultiplayer } from './multiplayer.js';
import { HERO_PROFILES } from './hero-profiles.js';

/* Дээд баруун булангийн нэгдсэн цэс */
(() => {
  const btn = document.getElementById('quick-menu-btn');
  const menu = document.getElementById('quick-menu');
  if (!btn || !menu) return;
  const close = () => { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', event => {
    event.stopPropagation();
    const open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  /* Сонгосны дараа, гадна дарахад, Esc дарахад хаана */
  menu.addEventListener('click', () => close());
  document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target) && event.target !== btn) close();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
})();

initQuizSettings();
initMultiplayer();
lbLoad();

function addHeroCardDetails(button, profile) {
  const details = document.createElement('small');
  details.className = 'hero-card-details';
  details.textContent = [
    `HP ${profile.hp} · ST ${profile.stamina} · +${profile.staminaRegen}/с`,
    `Хурд ${profile.speed} · Зай ${profile.rangeLabel} · DMG ${profile.damage}`,
    `Давуу: ${profile.strength}`,
    `Сул: ${profile.weakness}`
  ].join('\n');
  button.appendChild(details);
  button.title = details.textContent.replaceAll('\n', ' · ');
}
for (const option of document.querySelectorAll('.hero-option[data-hero-key]')) {
  const profile = HERO_PROFILES[option.dataset.heroKey];
  if (profile) addHeroCardDetails(option, profile);
}
for (const option of document.querySelectorAll('.recruit-option[data-recruit-key]')) {
  const profile = HERO_PROFILES[option.dataset.recruitKey];
  if (profile) addHeroCardDetails(option, profile);
}

const heroOptions = [...document.querySelectorAll('.hero-option[data-hero-key]')];
window.__selectedHeroKey = 'swordsman';
for (const option of heroOptions) {
  option.setAttribute('aria-pressed', String(option.dataset.heroKey === window.__selectedHeroKey));
  option.classList.toggle('selected', option.dataset.heroKey === window.__selectedHeroKey);
  option.addEventListener('click', () => {
    window.__selectedHeroKey = option.dataset.heroKey;
    for (const card of heroOptions) {
      const selected = card === option;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
  });
}

let fallbackStarted = false;
let bootState = 'loading';

async function recoverTo2D(reason) {
  if (fallbackStarted) return;
  fallbackStarted = true;
  bootState = 'fallback';
  try {
    window.__arenaShutdown?.();
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    const { startFallback } = await import('./fallback.js');
    startFallback(reason);
  } catch (error) {
    const status = document.getElementById('status');
    const message = document.getElementById('msg');
    if (status) status.textContent = 'Reduced mode could not initialize. Try reloading this page.';
    if (message) message.textContent = 'The game could not start in 3D or reduced mode. Reload to try again.';
    console.error('Arena reduced-mode initialization failed:', error);
  }
}

window.__arenaFallback = recoverTo2D;
window.addEventListener('error', event => {
  if (bootState === 'ready' && event.error) {
    recoverTo2D('A 3D runtime error occurred; the arena has switched to reduced mode.');
  }
});

try {
  await import('./game3d.js');
  if (!fallbackStarted) bootState = 'ready';
} catch (error) {
  console.error('3D arena initialization failed; starting reduced mode.', error);
  await recoverTo2D('3D initialization was unavailable; running the procedural arena instead.');
}
