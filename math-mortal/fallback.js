// Self-contained, procedural 2D arena used when the WebGL game cannot initialize.
import { createQuizQuestion, getQuizSettings, applyQuizSettings } from './quiz.js';
import { setMathText } from './mathtext.js';
import { lbSubmit, MAX_WAVE } from './leaderboard.js';
import { HERO_PROFILES, getHeroProfile, getHeroAction } from './hero-profiles.js';

export function startFallback(reason = 'Reduced mode active.') {
  const $ = id => document.getElementById(id);
  const container = $('game-container');
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Procedural arena fallback game view');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  container.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  const statusEl = $('status');
  const overlay = $('overlay');
  const button = $('play');
  const message = $('msg');
  if (message) message.textContent = 'Хөх чулуун цайзаа хамгаалж, улаан болор цайзыг нураа! Зөв хариулт бүр баатруудад шууд довтлох тушаал өгнө; хариулт хүлээх зуур тэд 8 секунд тутам автоматаар довтолно. Урамшууллаар шинэ баатар нэмэхэд төрлийг нь өөрөө сонгоно. Буруу хариулт эсвэл хугацаа дуусахад баатрууд 12 HP алддаг.';

  const hasWebAudio = !!(window.AudioContext || window.webkitAudioContext);
  if (statusEl) statusEl.textContent = `${reason} Procedural visuals and ${hasWebAudio ? 'synthesized sound available' : 'silent combat mode'}; pointer lock and media files are not required.`;
  if (!ctx) {
    if (statusEl) statusEl.textContent = 'Canvas rendering is unavailable in this browser. Reload in a browser with 2D canvas support.';
    return;
  }

  const arenaRadius = 18;
  const keys = Object.create(null);
  let touchMoveX = 0, touchMoveY = 0, movePointerId = null;
  let width = 1, height = 1, pixelRatio = 1;
  let state = 'menu', wave = 0, score = 0;
  let reinforcementTimer = 30, waveClearRewarded = false;
  let muted = false, audioContext = null;
  let player, enemies = [], allies = [], particles = [], bombs = [], arrows = [], lastTime = performance.now();
  const friendlyTower = { team: 'hero', x: -13, z: 0, hp: 100, maxHp: 100, radius: 1.5, isTower: true, dead: false, collapseT: 0, collapsed: false };
  const enemyTower = { team: 'enemy', x: 13, z: 0, hp: 100, maxHp: 100, radius: 1.5, isTower: true, dead: false, collapseT: 0, collapsed: false };
  let banner = '', bannerTime = 0, shake = 0;
  let selectedHero = window.__selectedHeroKey || 'swordsman', playerPowerBoost = 1, boostTimer = 0;
  let pointerGesture = null;
  let questionSerial = 0, mathTimeLeft = getQuizSettings().seconds, queuedTimeoutEnemies = 0, autoAttackTimer = 1.5;
  const MAX_FIGHTERS = 10;
  let pendingHeroKeys = [], pendingHeroChoices = 0, pendingHeroRewardAttacks = [];
  let correctHeroProgress = 0, wrongHeroProgress = 0, correctActionIndex = 0;
  let currentMath = { question: '', answer: 0, options: [], id: 'initial' };

  function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(height * pixelRatio));
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function sound(kind) {
    if (muted) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      osc.type = kind === 'hit' ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(kind === 'hit' ? 170 : 460, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 55 : 110, now + (kind === 'hit' ? 0.14 : 0.1));
      gain.gain.setValueAtTime(kind === 'hit' ? 0.12 : 0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch { /* Audio is optional; combat remains fully playable without it. */ }
  }

  function generateMathQuestion() {
    currentMath = { ...createQuizQuestion(getQuizSettings()), id: `${Date.now()}-${++questionSerial}`, question: '' };
    currentMath.question = currentMath.q;
    mathTimeLeft = getQuizSettings().seconds;
    renderMathQuestion();
  }

  window.addEventListener('arena:pool-ready', () => {
    if (state === 'play' && currentMath && currentMath.local) generateMathQuestion();
  });

  function renderMathQuestion() {
    const q = $('math-q');
    const choices = $('math-options');
    if (!q || !choices) return;
    setMathText(q, currentMath.question);
    const timer = $('math-timer');
    if (timer) {
      timer.textContent = `${Math.max(0, Math.ceil(mathTimeLeft))}s`;
      timer.classList.toggle('urgent', mathTimeLeft <= 5);
    }
    choices.replaceChildren();
    updateMathProgress();
    currentMath.options.forEach(value => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'math-opt';
      setMathText(option, value);
      option.addEventListener('click', event => { event.stopPropagation(); solveMath(value); });
      choices.appendChild(option);
    });
  }

  function updateMathProgress() {
    const progress = $('math-progress');
    if (!progress) return;
    const correctLabel = `ЗӨВ ${correctHeroProgress}/3`;
    progress.textContent = `${correctLabel} · АЛДАА ${wrongHeroProgress}/3 · ${fighterCountOnField()}/${MAX_FIGHTERS}`;
  }

  function fighterCountOnField() {
    return 1 + allies.length + enemies.length;
  }

  function updateRecruitPanel() {
    const panel = $('recruit-panel');
    const title = $('recruit-title');
    if (!panel) return;
    const visible = state === 'play' && pendingHeroChoices > 0;
    panel.style.display = visible ? 'block' : 'none';
    if (title && visible) title.textContent = pendingHeroChoices > 1
      ? `ШИНЭ БААТРАА СОНГО · ${pendingHeroChoices} СОНГОЛТ`
      : 'ШИНЭ БААТРАА СОНГО';
  }
  function queueHeroReward(attackOnSpawn = false) {
    pendingHeroChoices++;
    pendingHeroRewardAttacks.push(attackOnSpawn);
    updateRecruitPanel();
  }
  function chooseRecruit(heroKey) {
    if (state !== 'play' || pendingHeroChoices <= 0) return;
    if (!['swordsman', 'barbarian', 'spearman', 'bomber', 'archer'].includes(heroKey)) return;
    const attackOnSpawn = pendingHeroRewardAttacks.shift() || false;
    pendingHeroChoices--;
    pendingHeroKeys.push({ heroKey, attackOnSpawn });
    spawnPendingHeroes();
    updateRecruitPanel();
  }
  document.querySelectorAll('.recruit-option[data-recruit-key]').forEach(option => {
    option.addEventListener('click', () => chooseRecruit(option.dataset.recruitKey));
  });

  function spawnPendingHeroes() {
    while (pendingHeroKeys.length && allies.length < MAX_FIGHTERS - 2 && fighterCountOnField() < MAX_FIGHTERS) {
      const selection = pendingHeroKeys.shift();
      const heroKey = selection.heroKey;
      const ally = makeFighter(false, false, heroKey);
      applyHeroProfile(ally, heroKey);
      ally.team = 'hero';
      ally.x = -7.2;
      ally.z = (allies.length % 3 - 1) * 1.2;
      ally.actionIndex = 0;
      allies.push(ally);
      if (selection.attackOnSpawn) ally.commandQueue.push(actionForHero(ally));
    }
    updateMathProgress();
  }

  function sendCurrentQuestion(timedOut = false) {
    const network = window.ArenaMultiplayer;
    if (network?.connected && network.role === 'host') network.send({ type: 'question', question: currentMath, timeLeft: mathTimeLeft, timedOut });
  }
  function sendGameState() {
    const network = window.ArenaMultiplayer;
    if (network?.connected && network.role === 'host') network.send({ type: 'state', active: state === 'play', settings: getQuizSettings(), question: currentMath, timeLeft: mathTimeLeft });
  }
  function addTimeoutEnemy() {
    if (spawnEnemyGroup(wave || 1, 2) < 2) queuedTimeoutEnemies += 2;
  }
  function applyFailedAnswerPenalty(reason) {
    for (const fighter of [player, ...allies]) {
      if (fighter.dead) continue;
      fighter.commandQueue = [];
      fighter.commandTarget = null;
      fighter.attackT = 0;
      fighter.hitDone = false;
      fighter.hp = Math.max(0, fighter.hp - 12);
      fighter.hitT = 0.3;
      if (fighter.hp <= 0) killFighter(fighter);
    }
    bombs = bombs.filter(bomb => bomb.owner.team !== 'hero');
    arrows = arrows.filter(arrow => arrow.owner.team !== 'hero');
    banner = `${reason} · БААТРУУД -12 HP`;
    bannerTime = 1.6;
  }
  function handleQuestionTimeout() {
    const network = window.ArenaMultiplayer;
    if (network?.connected && network.role === 'guest') { mathTimeLeft = 0; renderMathQuestion(); return; }
    applyFailedAnswerPenalty('ХУГАЦАА ДУУССАН');
    if (state !== 'play') return;
    addTimeoutEnemy();
    generateMathQuestion();
    sendCurrentQuestion(true);
  }
  function installNetworkQuestion(message) {
    if (!message?.question || !Array.isArray(message.question.options)) return;
    currentMath = message.question;
    currentMath.question = currentMath.q || currentMath.question;
    mathTimeLeft = Math.max(0, Math.min(getQuizSettings().seconds, Number(message.timeLeft) || getQuizSettings().seconds));
    renderMathQuestion();
  }
  /* Анги бүрийн үндсэн зэвсэг — 3D хувилбартай ижил */
  const HERO_WEAPON = { swordsman: 'slash', barbarian: 'slash', spearman: 'spear', bomber: 'bomb', archer: 'arrow' };
  function actionForHero(fighter) {
    const key = fighter.heroKey;
    const weapon = HERO_WEAPON[key] || 'slash';
    const cost = (getHeroAction(key, weapon) || {}).cost ?? 0;
    if ((fighter.stamina ?? 0) >= cost) {
      fighter.actionIndex = (fighter.actionIndex || 0) + 1;
      return weapon;
    }
    const cycle = (fighter.profile?.actionCycle || getHeroProfile(key).actionCycle).filter(a => a !== weapon);
    const action = cycle.length ? cycle[(fighter.actionIndex || 0) % cycle.length] : 'attack';
    fighter.actionIndex = (fighter.actionIndex || 0) + 1;
    return action;
  }
  function orderAllHeroesToAct() {
    for (const fighter of [player, ...allies]) {
      if (fighter.dead) continue;
      if (!Array.isArray(fighter.commandQueue)) fighter.commandQueue = [];
      if (fighter.commandQueue.length >= 2) continue;
      fighter.commandQueue.push(actionForHero(fighter));
    }
  }
  function solveMath(value, fromRemote = false) {
    if (state !== 'play') return false;
    const solvedQuestionId = currentMath.id;
    if (value === currentMath.answer) {
      correctActionIndex++;
      correctHeroProgress++;
      if (correctHeroProgress >= 3) {
        correctHeroProgress = 0;
        queueHeroReward(true);
        banner = 'ЗӨВ! ШИНЭ БААТРАА СОНГО';
      } else banner = 'ЗӨВ! БААТАР ДОВТОЛЖ БАЙНА';
      orderAllHeroesToAct();
      playerPowerBoost = 1;
      boostTimer = 0;
      bannerTime = 1.6;
      sound('swing');
    } else {
      correctHeroProgress = 0;
      wrongHeroProgress++;
      let failureReason = 'БУРУУ ХАРИУЛТ';
      let rewardHero = false;
      if (wrongHeroProgress >= 3) {
        wrongHeroProgress = 0;
        rewardHero = true;
        failureReason = '3 АЛДАА · ШИНЭ БААТАР НЭМЭГДЛЭЭ';
      }
      applyFailedAnswerPenalty(failureReason);
      if (rewardHero) {
        queueHeroReward(false);
        banner = '3 АЛДАА · ШИНЭ БААТРАА СОНГО';
      }
    }
    updateMathProgress();
    generateMathQuestion();
    const network = window.ArenaMultiplayer;
    if (network?.connected) {
      if (!fromRemote) network.send({ type: 'answer', questionId: solvedQuestionId, answer: value });
      if (network.role === 'host') sendCurrentQuestion(false);
    }
    return true;
  }

  function makeFighter(isPlayer, tough = false, heroKey = 'swordsman') {
    const heroColors = { swordsman: '#fff3b8', barbarian: '#fffdf4', spearman: '#d8f0ff', bomber: '#e2f7d3', archer: '#dbf1ff' };
    return {
      x: isPlayer ? 0 : 0, z: 0, angle: 0, hp: 100, maxHp: 100, stamina: 100,
      radius: tough ? 0.72 : 0.55, speed: 4, damage: 10, attackT: 0, cooldown: 0,
      dodgeT: 0, hitT: 0, jumpT: 0, guarding: false, crouching: false, attackDamage: 25, attackRange: 2.3,
      attackDuration: 0.45, dead: false, deathT: 0, hitDone: false, vx: 0, vz: 0,
      think: Math.random(), strafe: Math.random() < 0.5 ? -1 : 1,
      isPlayer, team: isPlayer ? 'hero' : null, tough, heroKey, actionType: 'sword', actionIndex: 0, commandQueue: [], commandTarget: null,
      color: isPlayer ? (heroColors[heroKey] || heroColors.swordsman) : tough ? '#ae1424' : '#d52f3d'
    };
  }

  function applyHeroProfile(fighter, heroKey) {
    const profile = getHeroProfile(heroKey);
    fighter.heroKey = profile.key;
    fighter.profile = profile;
    fighter.maxHp = fighter.hp = profile.hp;
    fighter.maxStamina = fighter.stamina = profile.stamina;
    fighter.staminaRegen = profile.staminaRegen;
    fighter.speed = profile.speed;
    fighter.damage = profile.damage;
    fighter.recovery = profile.recovery;
    return fighter;
  }
  function resetPlayer() {
    player = makeFighter(true, false, selectedHero);
    applyHeroProfile(player, selectedHero);
    player.x = player.z = 0;
  }

  function createWaveEnemy(side, tough = false, spawnZ = 0, spawnX = null) {
    if (fighterCountOnField() >= MAX_FIGHTERS) return null;
    const enemy = makeFighter(false, tough);
    enemy.team = 'enemy';
    enemy.maxHp = enemy.hp = (tough ? 210 : 140) + wave * (tough ? 14 : 10);
    enemy.speed = ((tough ? 2.2 : 2.6) + Math.min(wave * 0.05, 0.5)) * 0.9;
    enemy.damage = 24 + Math.min(6, Math.floor(Math.max(0, wave - 1) / 2) * 2) + (tough ? 8 : 0);
    enemy.cooldown = Math.random() * 1.4;
    enemy.x = spawnX ?? (side >= 0 ? 10.5 : -10.5);
    enemy.z = spawnZ;
    enemies.push(enemy);
    return enemy;
  }

  function waveEnemyCount(waveNumber) {
    return Math.min(8, 2 + Math.floor((waveNumber - 1) / 2) * 2);
  }

  function spawnEnemyGroup(waveNumber, requestedCount) {
    const available = Math.max(0, MAX_FIGHTERS - fighterCountOnField());
    const count = Math.min(requestedCount, available - (available % 2));
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      // A boss wave brings one tough enemy with regular fighters supporting it.
      const tough = waveNumber % 3 === 0 && i === 0;
      const lane = i - (count - 1) / 2;
      if (createWaveEnemy(1, tough, lane * 1.35, 10.5 + Math.floor(i / 5) * 1.25)) spawned++;
    }
    return spawned;
  }

  function startWave() {
    wave++;
    enemies = [];
    reinforcementTimer = 30;
    waveClearRewarded = false;
    const spawned = spawnEnemyGroup(wave, waveEnemyCount(wave));
    banner = spawned ? `ҮЕ ${wave} · ${spawned} ДАЙСАН НЭГ ДОР!` : 'ТАЛБАЙ ДҮҮРЭН · ДАЙСАН ХҮЛЭЭНЭ';
    bannerTime = 1.8;
    updateMathProgress();
  }

  function spawnReinforcements() {
    if (wave < MAX_WAVE) wave++;   /* 10-р үе хамгийн дээд */
    const spawned = spawnEnemyGroup(wave, waveEnemyCount(wave));
    reinforcementTimer = 30;
    waveClearRewarded = false;
    banner = spawned
      ? wave % 3 === 0 ? `BOSS + ${spawned - 1} ДАЙСАН НЭГ ДОР!` : `${spawned} ДАЙСАН НЭГ ДОР ДОВТОЛЛОО!`
      : 'ТАЛБАЙ ДҮҮРЭН · ДАЙСАН ХҮЛЭЭНЭ';
    bannerTime = 1.8;
  }

  function startGame() {
    selectedHero = window.__selectedHeroKey || selectedHero || 'swordsman';
    resetPlayer();
    enemies = [];
    allies = [];
    particles = [];
    bombs = [];
    arrows = [];
    pendingHeroKeys = [];
    pendingHeroChoices = 0;
    pendingHeroRewardAttacks = [];
    autoAttackTimer = 1.5;
    updateRecruitPanel();
    correctHeroProgress = 0;
    wrongHeroProgress = 0;
    correctActionIndex = 0;
    score = 0;
    wave = 0;
    playerPowerBoost = 1;
    boostTimer = 0;
    queuedTimeoutEnemies = 0;
    for (const tower of [friendlyTower, enemyTower]) {
      tower.hp = tower.maxHp;
      tower.dead = false;
      tower.collapseT = 0;
      tower.collapsed = false;
    }
    mathTimeLeft = getQuizSettings().seconds;
    state = 'play';
    overlay.style.display = 'none';
    overlay.querySelector('h1').textContent = 'MATH MORTAL';
    $('math-panel').style.display = 'flex';
    generateMathQuestion();
    if ($('p-name')) $('p-name').textContent = selectedHero.toUpperCase();
    startWave();
    updateMathProgress();
    sendGameState();
    if (statusEl) statusEl.textContent = 'Хөх чулуун цайз ба улаан болор цайзын тулаан үргэлжилж байна · баатар бүрийн амь дээр нь харагдана.';
  }

  function beginChallenge() {
    startGame();
  }

  function updateButton() {
    if (!button) return;
    button.textContent = state === 'paused' ? 'ҮРГЭЛЖЛҮҮЛЭХ' : state === 'over' ? 'ДАХИН ТУЛАЛДАХ' : 'БОДЛОГО ЭХЛҮҮЛЭХ';
  }
  function setPaused(next, fromRemote = false) {
    if (next && state === 'play') {
      state = 'paused';
      Object.keys(keys).forEach(key => keys[key] = false);
      resetMovePad();
      overlay.querySelector('h1').textContent = 'ТҮР ЗОГСЛОО';
      if (message) message.textContent = 'Түр зогслоо · бодлогын хугацаа хадгалагдсан.';
      if (statusEl) statusEl.textContent = 'Түр зогслоо · үргэлжлүүлэх товч эсвэл Esc дарна уу.';
      overlay.style.display = 'flex';
      updateButton();
    } else if (!next && state === 'paused') {
      state = 'play';
      overlay.querySelector('h1').textContent = 'MATH MORTAL';
      overlay.style.display = 'none';
      if (statusEl) statusEl.textContent = 'Хөх чулуун цайз ба улаан болор цайзын тулаан үргэлжилж байна · баатар бүрийн амь дээр нь харагдана.';
    }
    const network = window.ArenaMultiplayer;
    if (!fromRemote && network?.connected) network.send({ type: next ? 'pause' : 'resume' });
  }
  function toggleMute() {
    muted = !muted;
    const soundButton = $('music-toggle');
    if (soundButton) {
      soundButton.textContent = muted ? '🔇 ДУУГҮЙ' : '🔊 ДУУ';
      soundButton.setAttribute('aria-pressed', String(muted));
    }
    if (statusEl) statusEl.textContent = muted ? 'Дуу хаалттай · M дарж асаана.' : 'Дуу асаалттай.';
  }
  button?.addEventListener('click', () => {
    if (state === 'paused') setPaused(false);
    else beginChallenge();
  });
  $('pause-toggle')?.addEventListener('click', () => {
    if (state === 'play') setPaused(true);
    else if (state === 'paused') setPaused(false);
  });
  $('settings-toggle')?.addEventListener('click', () => {
    if (state === 'play') setPaused(true);
    else overlay.style.display = 'flex';
  });
  $('music-toggle')?.addEventListener('click', toggleMute);
  window.addEventListener('arena:settings-changed', () => {
    const network = window.ArenaMultiplayer;
    if (network?.connected && network.role === 'guest') return;
    if (state === 'play' || state === 'paused') generateMathQuestion();
    if (network?.connected && network.role === 'host') sendGameState();
  });
  window.addEventListener('arena:peer-connected', () => { if (window.ArenaMultiplayer?.role === 'host') sendGameState(); });
  window.addEventListener('arena:network-message', event => {
    const message = event.detail;
    const network = window.ArenaMultiplayer;
    if (!message || !network?.connected) return;
    if (message.type === 'request-state' && network.role === 'host') sendGameState();
    else if (message.type === 'state' && network.role === 'guest') {
      applyQuizSettings(message.settings, true);
      if (message.active && state !== 'play') beginChallenge();
      if (message.question) installNetworkQuestion(message);
    } else if (message.type === 'answer' && network.role === 'host' && state === 'play' && message.questionId === currentMath.id) solveMath(message.answer, true);
    else if (message.type === 'question' && network.role === 'guest' && state === 'play') {
      if (message.timedOut) {
        applyFailedAnswerPenalty('ХУГАЦАА ДУУССАН');
        if (state === 'play') addTimeoutEnemy();
      }
      if (state === 'play') installNetworkQuestion(message);
    } else if (message.type === 'pause') setPaused(true, true);
    else if (message.type === 'resume') setPaused(false, true);
  });
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      event.preventDefault();
      if (state === 'play') setPaused(true);
      else if (state === 'paused') setPaused(false);
    } else if (event.code === 'KeyM') toggleMute();
    else if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyX', 'KeyV'].includes(event.code)) {
      keys[event.code] = true;
    } else if (event.code === 'Space') {
      event.preventDefault();
      if (state === 'play') dodge(player, movement());
    }
  });
  document.addEventListener('keyup', event => { keys[event.code] = false; });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointerGesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointerGesture || event.pointerId !== pointerGesture.id) return;
    if (Math.hypot(event.clientX - pointerGesture.startX, event.clientY - pointerGesture.startY) > 4) pointerGesture.moved = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => {
      if (pointerGesture?.id !== event.pointerId) return;
      const click = !pointerGesture.moved && type === 'pointerup';
      pointerGesture = null;
      if (click && state === 'play') {
        const manualAction = selectedHero === 'archer' ? 'arrow' : selectedHero === 'spearman' ? 'spear' : selectedHero === 'bomber' ? 'bomb' : selectedHero === 'barbarian' ? 'kick' : 'sword';
        attack(player, manualAction);
      }
    });
  }

  function movement() {
    const forward = Math.max(-1, Math.min(1, (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - touchMoveY));
    const side = Math.max(-1, Math.min(1, (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchMoveX));
    const fwdX = 0, fwdZ = -1;
    const length = Math.hypot(forward, side) || 1;
    return { x: (fwdX * forward + -fwdZ * side) / length, z: (fwdZ * forward + fwdX * side) / length, moving: !!(forward || side) };
  }
  function classAction(fighter, type) {
    return getHeroAction(fighter.heroKey || 'swordsman', type);
  }
  function attackRange(type, fighter = null) {
    if (fighter?.profile) return classAction(fighter, type).range ?? fighter.profile.preferredRange;
    return type === 'bomb' ? 9 : type === 'arrow' ? 9.5 : type === 'spear' ? 3.5 : type === 'slash' ? 2.8 : type === 'kick' ? 2.5 : type === 'punch' ? 2 : 2.4;
  }
  function actionCost(fighter, type) {
    if (fighter?.profile) return classAction(fighter, type).cost ?? 0;
    return type === 'bomb' ? 30 : type === 'arrow' ? 6 : type === 'spear' ? 8 : type === 'slash' ? 15 : type === 'kick' ? 13 : type === 'punch' ? 10 : 0;
  }

  function attack(f, type = 'sword') {
    if (f.dead || f.attackT > 0 || f.cooldown > 0 || f.dodgeT > 0 || f.hitT > 0) return false;
    const defaults = {
      bomb: { duration: 0.52, damage: 60, range: 9, cost: 30 },
      arrow: { duration: 0.46, damage: 36, range: 9.5, cost: 6 },
      spear: { duration: 0.5, damage: 40, range: 3.5, cost: 8 },
      sword: { duration: 0.52, damage: 30, range: 2.4, cost: 0 },
      slash: { duration: 0.62, damage: 35, range: 2.8, cost: 15 },
      punch: { duration: 0.48, damage: 18, range: 2.0, cost: 10 },
      kick: { duration: 0.58, damage: 24, range: 2.5, cost: 13 }
    };
    const fallback = defaults[type] || defaults.sword;
    const classProfile = f.profile ? classAction(f, type) : null;
    const profile = classProfile ? {
      duration: classProfile.duration ?? fallback.duration,
      damage: classProfile.damage ?? (f.damage * (classProfile.mult ?? 1)),
      range: classProfile.range ?? fallback.range,
      cost: classProfile.cost ?? 0,
      cooldown: classProfile.cooldown
    } : fallback;
    if (f.team === 'hero' && f.stamina < profile.cost) return false;
    if (f.team === 'hero') f.stamina -= profile.cost;
    f.attackDuration = profile.duration;
    f.attackDamage = profile.damage;
    f.attackRange = profile.range;
    f.actionRecovery = profile.cooldown ?? f.recovery ?? 0.25;
    f.actionType = type;
    f.attackT = profile.duration;
    f.hitDone = false;
    sound('swing');
    return true;
  }

  function throwBomb(f) {
    const fallbackTower = f.team === 'hero' ? enemyTower : friendlyTower;
    const target = f.target && !f.target.dead ? f.target : enemies.find(enemy => !enemy.dead) || fallbackTower;
    if (!target || target.hp <= 0) return;
    const dx = target.x - f.x, dz = target.z - f.z;
    const dist = Math.hypot(dx, dz) || 1;
    const bombProfile = f.profile ? classAction(f, 'bomb') : null;
    bombs.push({
      x: f.x, z: f.z, y: 1.2, vx: dx / dist * 13, vz: dz / dist * 13, vy: 3.1, life: 1.8, owner: f,
      damage: f.attackDamage || bombProfile?.damage || 60,
      radius: bombProfile?.radius ?? 4.5,
      towerDamage: bombProfile?.towerDamage ?? 70
    });
  }

  function explodeBomb(bomb) {
    const heroBomb = bomb.owner.team === 'hero';
    const targets = heroBomb ? enemies : [player, ...allies];
    const radius = bomb.radius ?? 4.5;
    for (const target of targets) {
      if (target.dead) continue;
      const dx = target.x - bomb.x, dz = target.z - bomb.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= radius) continue;
      const damage = heroBomb
        ? Math.max(1, Math.round((bomb.damage ?? 60) * (1 - distance / (radius + 0.5))))
        : target === player && target.guarding ? 2 * 0.28 : 2;
      target.hp -= damage;
      target.hitT = 0.3;
      target.vx += (dx / (distance || 1)) * 5;
      target.vz += (dz / (distance || 1)) * 5;
      for (let i = 0; i < 10; i++) particles.push({ x: target.x, z: target.z, vx: (Math.random() - 0.5) * 7, vz: (Math.random() - 0.5) * 7, life: 0.45, color: '#ff9b36', radius: 0.1 });
      if (target.hp <= 0) killFighter(target);
    }
    const tower = heroBomb ? enemyTower : friendlyTower;
    const towerDistance = Math.hypot(tower.x - bomb.x, tower.z - bomb.z);
    if (towerDistance < radius + tower.radius) {
      const towerDamage = heroBomb ? (bomb.towerDamage ?? 70) * Math.max(0.15, 1 - towerDistance / (radius + 0.5)) : 2;
      damageTower(tower, towerDamage, bomb.owner);
    }
    for (let i = 0; i < 28; i++) particles.push({ x: bomb.x, z: bomb.z, vx: (Math.random() - 0.5) * 11, vz: (Math.random() - 0.5) * 11, life: 0.55, color: i % 2 ? '#ffcf53' : '#ff4e23', radius: 0.13 });
    shake = 0.45;
    sound('hit');
  }

  function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const bomb = bombs[i];
      bomb.vy -= 16 * dt;
      bomb.x += bomb.vx * dt;
      bomb.z += bomb.vz * dt;
      bomb.y += bomb.vy * dt;
      bomb.life -= dt;
      const targets = bomb.owner.team === 'hero' ? enemies : [player, ...allies];
      const tower = bomb.owner.team === 'hero' ? enemyTower : friendlyTower;
      const collided = targets.some(target => !target.dead && Math.hypot(target.x - bomb.x, target.z - bomb.z) < 0.75 && bomb.y < 2.2)
        || (tower.hp > 0 && Math.hypot(tower.x - bomb.x, tower.z - bomb.z) < tower.radius + 0.5 && bomb.y < 2.2);
      if (collided || bomb.y <= 0.15 || bomb.life <= 0) {
        explodeBomb(bomb);
        bombs.splice(i, 1);
      }
    }
  }

  function shootArrow(fighter) {
    const tower = fighter.team === 'hero' ? enemyTower : friendlyTower;
    const target = fighter.commandTarget || (fighter.target && !fighter.target.dead ? fighter.target : null) || tower;
    const dx = target.x - fighter.x;
    const dz = target.z - fighter.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    arrows.push({
      x: fighter.x + dx / length * 0.55, z: fighter.z + dz / length * 0.55, y: 1.25,
      vx: dx / length * 20, vz: dz / length * 20, life: 1.15,
      owner: fighter, damage: fighter.attackDamage || 36
    });
  }
  function pointSegmentDistanceSq(x, z, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 0.0001 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0;
    const ox = x - (ax + dx * t), oz = z - (az + dz * t);
    return ox * ox + oz * oz;
  }
  function damageArrowTarget(arrow, target, heroArrow) {
    if (target.dead || target.dodgeT > 0) return;
    const damage = (heroArrow ? arrow.damage * playerPowerBoost : 2) * (target === player && target.guarding ? 0.28 : 1);
    target.hp -= damage;
    target.hitT = 0.28;
    target.attackT = 0;
    target.vx = Math.sign(target.x - arrow.owner.x || 1) * 7;
    target.vz += (target.z - arrow.owner.z) * 0.25;
    shake = target === player ? 0.28 : 0.16;
    sound('hit');
    for (let i = 0; i < 8; i++) particles.push({ x: target.x, z: target.z, vx: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 6, life: 0.4, color: heroArrow ? '#8fd9ff' : '#ff7165', radius: 0.075 });
    if (target.hp <= 0) killFighter(target);
  }
  function updateArrows(dt) {
    for (let i = arrows.length - 1; i >= 0; i--) {
      const arrow = arrows[i];
      const ax = arrow.x, az = arrow.z;
      arrow.x += arrow.vx * dt;
      arrow.z += arrow.vz * dt;
      arrow.life -= dt;
      const heroArrow = arrow.owner.team === 'hero';
      const targets = heroArrow ? enemies : [player, ...allies];
      const target = targets.find(candidate => !candidate.dead
        && pointSegmentDistanceSq(candidate.x, candidate.z, ax, az, arrow.x, arrow.z) < (candidate.radius + 0.28) ** 2);
      let impact = false;
      if (target) {
        damageArrowTarget(arrow, target, heroArrow);
        impact = true;
      } else {
        const tower = heroArrow ? enemyTower : friendlyTower;
        if (tower.hp > 0 && pointSegmentDistanceSq(tower.x, tower.z, ax, az, arrow.x, arrow.z) < (tower.radius + 0.35) ** 2) {
          damageTower(tower, arrow.damage * (heroArrow ? playerPowerBoost : 1), arrow.owner);
          impact = true;
        }
      }
      if (impact || arrow.life <= 0) arrows.splice(i, 1);
    }
  }

  function jump(f) {
    if (f.dead || f.jumpT > 0 || f.stamina < 12) return;
    f.stamina -= 12;
    f.jumpT = 0.65;
    sound('swing');
  }
  function dodge(f, dir) {
    if (f.dead || f.stamina < 25 || f.dodgeT > 0) return;
    if (!dir.moving) { dir = { x: -Math.sin(f.angle), z: -Math.cos(f.angle) }; }
    f.stamina -= 25;
    f.dodgeT = 0.35;
    f.attackT = 0;
    f.vx = dir.x * 11;
    f.vz = dir.z * 11;
  }
  const movePad = $('move-pad');
  const moveStick = $('move-stick');
  function resetMovePad() {
    touchMoveX = 0;
    touchMoveY = 0;
    movePointerId = null;
    if (moveStick) moveStick.style.transform = 'translate3d(0, 0, 0)';
  }
  function updateMovePad(event) {
    if (!movePad || !moveStick) return;
    const rect = movePad.getBoundingClientRect();
    const radius = rect.width * 0.31;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    const x = dx * scale, y = dy * scale;
    touchMoveX = x / radius;
    touchMoveY = y / radius;
    if (Math.hypot(touchMoveX, touchMoveY) < 0.13) touchMoveX = touchMoveY = 0;
    moveStick.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
  movePad?.addEventListener('pointerdown', event => {
    event.preventDefault(); event.stopPropagation();
    movePointerId = event.pointerId;
    try { movePad.setPointerCapture(event.pointerId); } catch { /* Capture is optional. */ }
    updateMovePad(event);
  });
  movePad?.addEventListener('pointermove', event => {
    if (event.pointerId === movePointerId) { event.preventDefault(); updateMovePad(event); }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    movePad?.addEventListener(type, event => { if (event.pointerId === movePointerId) resetMovePad(); });
  }
  const heldTouchKeys = { crouch: 'KeyV', guard: 'KeyX' };
  document.querySelectorAll('.fight-btn').forEach(btn => {
    const action = btn.dataset.action;
    const release = () => {
      btn.classList.remove('pressed');
      const code = heldTouchKeys[action];
      if (code) keys[code] = false;
    };
    btn.addEventListener('pointerdown', event => {
      event.preventDefault(); event.stopPropagation();
      btn.classList.add('pressed');
      try { btn.setPointerCapture(event.pointerId); } catch { /* Capture is optional. */ }
      if (btn.dataset.hold === 'true') {
        if (state === 'play') keys[heldTouchKeys[action]] = true;
      } else if (state === 'play') {
        if (action === 'jump') jump(player);
        else if (action === 'punch') attack(player, 'punch');
        else if (action === 'kick') attack(player, 'kick');
        else if (action === 'slash') attack(player, 'slash');
        else if (action === 'dodge') dodge(player, movement());
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(type, release);
  });
  function face(f, x, z, dt, rate = 10) {
    if (x * x + z * z < 0.001) return;
    const target = Math.atan2(x, z);
    let diff = Math.atan2(Math.sin(target - f.angle), Math.cos(target - f.angle));
    f.angle += diff * Math.min(1, dt * rate);
  }
  function finishMatch(won, defeatReason = 'tower') {
    if (state === 'over') return;
    state = 'over';
    updateRecruitPanel();
    overlay.querySelector('h1').textContent = won ? 'VICTORY!' : 'GAME OVER';
    if (message) message.textContent = won
      ? (defeatReason === 'cleared'
          ? `БҮХ 10 ҮЕ ДУУСЛАА! Оноо ${score}`
          : `Дайсны болор цайз нурлаа! ҮЕ ${wave}/${MAX_WAVE} · Оноо ${score}`)
      : defeatReason === 'heroes'
        ? `Танай багт амьд баатар үлдсэнгүй. ҮЕ ${wave}/${MAX_WAVE} · Оноо ${score}`
        : `Танай чулуун цайз нурлаа. ҮЕ ${wave}/${MAX_WAVE} · Оноо ${score}`;
    /* Хүрсэн ҮЕ (1–10) + оноог шилдэгийн хүснэгтэд бүртгэнэ */
    const reached = Math.max(1, Math.min(MAX_WAVE, wave || 1));
    const reachedEl = document.getElementById('lb-reached');
    if (reachedEl) reachedEl.textContent = `Та ҮЕ ${reached}/${MAX_WAVE} хүртэл явлаа · ${score} оноо`;
    lbSubmit(reached, score);
    button.style.display = '';
    overlay.style.display = 'flex';
    updateButton();
    sendGameState();
  }

  function damageTower(tower, amount, attacker) {
    if (!tower || tower.hp <= 0 || state !== 'play') return false;
    const heroAttack = attacker === player || attacker.team === 'hero';
    if ((tower.team === 'enemy') !== heroAttack) return false;
    // Each enemy hit removes a fixed 2 HP from the friendly keep in every wave.
    const friendlyKeepDamage = 2;
    const towerDamage = tower.team === 'hero' ? friendlyKeepDamage : amount / 12;
    tower.hp = Math.max(0, tower.hp - towerDamage);
    tower.hitT = 0.24;
    if (tower.hp <= 0) {
      tower.dead = true;
      tower.collapseT = 0;
      tower.collapsed = false;
      banner = tower.team === 'enemy' ? 'ДАЙСНЫ БОЛОР ЦАЙЗ НУРЛА!' : 'ТАНАЙ ЧУЛУУН ЦАЙЗ НУРЛА!';
      bannerTime = 1.6;
    }
    for (let i = 0; i < (tower.dead ? 30 : 12); i++) particles.push({
      x: tower.x + (Math.random() - 0.5) * 1.5,
      z: tower.z + (Math.random() - 0.5) * 1.5,
      vx: (Math.random() - 0.5) * (tower.dead ? 8 : 4), vz: (Math.random() - 0.5) * (tower.dead ? 8 : 4),
      life: tower.dead ? 0.8 : 0.45, color: tower.team === 'enemy' ? '#ff8755' : '#74caff', radius: 0.09
    });
    shake = tower.dead ? 0.45 : 0.2;
    sound('hit');
    return true;
  }
  function updateTowerCollapse(dt) {
    for (const tower of [friendlyTower, enemyTower]) {
      if (!tower.dead || tower.collapsed) continue;
      tower.collapseT = Math.min(1.1, tower.collapseT + dt);
      if (tower.collapseT >= 1.1) {
        tower.collapsed = true;
        finishMatch(tower.team === 'enemy');
        return;
      }
    }
  }

  function killFighter(target) {
    if (target.dead) return;
    target.dead = true;
    target.hp = Math.max(0, target.hp);
    target.deathT = 0;
    if (target === player || target.team === 'hero') {
      if (![player, ...allies].some(fighter => !fighter.dead)) {
        banner = 'БҮХ БААТАР УНАВ · ЦАМХГАА ХАМГААЛ!';
        bannerTime = 2.2;
      } else if (target === player) {
        banner = 'БААТАР УНАВ · БАГ ҮРГЭЛЖЛҮҮЛНЭ';
        bannerTime = 1.6;
      }
    } else score += 100 * wave;
  }

  function hit(attacker, targets, damage, range = 2.3, towerTarget = null) {
    const fx = Math.sin(attacker.angle), fz = Math.cos(attacker.angle);
    for (const target of targets) {
      if (target.dead || target.dodgeT > 0) continue;
      const dx = target.x - attacker.x, dz = target.z - attacker.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      if (dist > range || (dx / dist) * fx + (dz / dist) * fz < 0.25) continue;
      const heroAttack = attacker === player || attacker.team === 'hero';
      const appliedDamage = (heroAttack ? damage : 2) * (target === player && target.guarding ? 0.28 : 1);
      target.hp -= appliedDamage;
      target.hitT = 0.28;
      target.attackT = 0;
      target.vx = (dx / dist) * 7;
      target.vz = (dz / dist) * 7;
      shake = 0.2;
      sound('hit');
      for (let i = 0; i < 8; i++) particles.push({ x: target.x, z: target.z, vx: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 6, life: 0.4, color: '#ffd46d', radius: 0.075 });
      for (let i = 0; i < 4; i++) particles.push({ x: target.x, z: target.z, vx: (Math.random() - 0.5) * 3.4, vz: (Math.random() - 0.5) * 3.4, life: 0.34, color: '#921a23', radius: 0.045 });
      if (target.hp <= 0) killFighter(target);
    }
    if (towerTarget && towerTarget.hp > 0) {
      const heroAttack = attacker === player || attacker.team === 'hero';
      const canDamage = (towerTarget.team === 'enemy') === heroAttack;
      const dx = towerTarget.x - attacker.x, dz = towerTarget.z - attacker.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const inFront = (dx / dist) * fx + (dz / dist) * fz >= 0.25;
      if (canDamage && inFront && dist <= range + towerTarget.radius) damageTower(towerTarget, damage, attacker);
    }
  }

  function keepOutsideTowers(f) {
    for (const tower of [friendlyTower, enemyTower]) {
      const dx = f.x - tower.x, dz = f.z - tower.z;
      const distance = Math.hypot(dx, dz);
      const minimumDistance = 1.8 + f.radius + 0.2;
      if (distance >= minimumDistance) continue;
      if (distance <= 0.001) {
        f.x = tower.x + (tower.team === 'hero' ? minimumDistance : -minimumDistance);
        f.z = tower.z;
      } else {
        f.x = tower.x + dx / distance * minimumDistance;
        f.z = tower.z + dz / distance * minimumDistance;
      }
    }
  }

  function updateFighter(f, desiredX, desiredZ, dt) {
    if (f.dodgeT > 0 || f.hitT > 0) {
      const drag = Math.pow(0.02, dt);
      f.vx *= drag; f.vz *= drag;
    } else {
      f.vx += (desiredX - f.vx) * Math.min(1, dt * 12);
      f.vz += (desiredZ - f.vz) * Math.min(1, dt * 12);
    }
    f.x += f.vx * dt; f.z += f.vz * dt;
    const r = Math.hypot(f.x, f.z), limit = arenaRadius - 0.5;
    if (r > limit) { f.x *= limit / r; f.z *= limit / r; }
    keepOutsideTowers(f);
    f.dodgeT = Math.max(0, f.dodgeT - dt);
    f.hitT = Math.max(0, f.hitT - dt);
    f.cooldown = Math.max(0, f.cooldown - dt);
    if (f.team === 'hero') f.stamina = Math.min(f.maxStamina || 100, f.stamina + dt * (f.staminaRegen ?? 18));
  }

  function advanceAttack(f, targets, dt, enemyDamage = null, towerTarget = null) {
    const wasAttacking = f.attackT > 0;
    if (!wasAttacking) return;
    f.attackT = Math.max(0, f.attackT - dt);
    if (f.attackT > 0 && !f.hitDone && f.attackT < f.attackDuration * 0.55) {
      f.hitDone = true;
      if (f.actionType === 'bomb') throwBomb(f);
      else if (f.actionType === 'arrow') shootArrow(f);
      else hit(f, targets, enemyDamage ?? f.attackDamage, f.attackRange, towerTarget);
    }
    if (wasAttacking && f.attackT === 0) {
      f.cooldown = f.team === 'hero' ? (f.actionRecovery ?? f.recovery ?? 0.25) : 2.1 + Math.random() * 0.7;
      f.hitDone = false;
    }
  }

  function update(dt) {
    /* Тулаан автоматаар — баатрууд 1.5с тутамд зэвсгээ далайна */
    autoAttackTimer -= dt;
    if (autoAttackTimer <= 0) {
      orderAllHeroesToAct();
      autoAttackTimer = 1.5;
    }
    if (mathTimeLeft > 0) {
      mathTimeLeft = Math.max(0, mathTimeLeft - dt);
      if (mathTimeLeft <= 0) handleQuestionTimeout();
      if (state !== 'play') return;
    }
    reinforcementTimer -= dt;
    if (reinforcementTimer <= 0) spawnReinforcements();

    const nearestEnemy = (x, z) => enemies.reduce((closest, enemy) => {
      if (enemy.dead) return closest;
      return !closest || Math.hypot(enemy.x - x, enemy.z - z) < Math.hypot(closest.x - x, closest.z - z) ? enemy : closest;
    }, null);
    const approachTarget = (fighter, target) => {
      if (!target?.isTower) return { x: target?.x ?? fighter.x, z: target?.z ?? fighter.z };
      return {
        x: target.x + (target.team === 'enemy' ? -2.15 : 2.15),
        z: Math.max(-1.4, Math.min(1.4, fighter.z))
      };
    };
    const targetDistance = (fighter, target) => {
      const centerDistance = Math.hypot(target.x - fighter.x, target.z - fighter.z);
      return Math.max(0, centerDistance - (target.isTower ? target.radius : 0));
    };
    if (player.dead) player.deathT += dt;
    else {
      const target = nearestEnemy(player.x, player.z) || (enemyTower.hp > 0 ? enemyTower : null);
      const queuedAction = player.commandQueue[0];
      const approach = approachTarget(player, target);
      const dx = approach.x - player.x, dz = approach.z - player.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const input = movement();
      const playerSpeed = player.speed * (keys.ShiftLeft || keys.ShiftRight ? 1.5 : 1);
      let desiredX = input.moving ? input.x * playerSpeed : 0;
      let desiredZ = input.moving ? input.z * playerSpeed : 0;
      if (queuedAction && target) {
        const range = attackRange(queuedAction, player);
        const centerDist = Math.hypot(target.x - player.x, target.z - player.z);
        if (centerDist > range * 0.85 + (target.isTower ? target.radius : 0)) {
          desiredX = dx / dist * playerSpeed;
          desiredZ = dz / dist * playerSpeed;
        } else desiredX = desiredZ = 0;
      }
      updateFighter(player, desiredX, desiredZ, dt);
      if (target) face(player, target.x - player.x, target.z - player.z, dt, 12);
      player.target = target;
      player.guarding = !!keys.KeyX;
      player.crouching = !!keys.KeyV;
      player.jumpT = Math.max(0, player.jumpT - dt);
      advanceAttack(player, enemies, dt, null, target?.isTower ? target : null);
      if (queuedAction && target && player.attackT <= 0 && player.cooldown <= 0 && player.hitT <= 0
        && targetDistance(player, target) <= attackRange(queuedAction, player) && player.stamina >= actionCost(player, queuedAction)
        && attack(player, queuedAction)) {
        player.commandTarget = target;
        player.commandQueue.shift();
      }
    }

    for (const ally of allies) {
      if (ally.dead) { ally.deathT += dt; continue; }
      const target = nearestEnemy(ally.x, ally.z) || (enemyTower.hp > 0 ? enemyTower : null);
      const queuedAction = ally.commandQueue[0];
      if (!target) { updateFighter(ally, 0, 0, dt); continue; }
      ally.target = target;
      const approach = approachTarget(ally, target);
      const dx = approach.x - ally.x, dz = approach.z - ally.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const range = queuedAction ? attackRange(queuedAction, ally) : (ally.profile?.preferredRange ?? 1.8);
      const moving = dist > range * 0.9;
      updateFighter(ally, moving ? dx / dist * ally.speed : 0, moving ? dz / dist * ally.speed : 0, dt);
      face(ally, target.x - ally.x, target.z - ally.z, dt, 10);
      advanceAttack(ally, enemies, dt, null, target.isTower ? target : null);
      if (queuedAction && targetDistance(ally, target) <= attackRange(queuedAction, ally)
        && ally.attackT <= 0 && ally.cooldown <= 0 && ally.hitT <= 0
        && ally.stamina >= actionCost(ally, queuedAction) && attack(ally, queuedAction)) {
        ally.commandTarget = target;
        ally.commandQueue.shift();
      }
    }

    for (const enemy of enemies) {
      if (enemy.dead) { enemy.deathT += dt; continue; }
      const heroes = [player, ...allies].filter(fighter => !fighter.dead);
      const closestHero = heroes.reduce((closest, fighter) =>
        !closest || Math.hypot(fighter.x - enemy.x, fighter.z - enemy.z) < Math.hypot(closest.x - enemy.x, closest.z - enemy.z) ? fighter : closest, null);
      const heroDistance = closestHero ? Math.hypot(closestHero.x - enemy.x, closestHero.z - enemy.z) : Infinity;
      const towerTarget = heroDistance < 5.5 ? null : friendlyTower;
      const target = towerTarget || closestHero;
      if (!target) continue;
      const approach = approachTarget(enemy, target);
      const dx = approach.x - enemy.x, dz = approach.z - enemy.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist, nz = dz / dist;
      enemy.think -= dt;
      if (enemy.think <= 0) {
        enemy.think = 0.8 + Math.random() * 0.55;
        if (closestHero && !towerTarget && target.attackT > 0.2 && dist < 3 && Math.random() < 0.16) {
          dodge(enemy, { x: -nz * enemy.strafe - nx * 0.6, z: nx * enemy.strafe - nz * 0.6, moving: true });
        }
        if (Math.random() < 0.3) enemy.strafe *= -1;
      }
      let vx = 0, vz = 0;
      const reach = towerTarget ? 2.35 : 1.9;
      if (enemy.attackT <= 0 && enemy.hitT <= 0) {
        if (dist > reach) { vx = nx * enemy.speed; vz = nz * enemy.speed; }
        else {
          if (!towerTarget) { vx = -nz * enemy.strafe; vz = nx * enemy.strafe; }
          if (enemy.cooldown <= 0) attack(enemy, 'sword');
        }
      }
      enemy.siegeTarget = towerTarget;
      updateFighter(enemy, vx, vz, dt);
      face(enemy, target.x - enemy.x, target.z - enemy.z, dt, 8);
      advanceAttack(enemy, towerTarget ? [] : [target], dt, enemy.damage, towerTarget);
    }

    const active = [player, ...allies, ...enemies].filter(f => !f.dead);
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const min = a.radius + b.radius + 0.12;
      if (dist < min) {
        const push = (min - dist) / 2;
        a.x -= dx / dist * push; a.z -= dz / dist * push;
        b.x += dx / dist * push; b.z += dz / dist * push;
      }
    }
    active.forEach(keepOutsideTowers);
    updateBombs(dt);
    updateArrows(dt);
    updateTowerCollapse(dt);
    if (state !== 'play') return;
    enemies = enemies.filter(enemy => !enemy.dead || enemy.deathT < 1.1);
    allies = allies.filter(ally => !ally.dead || ally.deathT < 1.1);
    spawnPendingHeroes();
    while (queuedTimeoutEnemies >= 2 && fighterCountOnField() <= MAX_FIGHTERS - 2) {
      const spawned = spawnEnemyGroup(wave || 1, 2);
      if (spawned < 2) break;
      queuedTimeoutEnemies -= spawned;
    }
    if (enemies.length === 0 && !waveClearRewarded) {
      player.hp = Math.min(player.maxHp, player.hp + 25);
      score += wave * 250;
      waveClearRewarded = true;
      if (wave >= MAX_WAVE) { finishMatch(true, 'cleared'); return; }
      banner = `ҮЕ ${wave}/${MAX_WAVE} ДУУСЛАА · ДАРААГИЙНХ 30s`;
      bannerTime = 1.8;
    }
    for (const particle of particles) {
      particle.x += particle.vx * dt; particle.z += particle.vz * dt;
      particle.vx *= 0.96; particle.vz *= 0.96; particle.life -= dt;
    }
    particles = particles.filter(particle => particle.life > 0);
    friendlyTower.hitT = Math.max(0, friendlyTower.hitT - dt);
    enemyTower.hitT = Math.max(0, enemyTower.hitT - dt);
    bannerTime = Math.max(0, bannerTime - dt);
    shake = Math.max(0, shake - dt);
  }

  function roundedRect(x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }
  function drawTower(tower, view) {
    ctx.save();
    ctx.translate(view.cx + tower.x * view.scale, view.groundY + tower.z * view.scale * view.depth);
    ctx.scale(view.scale, view.spriteScale);
    const friendly = tower.team === 'hero';
    const collapseProgress = Math.max(0, Math.min(1, tower.collapseT / 1.1));
    const easedCollapse = 1 - (1 - collapseProgress) * (1 - collapseProgress);
    ctx.rotate((friendly ? -1 : 1) * easedCollapse * 1.2);
    ctx.globalAlpha = tower.dead ? 1 - 0.15 * collapseProgress : 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.1;
    ctx.fillStyle = '#1b100b88';
    ctx.beginPath(); ctx.ellipse(0.12, 0.32, 2.35, 0.75, 0, 0, Math.PI * 2); ctx.fill();

    if (friendly) {
      const stone = tower.hitT > 0 ? '#eee5d6' : '#687d91';
      ctx.fillStyle = '#34291f';
      ctx.beginPath(); ctx.moveTo(-1.65, -0.35); ctx.lineTo(-1.35, -3.25); ctx.lineTo(-0.9, -3.65); ctx.lineTo(0.98, -3.65); ctx.lineTo(1.42, -3.12); ctx.lineTo(1.62, -0.35); ctx.closePath(); ctx.fill();
      ctx.fillStyle = stone;
      ctx.beginPath(); ctx.moveTo(-1.34, -0.22); ctx.lineTo(-1.18, -3.02); ctx.lineTo(-0.78, -3.42); ctx.lineTo(0.82, -3.42); ctx.lineTo(1.16, -3.0); ctx.lineTo(1.35, -0.22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#293844'; ctx.stroke();
      ctx.fillStyle = '#8497a8';
      ctx.fillRect(-1.55, -3.44, 3.1, 0.4);
      for (const x of [-1.3, -0.45, 0.45, 1.3]) {
        ctx.fillStyle = '#71869a';
        ctx.fillRect(x - 0.28, -3.9, 0.56, 0.72);
        ctx.strokeStyle = '#293844'; ctx.strokeRect(x - 0.28, -3.9, 0.56, 0.72);
      }
      ctx.strokeStyle = '#435667'; ctx.lineWidth = 0.07;
      for (const y of [-0.8, -1.45, -2.15, -2.85]) {
        ctx.beginPath(); ctx.moveTo(-1.2, y); ctx.lineTo(1.2, y); ctx.stroke();
      }
      for (const y of [-1.1, -2.5]) {
        ctx.beginPath(); ctx.moveTo(-0.55, y); ctx.lineTo(-0.55, y + 0.35); ctx.moveTo(0.58, y - 0.18); ctx.lineTo(0.58, y + 0.2); ctx.stroke();
      }
      ctx.fillStyle = '#3c2a20';
      ctx.beginPath(); ctx.roundRect(-0.43, -1.5, 0.86, 1.58, [0.45, 0.45, 0.06, 0.06]); ctx.fill();
      ctx.strokeStyle = '#c09662'; ctx.lineWidth = 0.07; ctx.stroke();
      ctx.fillStyle = '#a92d32';
      ctx.beginPath(); ctx.moveTo(-1.0, -2.8); ctx.lineTo(-1.0, -1.3); ctx.lineTo(-0.62, -1.05); ctx.lineTo(-0.48, -2.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c33a36';
      ctx.beginPath(); ctx.moveTo(0.58, -3.25); ctx.lineTo(0.58, -1.72); ctx.lineTo(1.05, -1.48); ctx.lineTo(0.98, -3.25); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e7b254'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(-0.68, -2.73); ctx.lineTo(-0.53, -2.73); ctx.moveTo(0.84, -3.14); ctx.lineTo(0.91, -3.14); ctx.stroke();
      ctx.fillStyle = '#895a34';
      ctx.fillRect(-2.0, -0.08, 4.0, 0.32);
      ctx.fillStyle = '#c08a54';
      for (let i = 0; i < 17; i++) {
        const x = -1.94 + i * 0.242;
        ctx.beginPath(); ctx.moveTo(x, -0.02); ctx.lineTo(x + 0.12, -0.62 - (i % 3) * 0.08); ctx.lineTo(x + 0.24, -0.02); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#493321'; ctx.lineWidth = 0.035; ctx.stroke();
      }
      ctx.strokeStyle = '#d2b083'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(-1.95, 0.08); ctx.lineTo(1.98, 0.08); ctx.stroke();
      ctx.fillStyle = '#273945';
      ctx.beginPath(); ctx.moveTo(-0.36, -3.86); ctx.lineTo(0, -4.54); ctx.lineTo(0.38, -3.86); ctx.lineTo(0, -3.24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#47d6ff';
      ctx.beginPath(); ctx.moveTo(-0.26, -3.88); ctx.lineTo(0, -4.43); ctx.lineTo(0.27, -3.88); ctx.lineTo(0, -3.34); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d4f8ff'; ctx.lineWidth = 0.045; ctx.stroke();
      ctx.fillStyle = '#ffb13b';
      ctx.beginPath(); ctx.moveTo(1.55, -3.17); ctx.quadraticCurveTo(1.18, -3.58, 1.56, -4.03); ctx.quadraticCurveTo(1.95, -3.6, 1.73, -3.28); ctx.closePath(); ctx.fill();
    } else {
      const bark = tower.hitT > 0 ? '#e8c2a7' : '#54231f';
      ctx.fillStyle = '#251615';
      ctx.beginPath(); ctx.moveTo(-0.95, -0.18); ctx.lineTo(-1.55, 0.18); ctx.lineTo(-1.95, 0.48); ctx.lineTo(-1.82, -0.18); ctx.lineTo(-1.3, -0.6); ctx.lineTo(-1.12, -1.62); ctx.lineTo(-1.52, -2.28); ctx.lineTo(-1.18, -3.05); ctx.lineTo(-0.5, -3.34); ctx.lineTo(0.48, -3.36); ctx.lineTo(1.2, -2.85); ctx.lineTo(1.35, -1.75); ctx.lineTo(1.1, -0.55); ctx.lineTo(1.78, 0.26); ctx.lineTo(1.54, 0.48); ctx.lineTo(0.8, 0.0); ctx.lineTo(0.38, -0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bark;
      ctx.beginPath(); ctx.moveTo(-1.08, -0.15); ctx.lineTo(-1.4, -0.55); ctx.lineTo(-1.08, -1.44); ctx.lineTo(-1.38, -2.18); ctx.lineTo(-0.97, -3.05); ctx.lineTo(-0.36, -3.25); ctx.lineTo(0.5, -3.22); ctx.lineTo(1.04, -2.75); ctx.lineTo(1.18, -1.75); ctx.lineTo(0.93, -0.55); ctx.lineTo(1.32, -0.08); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#271515'; ctx.stroke();
      ctx.fillStyle = '#74302a';
      for (const block of [[-0.85,-2.72,0.72,0.52],[-0.18,-2.92,0.84,0.54],[0.4,-2.55,0.68,0.5],[-0.78,-2.08,0.78,0.54],[-0.02,-2.1,0.84,0.5],[0.55,-1.72,0.65,0.52],[-0.65,-1.45,0.9,0.5],[0.12,-1.3,0.9,0.52]]) {
        ctx.beginPath(); ctx.roundRect(block[0], block[1], block[2], block[3], 0.12); ctx.fill();
        ctx.strokeStyle = '#2d1715'; ctx.lineWidth = 0.08; ctx.stroke();
      }
      ctx.fillStyle = '#3a1c19';
      ctx.beginPath(); ctx.moveTo(-1.14, -3.04); ctx.lineTo(-0.86, -3.62); ctx.lineTo(-0.49, -3.42); ctx.lineTo(-0.22, -3.76); ctx.lineTo(0.14, -3.45); ctx.lineTo(0.55, -3.65); ctx.lineTo(1.06, -3.04); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6b2a25';
      ctx.beginPath(); ctx.moveTo(-1.07, -3.08); ctx.lineTo(-0.82, -3.48); ctx.lineTo(-0.47, -3.32); ctx.lineTo(-0.2, -3.59); ctx.lineTo(0.13, -3.3); ctx.lineTo(0.5, -3.5); ctx.lineTo(0.99, -3.08); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#291514'; ctx.stroke();
      ctx.fillStyle = '#281916';
      ctx.beginPath(); ctx.moveTo(-0.25, -1.45); ctx.lineTo(0.3, -1.45); ctx.lineTo(0.15, -0.16); ctx.lineTo(-0.1, -0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff3d48';
      for (const crystal of [[-1.12,-0.45,0.26],[0.91,-0.66,0.34],[-0.92,-1.42,0.24],[0.74,-2.13,0.24]]) {
        ctx.beginPath(); ctx.moveTo(crystal[0], crystal[1] - crystal[2]); ctx.lineTo(crystal[0] + crystal[2] * 0.42, crystal[1]); ctx.lineTo(crystal[0], crystal[1] + crystal[2]); ctx.lineTo(crystal[0] - crystal[2] * 0.42, crystal[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffaaa0'; ctx.lineWidth = 0.035; ctx.stroke();
      }
      ctx.fillStyle = '#fa3e42';
      ctx.beginPath(); ctx.moveTo(-0.34, -3.46); ctx.lineTo(0, -4.18); ctx.lineTo(0.37, -3.46); ctx.lineTo(0, -2.93); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff9e91';
      ctx.beginPath(); ctx.moveTo(-0.16, -3.48); ctx.lineTo(0, -4.02); ctx.lineTo(0.08, -3.46); ctx.lineTo(0, -3.13); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffd0bd'; ctx.lineWidth = 0.04; ctx.stroke();
      ctx.strokeStyle = '#271714'; ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.moveTo(-0.78, -3.22); ctx.lineTo(-0.98, -4.24); ctx.lineTo(-1.07, -4.42); ctx.moveTo(0.62, -3.18); ctx.lineTo(0.88, -4.28); ctx.lineTo(1.04, -4.46); ctx.stroke();
      ctx.fillStyle = '#53201e';
      ctx.beginPath(); ctx.moveTo(-0.99, -4.18); ctx.lineTo(-1.83, -4.46); ctx.lineTo(-1.06, -4.7); ctx.lineTo(-0.95, -4.49); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.9, -4.22); ctx.lineTo(1.75, -4.48); ctx.lineTo(1.08, -4.7); ctx.lineTo(0.83, -4.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff9d32';
      ctx.beginPath(); ctx.moveTo(-1.63, -0.9); ctx.quadraticCurveTo(-2.05, -1.34, -1.69, -1.92); ctx.quadraticCurveTo(-1.23, -1.46, -1.52, -1.13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe078';
      ctx.beginPath(); ctx.moveTo(-1.62, -1.0); ctx.quadraticCurveTo(-1.82, -1.35, -1.65, -1.63); ctx.quadraticCurveTo(-1.4, -1.34, -1.62, -1.0); ctx.fill();
    }

    ctx.fillStyle = '#150d09';
    ctx.fillRect(-1.58, -5.13, 3.16, 0.34);
    ctx.fillStyle = friendly ? '#39d46a' : '#ed3945';
    ctx.fillRect(-1.54, -5.09, 3.08 * Math.max(0, tower.hp / tower.maxHp), 0.26);
    ctx.strokeStyle = '#ffe0b4'; ctx.lineWidth = 0.045; ctx.strokeRect(-1.58, -5.13, 3.16, 0.34);
    ctx.fillStyle = '#fff5df';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = 'bold 0.34px Orbitron, sans-serif';
    ctx.fillText(`${friendly ? 'FRIENDLY KEEP' : 'CRYSTAL KEEP'} · ${Math.ceil(tower.hp)}%`, 0, -5.2);
    ctx.restore();
  }

  function drawFighter(f, view) {
    ctx.save();
    ctx.translate(view.cx + f.x * view.scale, view.groundY + f.z * view.scale * view.depth);
    ctx.scale(view.scale, view.spriteScale);
    ctx.rotate(f.angle);
    const jumpHeight = f.jumpT > 0 ? Math.sin((1 - f.jumpT / 0.65) * Math.PI) * 0.65 : 0;
    ctx.translate(0, -jumpHeight);
    const recoil = f.hitT > 0 ? -0.15 : 0;
    ctx.globalAlpha = f.dead ? Math.max(0.22, 1 - f.deathT * 0.5) : 1;
    ctx.fillStyle = '#160e0a80';
    ctx.beginPath(); ctx.ellipse(0.12, 0.2, f.radius * 0.95, f.radius * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    if (f.dodgeT > 0) ctx.rotate(Math.sin(f.dodgeT / 0.35 * Math.PI) * 0.35);
    if (f.heroKey === 'archer') {
      ctx.fillStyle = '#d8f0ff';
      ctx.beginPath(); ctx.moveTo(-f.radius * 0.55, -f.radius * 0.32); ctx.lineTo(-f.radius * 0.82, f.radius * 1.18); ctx.lineTo(0, f.radius * 0.88); ctx.lineTo(f.radius * 0.78, f.radius * 1.2); ctx.lineTo(f.radius * 0.5, -f.radius * 0.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#dce9ed'; ctx.lineWidth = 0.09;
      ctx.beginPath(); ctx.moveTo(-f.radius * 0.46, -f.radius * 0.12); ctx.quadraticCurveTo(0, f.radius * 0.2, f.radius * 0.4, -f.radius * 0.05); ctx.stroke();
    }
    ctx.fillStyle = f.color;
    const bodyHeight = f.crouching ? 0.55 : 0.86;
    ctx.beginPath(); ctx.ellipse(0, 0, f.radius * 0.72, f.radius * bodyHeight, 0, 0, Math.PI * 2); ctx.fill();
    if (f.heroKey === 'archer') {
      ctx.fillStyle = '#d8f0ff';
      ctx.beginPath(); ctx.arc(0, -f.radius * 0.65, f.radius * 0.47, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = f.hitT > 0 ? '#fff2d8' : '#e2b991';
    ctx.beginPath(); ctx.arc(0, -f.radius * 0.65, f.radius * (f.heroKey === 'archer' ? 0.27 : 0.35), 0, Math.PI * 2); ctx.fill();
    const swingProgress = f.attackT > 0 ? Math.sin((1 - f.attackT / f.attackDuration) * Math.PI) : 0;
    if (f.actionType === 'spear' || f.heroKey === 'spearman') {
      ctx.strokeStyle = '#9b7146'; ctx.lineWidth = 0.11;
      ctx.beginPath(); ctx.moveTo(0.12, -0.04); ctx.lineTo(0.16 + swingProgress * 0.28, -f.radius * 2.3); ctx.stroke();
      ctx.strokeStyle = '#d5dbe2'; ctx.lineWidth = 0.16;
      ctx.beginPath(); ctx.moveTo(0.16 + swingProgress * 0.28, -f.radius * 2.3); ctx.lineTo(0.16 + swingProgress * 0.28, -f.radius * 2.65); ctx.stroke();
    } else if (f.heroKey === 'archer' || f.actionType === 'arrow') {
      ctx.strokeStyle = '#684829'; ctx.lineWidth = 0.09;
      ctx.beginPath(); ctx.moveTo(0.3, -f.radius * 1.55); ctx.quadraticCurveTo(0.92, -f.radius * 0.65, 0.3, f.radius * 0.42); ctx.stroke();
      ctx.strokeStyle = '#dce9ed'; ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.moveTo(0.3, -f.radius * 1.55); ctx.lineTo(0.3, f.radius * 0.42); ctx.stroke();
      if (f.attackT > 0 && f.actionType === 'arrow') {
        const arrowX = 0.36 + swingProgress * 0.22;
        ctx.strokeStyle = '#9b7146'; ctx.lineWidth = 0.075;
        ctx.beginPath(); ctx.moveTo(arrowX, -f.radius * 0.28); ctx.lineTo(arrowX, -f.radius * 1.68); ctx.stroke();
        ctx.fillStyle = '#d5dbe2'; ctx.beginPath(); ctx.moveTo(arrowX, -f.radius * 1.84); ctx.lineTo(arrowX - 0.09, -f.radius * 1.55); ctx.lineTo(arrowX + 0.09, -f.radius * 1.55); ctx.closePath(); ctx.fill();
      }
    } else if (f.actionType === 'bomb' && f.attackT > 0) {
      ctx.fillStyle = '#28231e'; ctx.beginPath(); ctx.arc(0.3 + swingProgress * 0.65, -0.18 - swingProgress * 0.55, 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc64b'; ctx.fillRect(0.28 + swingProgress * 0.65, -0.39 - swingProgress * 0.55, 0.05, 0.1);
    } else {
      if (f.actionType === 'punch' && f.attackT > 0) {
        ctx.strokeStyle = '#e2b991'; ctx.lineWidth = 0.23;
        ctx.beginPath(); ctx.moveTo(0.1, -0.02); ctx.lineTo(0.65 + swingProgress * 0.35, -0.2); ctx.stroke();
      } else if (f.actionType === 'kick' && f.attackT > 0) {
        ctx.strokeStyle = '#3a261d'; ctx.lineWidth = 0.22;
        ctx.beginPath(); ctx.moveTo(0, 0.15); ctx.lineTo(0.35 + swingProgress * 0.75, 0.35); ctx.stroke();
      } else {
        ctx.strokeStyle = '#d3d6dc'; ctx.lineWidth = 0.13;
        ctx.beginPath();
        const bladeSwing = swingProgress * 0.85;
        ctx.moveTo(0.18, -0.1);
        ctx.lineTo(0.22 + bladeSwing, -f.radius * 1.9);
        ctx.stroke();
        ctx.strokeStyle = '#45301f'; ctx.lineWidth = 0.2;
        ctx.beginPath(); ctx.moveTo(0.1, -0.05); ctx.lineTo(0.26, 0.08); ctx.stroke();
      }
    }
    ctx.restore();
    if (!f.dead) {
      const barW = Math.max(30, view.scale * 1.55);
      const barH = Math.max(7, view.spriteScale * 0.12);
      const barX = view.cx + f.x * view.scale;
      const barY = view.groundY + f.z * view.depth * view.scale - (f.radius * 1.65 + jumpHeight) * view.spriteScale;
      const ratio = Math.max(0, Math.min(1, f.hp / f.maxHp));
      ctx.save();
      ctx.fillStyle = '#160e0bea';
      ctx.fillRect(barX - barW / 2 - 2, barY - 2, barW + 4, barH + 4);
      ctx.fillStyle = '#392c25';
      ctx.fillRect(barX - barW / 2, barY, barW, barH);
      ctx.fillStyle = f.team === 'enemy' ? '#ed3945' : '#39d46a';
      ctx.fillRect(barX - barW / 2, barY, barW * ratio, barH);
      ctx.strokeStyle = '#ffe0a8';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX - barW / 2 - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = '#fff8e8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 9px Inter, Arial, sans-serif';
      ctx.shadowColor = '#160e0b';
      ctx.shadowBlur = 2;
      ctx.fillText(`${Math.ceil(Math.max(0, f.hp))}`, barX, barY + barH / 2, barW - 2);
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const shakeX = shake ? (Math.random() - 0.5) * Math.min(10, width * 0.015) : 0;
    const shakeY = shake ? (Math.random() - 0.5) * Math.min(10, height * 0.015) : 0;
    /* Тулааныг ойроос — бүх талбайг багтаахын оронд тоглогчийг дагана */
    const fitAll = Math.max(0.1, Math.min(width / (arenaRadius * 2 + 3), height / 28));
    const scale = Math.min(fitAll * 2.2, width / 15, height / 13);
    /* Камерын төв тоглогчийг дагах ба талбайн гадна гарахгүй */
    const halfSpan = width / (2 * scale);
    /* Тоглогчийг биш, тулааны фронтыг дагана */
    const living = [player, ...allies, ...enemies].filter(f => f && !f.dead);
    const heroesX = living.filter(f => f.team !== 'enemy').map(f => f.x);
    const foesX = living.filter(f => f.team === 'enemy').map(f => f.x);
    const frontX = (heroesX.length && foesX.length)
      ? (Math.max(...heroesX) + Math.min(...foesX)) * 0.5
      : (heroesX.length ? heroesX.reduce((a, b) => a + b, 0) / heroesX.length
        : (foesX.length ? foesX.reduce((a, b) => a + b, 0) / foesX.length : 0));
    const follow = Math.max(-arenaRadius + halfSpan, Math.min(arenaRadius - halfSpan, frontX));
    const view = {
      cx: width / 2 - (halfSpan < arenaRadius ? follow * scale : 0) + shakeX,
      groundY: height * 0.72 + shakeY,
      scale,
      spriteScale: Math.min(height / 26, scale * 1.75),
      depth: Math.min(0.42, Math.max(0.28, (height / Math.max(1, width)) * 0.2))
    };
    const left = view.cx - arenaRadius * scale;
    const right = view.cx + arenaRadius * scale;
    const farY = view.groundY - arenaRadius * view.depth * scale;
    const nearY = view.groundY + arenaRadius * view.depth * scale;
    const horizonY = Math.max(height * 0.24, farY - scale * 3.2);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#372337');
    sky.addColorStop(0.36, '#9c4d3a');
    sky.addColorStop(0.56, '#e6a04d');
    sky.addColorStop(0.57, '#70402b');
    sky.addColorStop(1, '#24150f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const sunX = width * 0.68;
    const sunRadius = Math.max(18, Math.min(width, height) * 0.085);
    const glow = ctx.createRadialGradient(sunX, horizonY - sunRadius * 0.25, 2, sunX, horizonY - sunRadius * 0.25, sunRadius * 2.5);
    glow.addColorStop(0, '#ffd88b99');
    glow.addColorStop(1, '#ff9d3b00');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - sunRadius * 2.5, horizonY - sunRadius * 2.75, sunRadius * 5, sunRadius * 5);
    ctx.fillStyle = '#ffe0a0';
    ctx.beginPath();
    ctx.arc(sunX, horizonY - sunRadius * 0.25, sunRadius * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Distant colosseum silhouettes anchor the fixed side-on horizon.
    ctx.fillStyle = '#3f2930';
    ctx.beginPath();
    ctx.moveTo(0, horizonY + scale * 0.9);
    for (let x = 0; x <= width + 1; x += Math.max(24, width / 18)) {
      const heightOffset = scale * (0.45 + ((Math.floor(x / Math.max(24, width / 18)) * 7) % 5) * 0.15);
      ctx.lineTo(x, horizonY - heightOffset);
      ctx.lineTo(x + Math.max(24, width / 18) * 0.65, horizonY + scale * 0.85);
    }
    ctx.lineTo(width, horizonY + scale * 1.7);
    ctx.lineTo(0, horizonY + scale * 1.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#24191c88';
    const archWidth = Math.max(14, Math.min(32, width * 0.035));
    for (let x = archWidth; x < width; x += archWidth * 2.4) {
      ctx.fillRect(x, horizonY + scale * 0.18, archWidth * 0.58, scale * 1.15);
    }

    // Broad stone platform with a shallow depth band reads as a side-view arena.
    ctx.fillStyle = '#21140f99';
    ctx.beginPath();
    ctx.ellipse(view.cx, nearY + scale * 0.48, arenaRadius * scale * 1.08, Math.max(5, scale * 0.7), 0, 0, Math.PI * 2);
    ctx.fill();
    const stone = ctx.createLinearGradient(0, farY, 0, nearY);
    stone.addColorStop(0, '#d2ac70');
    stone.addColorStop(0.55, '#b8804c');
    stone.addColorStop(1, '#81563a');
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(left, farY);
    ctx.lineTo(right, farY);
    ctx.lineTo(right, nearY);
    ctx.lineTo(left, nearY);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, farY, right - left, nearY - farY);
    ctx.clip();
    ctx.strokeStyle = '#65432d77';
    ctx.lineWidth = Math.max(1, scale * 0.035);
    for (let x = -arenaRadius; x <= arenaRadius; x += 2.8) {
      const sx = view.cx + x * scale;
      ctx.beginPath(); ctx.moveTo(sx, farY); ctx.lineTo(sx, nearY); ctx.stroke();
    }
    for (let z = -arenaRadius; z <= arenaRadius; z += 2.8) {
      const sy = view.groundY + z * view.depth * scale;
      ctx.beginPath(); ctx.moveTo(left, sy); ctx.lineTo(right, sy); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = '#f0c98a';
    ctx.lineWidth = Math.max(2, scale * 0.1);
    ctx.beginPath(); ctx.moveTo(left, farY); ctx.lineTo(right, farY); ctx.stroke();
    ctx.strokeStyle = '#4d2e20';
    ctx.lineWidth = Math.max(3, scale * 0.14);
    ctx.beginPath(); ctx.moveTo(left, nearY); ctx.lineTo(right, nearY); ctx.stroke();
    ctx.fillStyle = '#65412a';
    ctx.fillRect(left, nearY, right - left, Math.max(4, scale * 0.38));
    ctx.strokeStyle = '#c9995f';
    ctx.lineWidth = Math.max(1, scale * 0.045);
    ctx.beginPath(); ctx.moveTo(left, nearY + scale * 0.16); ctx.lineTo(right, nearY + scale * 0.16); ctx.stroke();

    // Rear-edge braziers add scale without obscuring the fighters.
    for (const x of [-16, -10, -4, 4, 10, 16]) {
      const px = view.cx + x * scale;
      const py = view.groundY - 16.7 * view.depth * scale;
      ctx.fillStyle = '#493021';
      ctx.fillRect(px - scale * 0.12, py - scale * 1.05, scale * 0.24, scale * 1.05);
      ctx.fillStyle = '#dba65e';
      ctx.fillRect(px - scale * 0.28, py - scale * 1.08, scale * 0.56, scale * 0.13);
      ctx.fillStyle = '#ffb342';
      ctx.beginPath(); ctx.arc(px, py - scale * 1.2, Math.max(2, scale * 0.12), 0, Math.PI * 2); ctx.fill();
    }

    drawTower(friendlyTower, view);
    drawTower(enemyTower, view);
    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life / 0.45);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(view.cx + particle.x * scale, view.groundY + particle.z * view.depth * scale, Math.max(1, (particle.radius || 0.09) * scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const bomb of bombs) {
      const bx = view.cx + bomb.x * scale;
      const by = view.groundY + bomb.z * view.depth * scale - bomb.y * scale * 0.72;
      ctx.fillStyle = '#160f0b';
      ctx.beginPath(); ctx.arc(bx, by, Math.max(2, scale * 0.18), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffc64d'; ctx.lineWidth = Math.max(1, scale * 0.07);
      ctx.beginPath(); ctx.moveTo(bx, by - scale * 0.2); ctx.lineTo(bx + scale * 0.1, by - scale * 0.3); ctx.stroke();
    }
    for (const arrow of arrows) {
      const x = view.cx + arrow.x * scale;
      const y = view.groundY + arrow.z * view.depth * scale - arrow.y * scale * 0.72;
      const directionX = arrow.vx;
      const directionY = arrow.vz * view.depth;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(directionY, directionX));
      ctx.strokeStyle = '#9b7146'; ctx.lineWidth = Math.max(1.5, scale * 0.055);
      ctx.beginPath(); ctx.moveTo(-scale * 0.34, 0); ctx.lineTo(scale * 0.34, 0); ctx.stroke();
      ctx.fillStyle = '#d5dbe2';
      ctx.beginPath(); ctx.moveTo(scale * 0.48, 0); ctx.lineTo(scale * 0.25, -scale * 0.11); ctx.lineTo(scale * 0.25, scale * 0.11); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#65b9e8'; ctx.lineWidth = Math.max(1, scale * 0.045);
      ctx.beginPath(); ctx.moveTo(-scale * 0.24, 0); ctx.lineTo(-scale * 0.4, -scale * 0.1); ctx.moveTo(-scale * 0.24, 0); ctx.lineTo(-scale * 0.4, scale * 0.1); ctx.stroke();
      ctx.restore();
    }
    const fighters = [...enemies, ...allies];
    if (player && (state === 'play' || state === 'paused' || state === 'over')) fighters.push(player);
    fighters.sort((a, b) => a.z - b.z);
    for (const fighter of fighters) drawFighter(fighter, view);

    const timerLabel = $('math-timer');
    if (timerLabel) {
      timerLabel.textContent = `${Math.max(0, Math.ceil(mathTimeLeft))}s`;
      timerLabel.classList.toggle('urgent', mathTimeLeft <= 5);
    }
    const playerName = $('p-name');
    if (playerName) playerName.textContent = `🏰 БААТРУУДЫН ЦАЙЗ · ${Math.ceil(friendlyTower.hp)}%`;
    updateMathProgress();
    const playerHpPercent = Math.max(0, (player?.hp || 0) / (player?.maxHp || 100)) * 100;
    const playerStaminaPercent = Math.max(0, Math.min(100, (player?.stamina || 0) / (player?.maxStamina || 100) * 100));
    $('hp').style.width = `${playerHpPercent}%`;
    $('st').style.width = `${playerStaminaPercent}%`;
    const playerHpBar = $('p-hp');
    const playerStaminaBar = $('p-st');
    if (playerHpBar) playerHpBar.style.width = `${Math.max(0, friendlyTower.hp / friendlyTower.maxHp) * 100}%`;
    if (playerStaminaBar) playerStaminaBar.style.width = `${playerStaminaPercent}%`;
    const enemyHpBar = $('e-hp');
    if (enemyHpBar) enemyHpBar.style.width = `${Math.max(0, enemyTower.hp / enemyTower.maxHp) * 100}%`;
    const enemyName = $('e-name');
    if (enemyName) enemyName.textContent = `💎 ДАЙСНЫ ЦАЙЗ · ${Math.ceil(enemyTower.hp)}%`;
    const roundLabel = $('match-round');
    if (roundLabel && state === 'play') roundLabel.textContent = `ROUND ${wave} · NEXT ${Math.ceil(reinforcementTimer)}s`;
    const boostBadge = $('boost-badge');
    if (boostBadge) {
      boostBadge.style.display = boostTimer > 0 ? 'inline-block' : 'none';
      if (boostTimer > 0) boostBadge.textContent = `⚡ x3 POWER (${Math.ceil(boostTimer)}s)`;
    }
    $('info').innerHTML = `WAVE ${wave}<br>SCORE ${score}<br>FIGHTERS ${fighterCountOnField()}/${MAX_FIGHTERS}<br>FRIENDLY KEEP ${Math.ceil(friendlyTower.hp)}%<br>ENEMY KEEP ${Math.ceil(enemyTower.hp)}%<br>NEXT IN ${Math.ceil(reinforcementTimer)}s`;
    if (bannerTime > 0) {
      ctx.globalAlpha = Math.min(1, bannerTime * 2);
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.max(16, Math.min(38, width * 0.055))}px Orbitron, sans-serif`;
      ctx.fillStyle = '#fff2ce'; ctx.shadowColor = '#290f08'; ctx.shadowBlur = 12;
      ctx.fillText(banner, width / 2, height * 0.37, width * 0.92);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (state === 'play') update(dt);
    render();
    requestAnimationFrame(frame);
  }
  if (state === 'menu') resetPlayer();
  updateButton();
  requestAnimationFrame(frame);
}
