import * as THREE from 'three';
import { lbLoad, lbSubmit } from './leaderboard.js';
import { setMathText } from './mathtext.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFighter, animateFighter } from './fighter.js';
import { createQuizQuestion, getQuizSettings, applyQuizSettings } from './quiz.js';
import { HERO_PROFILES, getHeroProfile, getHeroAction } from './hero-profiles.js';

/* PvP-ийн төлөв — доорх функцуудаас өмнө зарлагдсан байх ёстой, учир нь
   initFighterStats() модуль ачаалах үедээ дуудагддаг. */
let netIdSeq = 0;
let pvpSendTimer = 0;
let pvpStarted = false;
const netFighters = new Map();     /* зочин дээр: netId → тулаанч */

const ARENA_R = 18;
const $ = id => document.getElementById(id);
const healthBarWorldPosition = new THREE.Vector3();
let statusActivity = '3D arena ready · click FIGHT to begin.';
const statusWarnings = [];
function refreshStatus() {
    const el = $('status');
    if (el) el.textContent = [...statusWarnings, statusActivity].filter(Boolean).join(' · ');
}
function setStatus(text) { statusActivity = text; refreshStatus(); }
function attachFighterHealthBar(fighter) {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.9 * fighter.scale, 0.4 * fighter.scale, 1);
    sprite.position.set(0, 2.55 * fighter.scale + 0.2, 0);
    sprite.renderOrder = 20;
    fighter.group.add(sprite);
    fighter.healthBar = { canvas, ctx, texture, material, sprite, lastHp: NaN, lastMaxHp: NaN };
    updateFighterHealthBar(fighter);
}
function disposeFighterHealthBar(fighter) {
    if (!fighter.healthBar) return;
    fighter.group.remove(fighter.healthBar.sprite);
    fighter.healthBar.texture.dispose();
    fighter.healthBar.material.dispose();
    fighter.healthBar = null;
}
function updateFighterHealthBar(fighter) {
    const bar = fighter.healthBar;
    if (!bar) return;
    const hp = Math.max(0, Math.ceil(fighter.hp));
    const maxHp = Math.max(1, Math.ceil(fighter.maxHp));
    if (hp !== bar.lastHp || maxHp !== bar.lastMaxHp) {
        const { ctx, canvas, texture } = bar;
        const ratio = THREE.MathUtils.clamp(fighter.hp / fighter.maxHp, 0, 1);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(13, 9, 8, 0.94)';
        ctx.fillRect(1, 1, 190, 38);
        ctx.fillStyle = '#30241d';
        ctx.fillRect(6, 7, 180, 26);
        ctx.fillStyle = fighter.team === 'enemy' ? '#ed3945' : '#39d46a';
        ctx.fillRect(6, 7, 180 * ratio, 26);
        ctx.strokeStyle = '#ffe0a8';
        ctx.lineWidth = 3;
        ctx.strokeRect(2.5, 2.5, 187, 35);
        ctx.font = 'bold 28px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#160e0b';
        ctx.strokeText(`${hp} / ${maxHp}`, 96, 20);
        ctx.fillStyle = '#fff8e8';
        ctx.fillText(`${hp} / ${maxHp}`, 96, 20);
        texture.needsUpdate = true;
        bar.lastHp = hp;
        bar.lastMaxHp = maxHp;
    }
    bar.sprite.position.y = 2.55 * fighter.scale + 0.2;
    bar.sprite.getWorldPosition(healthBarWorldPosition);
    const viewportHeight = Math.max(1, renderer.domElement.clientHeight || window.innerHeight);
    const cameraDepth = Math.max(camera.near, camera.position.distanceTo(healthBarWorldPosition));
    const unitsPerPixel = 2 * cameraDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / viewportHeight;
    bar.sprite.scale.set(72 * unitsPerPixel, 15 * unitsPerPixel, 1);
    bar.sprite.visible = fighter.group.visible;
}
function addStatusWarning(text) {
    if (!statusWarnings.includes(text)) statusWarnings.push(text);
    refreshStatus();
}

// ---------- Renderer / scene ----------
const gameEvents = new AbortController();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('game-container').appendChild(renderer.domElement);
window.__arenaShutdown = () => {
    renderer.setAnimationLoop(null);
    gameEvents.abort();
    $('play').onclick = null;
    music?.pause();
    if (proceduralMusicTimer) window.clearInterval(proceduralMusicTimer);
    proceduralMusicTimer = null;
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
};
renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    window.__arenaFallback?.('The WebGL context was lost; switched to the procedural arena.');
}, { signal: gameEvents.signal });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a2418);
scene.fog = new THREE.Fog(0x8a5a3a, 40, 110);
const camera = new THREE.PerspectiveCamera(44, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 300);
camera.position.set(0, 3.4, 13);
camera.lookAt(0, 1.6, 0);

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
}, { signal: gameEvents.signal });

function makeProceduralSkyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#472a43');
    gradient.addColorStop(0.36, '#dc7444');
    gradient.addColorStop(0.5, '#ffc76e');
    gradient.addColorStop(0.62, '#a95a38');
    gradient.addColorStop(1, '#39241f');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
    const sunGlow = ctx.createRadialGradient(600, 252, 8, 600, 252, 150);
    sunGlow.addColorStop(0, '#ffe7a6cc'); sunGlow.addColorStop(1, '#ffad5500');
    ctx.fillStyle = sunGlow; ctx.fillRect(400, 80, 400, 350);
    ctx.fillStyle = '#ffe3a0'; ctx.beginPath(); ctx.arc(600, 260, 38, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 22; i++) {
        const x = (i * 79 + 20) % 1024;
        const y = 290 + (i % 4) * 12;
        ctx.fillStyle = '#3d292a';
        ctx.fillRect(x, y, 30 + (i % 5) * 12, 20 + (i % 3) * 9);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
function makeProceduralFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#bd905d'; ctx.fillRect(0, 0, 512, 512);
    const size = 128;
    for (let y = 0; y < 512; y += size) for (let x = 0; x < 512; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2) ? '#c9a06b' : '#d0a972';
        ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
        ctx.strokeStyle = '#795438'; ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
        ctx.strokeStyle = '#e0bd83'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 14, y + size - 18); ctx.lineTo(x + size * 0.55, y + 16); ctx.stroke();
    }
    for (let i = 0; i < 180; i++) {
        ctx.fillStyle = i % 2 ? '#8e6542' : '#ead09b';
        ctx.globalAlpha = 0.18 + Math.random() * 0.22;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 6, 1 + Math.random() * 4);
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 6);
    return texture;
}

const skyFallback = makeProceduralSkyTexture();
scene.background = skyFallback;
try {
    new THREE.TextureLoader().load('assets/arena-sky.webp', tex => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        scene.background = tex;
        skyFallback.dispose();
    }, undefined, () => addStatusWarning('Sky image missing; using a procedural sunset.'));
} catch {
    addStatusWarning('Sky image unavailable; using a procedural sunset.');
}

scene.add(new THREE.HemisphereLight(0xffe0b0, 0x402010, 1.9));
/* Нарны эсрэг талаас зөөлөн гэрэл — баатрууд хар дүрс болж харагдахгүй,
   хувцасных нь өнгө ялгарна. */
const fillLight = new THREE.DirectionalLight(0xd4e6ff, 1.6);
fillLight.position.set(-12, 14, 16);
scene.add(fillLight);
const sun = new THREE.DirectionalLight(0xffc888, 2.2);
sun.position.set(15, 25, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 });
scene.add(sun);

function buildArena() {
    let floorTex = makeProceduralFloorTexture();
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
    try {
        new THREE.TextureLoader().load('assets/arena-floor.webp', tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(6, 6);
            floorMaterial.map = tex;
            floorMaterial.needsUpdate = true;
            floorTex.dispose();
            floorTex = tex;
        }, undefined, () => addStatusWarning('Floor image missing; using procedural stone tiles.'));
    } catch {
        addStatusWarning('Floor image unavailable; using procedural stone tiles.');
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 1, 64), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(ARENA_R + 2, ARENA_R + 2, 3, 64, 1, true, Math.PI / 2, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0xc9a46a, side: THREE.BackSide, roughness: 1 })
    );
    wall.position.y = 1.5;
    wall.receiveShadow = true;
    scene.add(wall);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd8b98a });
    const torchMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        if (Math.sin(a) > -0.12) continue;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 6, 12), pillarMat);
        p.position.set(Math.cos(a) * (ARENA_R + 2.3), 3, Math.sin(a) * (ARENA_R + 2.3));
        p.castShadow = true;
        scene.add(p);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), torchMat);
        flame.position.set(p.position.x, 6.3, p.position.z);
        scene.add(flame);
    }
}
buildArena();

const towerLoader = new GLTFLoader();
function buildTower(team, x) {
    const group = new THREE.Group();
    const heroSide = team === 'hero';
    const stone = new THREE.MeshStandardMaterial({ color: heroSide ? 0x52677d : 0x6f2b27, roughness: 0.82, metalness: 0.08 });
    const trim = new THREE.MeshStandardMaterial({ color: heroSide ? 0xa9d8ff : 0xff7654, roughness: 0.45, metalness: 0.25, emissive: heroSide ? 0x123b82 : 0x6e160c, emissiveIntensity: 0.18 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x34251b, roughness: 0.9 });
    const placeholderParts = [];
    const add = (geometry, material, px, py, pz) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        placeholderParts.push(mesh);
        return mesh;
    };
    add(new THREE.CylinderGeometry(1.75, 2.1, 0.48, 8), dark, 0, 0.24, 0);
    const core = add(new THREE.BoxGeometry(2.45, 4.35, 2.45), stone, 0, 2.45, 0);
    add(new THREE.BoxGeometry(2.8, 0.28, 2.8), trim, 0, 4.55, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        add(new THREE.BoxGeometry(0.62, 0.82, 0.62), trim, sx * 1.06, 4.93, sz * 1.06);
        add(new THREE.BoxGeometry(0.19, 0.9, 0.12), dark, sx * 0.57, 2.55, 1.235);
    }
    add(new THREE.CylinderGeometry(0.34, 0.48, 0.82, 8), trim, 0, 5.18, 0);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), new THREE.MeshBasicMaterial({ color: heroSide ? 0x6ecbff : 0xff5749 }));
    beacon.position.y = 5.88;
    group.add(beacon);
    placeholderParts.push(beacon);

    const details = new THREE.Group();
    group.add(details);
    const detailMaterials = [];
    const detail = (geometry, material, px, py, pz) => {
        if (!detailMaterials.includes(material)) detailMaterials.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        details.add(mesh);
        return mesh;
    };
    const wood = new THREE.MeshStandardMaterial({ color: heroSide ? 0x633e29 : 0x321a18, roughness: 0.88 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: heroSide ? 0x982e35 : 0x501b1c, side: THREE.DoubleSide, roughness: 0.78 });
    const gem = new THREE.MeshStandardMaterial({ color: heroSide ? 0x43d7ff : 0xff3348, emissive: heroSide ? 0x168cbf : 0xa40d20, emissiveIntensity: 0.72, roughness: 0.23, metalness: 0.08 });
    if (heroSide) {
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0x765135, roughness: 0.9 });
        for (let i = 0; i < 22; i++) {
            const angle = (i / 22) * Math.PI * 2;
            if (Math.abs(angle - Math.PI / 2) < 0.32) continue;
            const radius = 2.38;
            detail(new THREE.CylinderGeometry(0.065, 0.13, 0.92, 5), fenceMat, Math.cos(angle) * radius, 0.48, Math.sin(angle) * radius);
            const tip = detail(new THREE.ConeGeometry(0.105, 0.32, 5), wood, Math.cos(angle) * radius, 1.08, Math.sin(angle) * radius);
            tip.rotation.z = Math.cos(angle) * -0.12;
        }
        detail(new THREE.BoxGeometry(1.55, 0.18, 0.16), fenceMat, 0, 0.32, 2.35);
        detail(new THREE.BoxGeometry(1.55, 0.18, 0.16), fenceMat, 0, 0.78, 2.35);
        const doorShape = new THREE.Shape();
        doorShape.moveTo(-0.55, 0);
        doorShape.lineTo(-0.55, 1.2);
        doorShape.quadraticCurveTo(-0.55, 1.85, 0, 1.85);
        doorShape.quadraticCurveTo(0.55, 1.85, 0.55, 1.2);
        doorShape.lineTo(0.55, 0);
        doorShape.closePath();
        detail(new THREE.ExtrudeGeometry(doorShape, { depth: 0.09, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.035, bevelThickness: 0.035 }), wood, 0, 0.1, 1.72);
        detail(new THREE.BoxGeometry(0.08, 1.15, 0.035), new THREE.MeshStandardMaterial({ color: 0x30231b }), -0.19, 0.68, 1.83);
        detail(new THREE.BoxGeometry(0.08, 1.15, 0.035), new THREE.MeshStandardMaterial({ color: 0x30231b }), 0.19, 0.68, 1.83);
        for (const y of [1.2, 2.8]) {
            const band = detail(new THREE.TorusGeometry(1.46, 0.075, 6, 24), trim, 0, y, 0);
            band.rotation.x = Math.PI / 2;
        }
        detail(new THREE.CylinderGeometry(0.055, 0.065, 2.55, 8), wood, -1.48, 4.25, 0.88);
        const flagShape = new THREE.Shape();
        flagShape.moveTo(0, 0.9); flagShape.lineTo(1.05, 0.62); flagShape.lineTo(0.72, 0.18); flagShape.lineTo(1.0, -0.14); flagShape.lineTo(0, 0); flagShape.closePath();
        detail(new THREE.ShapeGeometry(flagShape), bannerMat, -1.47, 4.88, 0.89);
        const blueGem = detail(new THREE.OctahedronGeometry(0.54, 0), gem, 0, 6.25, 0.1);
        blueGem.rotation.y = Math.PI / 4;
    } else {
        const rootMat = new THREE.MeshStandardMaterial({ color: 0x38201d, roughness: 0.94 });
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const start = new THREE.Vector3(Math.cos(angle) * 0.5, 0.55, Math.sin(angle) * 0.5);
            const end = new THREE.Vector3(Math.cos(angle) * 2.02, 0.12, Math.sin(angle) * 2.02);
            const delta = end.clone().sub(start);
            const root = detail(new THREE.CylinderGeometry(0.12, 0.35, delta.length(), 6), rootMat, (start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
            root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
        }
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const crystal = detail(new THREE.OctahedronGeometry(0.48 - (i % 2) * 0.09, 0), gem, Math.cos(angle) * 1.35, 0.72 + (i % 2) * 0.22, Math.sin(angle) * 1.35);
            crystal.scale.set(0.75, 1.45, 0.8);
            crystal.rotation.set(0.18, angle, -0.22);
        }
        for (const y of [1.65, 3.25]) {
            const band = detail(new THREE.TorusGeometry(1.28, 0.1, 6, 20), rootMat, 0, y, 0);
            band.rotation.x = Math.PI / 2;
        }
        detail(new THREE.CylinderGeometry(0.055, 0.065, 2.55, 7), rootMat, 1.2, 4.45, 0.5);
        const flagShape = new THREE.Shape();
        flagShape.moveTo(0, 0.9); flagShape.lineTo(0.93, 0.7); flagShape.lineTo(0.62, 0.38); flagShape.lineTo(0.91, 0.08); flagShape.lineTo(0, 0); flagShape.closePath();
        detail(new THREE.ShapeGeometry(flagShape), bannerMat, 1.22, 5.0, 0.51);
        const redGem = detail(new THREE.OctahedronGeometry(0.56, 0), gem, 0, 6.28, 0.05);
        redGem.rotation.y = Math.PI / 4;
    }
    group.position.set(x, 0, 0);
    scene.add(group);
    const tower = {
        team, group, core, placeholderParts, visualRoot: null,
        materials: [stone, trim, dark, ...detailMaterials],
        materialStates: [],
        position: new THREE.Vector3(x, 0, 0), hp: 100, maxHp: 100,
        dead: false, collapseT: 0, collapsed: false, hitT: 0
    };
    tower.materialStates = tower.materials.map(material => ({
        material,
        emissive: material.emissive?.clone() || null,
        intensity: material.emissiveIntensity || 0
    }));
    const modelPath = heroSide ? 'assets/models/friendly-blue-keep.glb' : 'assets/models/enemy-crystal-root-fortress.glb';
    towerLoader.load(modelPath, gltf => {
        const visual = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(visual);
        const size = bounds.getSize(new THREE.Vector3());
        const modelScale = 6.2 / Math.max(size.y, 0.001);
        visual.scale.setScalar(modelScale);
        bounds.setFromObject(visual);
        const center = bounds.getCenter(new THREE.Vector3());
        visual.position.x -= center.x;
        visual.position.z -= center.z;
        visual.position.y -= bounds.min.y;
        visual.traverse(object => {
            if (!object.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
            const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of objectMaterials) {
                if (material && !tower.materials.includes(material)) tower.materials.push(material);
            }
        });
        tower.materialStates = tower.materials.map(material => ({
            material,
            emissive: material.emissive?.clone() || null,
            intensity: material.emissiveIntensity || 0
        }));
        for (const part of tower.placeholderParts) {
            group.remove(part);
            part.geometry.dispose();
            const materials = Array.isArray(part.material) ? part.material : [part.material];
            for (const material of materials) {
                if (![stone, trim, dark].includes(material)) material.dispose();
            }
        }
        stone.dispose();
        trim.dispose();
        dark.dispose();
        tower.placeholderParts.length = 0;
        group.add(visual);
        tower.visualRoot = visual;
        tower.core = null;
        refreshStatus();
    }, undefined, error => {
        console.error(`${heroSide ? 'Friendly' : 'Enemy'} 3D fortress failed to load from ${modelPath}.`, error);
        addStatusWarning(`${heroSide ? 'Friendly' : 'Enemy'} fortress model unavailable; using the carved stone placeholder.`);
    });
    return tower;
}
function resetTowerMaterials(tower) {
    for (const state of tower.materialStates) {
        if (state.emissive && state.material.emissive) state.material.emissive.copy(state.emissive);
        if (state.material.emissiveIntensity !== undefined) state.material.emissiveIntensity = state.intensity;
    }
}
function setTowerHitGlow(tower, active) {
    const color = tower.team === 'enemy' ? 0xff624c : 0x77caff;
    for (const state of tower.materialStates) {
        if (!state.material.emissive) continue;
        if (active) {
            state.material.emissive.setHex(color);
            state.material.emissiveIntensity = Math.max(state.intensity, 0.72);
        } else {
            if (state.emissive) state.material.emissive.copy(state.emissive);
            state.material.emissiveIntensity = state.intensity;
        }
    }
}
const friendlyTower = buildTower('hero', -13);
const enemyTower = buildTower('enemy', 13);
refreshStatus();

// ---------- Audio (optional files with synthesized fallback) ----------
let music = null;
let hitSfx = null;
let muted = false;
let actx = null;
let audioFallbackActive = false;
let proceduralMusicTimer = null;
let musicBeat = 0;
let audioInitialized = false;

function audioContext() {
    if (actx) return actx;
    try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioCtor) actx = new AudioCtor();
    } catch { /* Sound is optional. */ }
    return actx;
}
function playProceduralTone(kind = 'hit', pitch = 1) {
    if (muted) return;
    const context = audioContext();
    if (!context) return;
    try {
        if (context.state === 'suspended') context.resume().catch(() => {});
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === 'hit' ? 'square' : 'triangle';
        const startHz = kind === 'music' ? pitch : kind === 'hit' ? 190 : 520 * pitch;
        oscillator.frequency.setValueAtTime(startHz, now);
        oscillator.frequency.exponentialRampToValueAtTime(kind === 'music' ? Math.max(45, startHz * 0.72) : 75, now + 0.14);
        gain.gain.setValueAtTime(kind === 'music' ? 0.025 : kind === 'hit' ? 0.12 : 0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'music' ? 0.32 : 0.17));
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + (kind === 'music' ? 0.34 : 0.18));
    } catch { /* Keep gameplay active if Web Audio is unavailable. */ }
}
function startProceduralMusic() {
    if (proceduralMusicTimer || muted || !audioContext()) return;
    const notes = [82.4, 98, 73.4, 110, 87.3, 65.4, 98, 73.4];
    proceduralMusicTimer = window.setInterval(() => {
        if (!muted) playProceduralTone('music', notes[musicBeat++ % notes.length]);
    }, 430);
}
function audioWarning(text) {
    audioFallbackActive = true;
    addStatusWarning(text);
    startProceduralMusic();
}
function initializeAudio() {
    if (audioInitialized) {
        if (actx?.state === 'suspended') actx.resume().catch(() => {});
        if (!muted && music) music.play().catch(() => audioWarning('Music file unavailable; using synthesized audio.'));
        return;
    }
    audioInitialized = true;
    const context = audioContext();
    if (context?.state === 'suspended') context.resume().catch(() => {});
    if (typeof window.Audio === 'function') {
        try {
            music = new Audio('assets/audio/battle-music.mp3');
            music.loop = true;
            music.volume = Math.max(0, Math.min(1, 0.4));
            music.addEventListener('error', () => audioWarning('Music file unavailable; using synthesized audio.'));
            hitSfx = new Audio('assets/audio/sword-hit.mp3');
            hitSfx.addEventListener('error', () => audioWarning('Sound file unavailable; using synthesized effects.'));
            if (!muted) music.play().catch(() => audioWarning('Music file unavailable; using synthesized audio.'));
        } catch {
            audioWarning(context ? 'Audio files unavailable; using synthesized audio.' : 'Audio unavailable; fighting remains playable silently.');
        }
    } else {
        audioWarning(context ? 'Audio files unavailable; using synthesized audio.' : 'Audio unavailable; fighting remains playable silently.');
    }
}
function playHit() {
    if (muted) return;
    if (!audioFallbackActive && hitSfx) {
        try {
            hitSfx.currentTime = 0;
            hitSfx.play().catch(() => { audioWarning('Sound file unavailable; using synthesized effects.'); playProceduralTone('hit'); });
            return;
        } catch { audioWarning('Sound file unavailable; using synthesized effects.'); }
    }
    playProceduralTone('hit');
}
function playWhoosh(pitch = 1) {
    if (muted) return;
    const context = audioContext();
    if (!context) return;
    try {
        const len = 0.18;
        const buf = context.createBuffer(1, context.sampleRate * len, context.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI);
        const src = context.createBufferSource();
        src.buffer = buf;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 900 * pitch;
        const gain = context.createGain();
        gain.gain.value = 0.25;
        src.connect(filter).connect(gain).connect(context.destination);
        src.start();
    } catch { playProceduralTone('swing', pitch); }
}

// ---------- Bombs and Projectiles ----------
const bombs = [];
const arrows = [];
const bombGeo = new THREE.SphereGeometry(0.24, 12, 10);
const bombMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.3 });
const arrowShaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6);
const arrowHeadGeo = new THREE.ConeGeometry(0.075, 0.22, 6);
const arrowFeatherGeo = new THREE.BoxGeometry(0.14, 0.035, 0.14);
const arrowWoodMat = new THREE.MeshStandardMaterial({ color: 0x8c6338, roughness: 0.76 });
const arrowSteelMat = new THREE.MeshStandardMaterial({ color: 0xc4d5e4, metalness: 0.72, roughness: 0.28 });
const arrowFeatherMat = new THREE.MeshStandardMaterial({ color: 0x65b9e8, roughness: 0.6 });
function makeArrowMesh() {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(arrowShaftGeo, arrowWoodMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.3;
    const tip = new THREE.Mesh(arrowHeadGeo, arrowSteelMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.82;
    const featherA = new THREE.Mesh(arrowFeatherGeo, arrowFeatherMat);
    featherA.position.set(0, 0.045, -0.08);
    const featherB = new THREE.Mesh(arrowFeatherGeo, arrowFeatherMat);
    featherB.position.set(0, -0.045, -0.08);
    for (const part of [shaft, tip, featherA, featherB]) { part.castShadow = true; group.add(part); }
    return group;
}
function heroAction(fighter, action) {
    return getHeroAction(fighter.heroKey || currentHeroKey, action);
}
function shootArrow(fighter) {
    const target = fighter.commandTarget || (fighter.target && !fighter.target.dead ? fighter.target : currentEnemy) || enemyTower;
    const targetPosition = target?.group?.position || target?.position;
    if (!targetPosition) return;
    const direction = targetPosition.clone().sub(fighter.group.position).setY(0).normalize();
    if (direction.lengthSq() < 0.001) return;
    const mesh = makeArrowMesh();
    mesh.position.copy(fighter.group.position).add(new THREE.Vector3(0, 1.35, 0)).addScaledVector(direction, 0.72);
    mesh.rotation.y = Math.atan2(direction.x, direction.z);
    scene.add(mesh);
    const arrowProfile = heroAction(fighter, 'arrow');
    arrows.push({ mesh, velocity: direction.multiplyScalar(20), life: 1.15, owner: fighter, damage: (fighter.damage || 30) * arrowProfile.mult });
}
function pointSegmentDistanceSqXZ(point, start, end) {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 0.0001
        ? THREE.MathUtils.clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq, 0, 1)
        : 0;
    const nearestX = start.x + dx * t;
    const nearestZ = start.z + dz * t;
    const ox = point.x - nearestX;
    const oz = point.z - nearestZ;
    return ox * ox + oz * oz;
}
function damageArrowTarget(owner, target, damage, heroArrow) {
    if (target.dead || target.dodgeT > 0) return;
    const guardScale = target === player && keys.KeyX ? 0.28 : 1;
    const appliedDamage = (heroArrow ? damage * playerPowerBoost : 2) * guardScale;
    target.hp -= appliedDamage;
    target.hitT = 0.3;
    target.attackT = 0;
    target.slashT = 0;
    target.spearT = 0;
    target.punchT = 0;
    target.kickT = 0;
    target.vel.x = (Math.sign(target.group.position.x - owner.group.position.x) || 1) * (target === player ? 7 : 9);
    const hitPosition = target.group.position.clone().add(new THREE.Vector3(0, 1.2 * target.scale, 0));
    spawnSparks(hitPosition, heroArrow ? 0x77caff : 0xff5b49, 9);
    spawnBlood(hitPosition, 4);
    playHit();
    shake = target === player ? 0.35 : 0.2;
    hitStop = 0.05;
    if (target.hp <= 0) killFighter(target);
}
function updateArrows(dt) {
    for (let i = arrows.length - 1; i >= 0; i--) {
        const arrow = arrows[i];
        const previous = arrow.mesh.position.clone();
        arrow.mesh.position.addScaledVector(arrow.velocity, dt);
        arrow.life -= dt;
        const heroArrow = arrow.owner === player || arrow.owner.team === 'hero';
        const targets = heroArrow ? enemies : [player, ...allies];
        const target = targets.find(candidate => !candidate.dead
            && pointSegmentDistanceSqXZ(candidate.group.position, previous, arrow.mesh.position) < (0.48 + 0.38 * candidate.scale) ** 2);
        let impact = false;
        if (target) {
            damageArrowTarget(arrow.owner, target, arrow.damage ?? (arrow.owner.damage || 30) * 1.2, heroArrow);
            impact = true;
        } else {
            const tower = heroArrow ? enemyTower : friendlyTower;
            if (tower.hp > 0 && pointSegmentDistanceSqXZ(tower.position, previous, arrow.mesh.position) < (1.8 + 0.3) ** 2) {
                damageTower(tower, (arrow.damage ?? (arrow.owner.damage || 30) * 1.2) * (heroArrow ? playerPowerBoost : 1), arrow.owner);
                impact = true;
            }
        }
        if (impact || arrow.life <= 0) {
            scene.remove(arrow.mesh);
            arrows.splice(i, 1);
        }
    }
}
function throwBomb(f) {
    const profile = heroAction(f, 'bomb');
    const cost = profile.cost ?? 30;
    if (f.bombT > 0 || f.dodgeT > 0 || f.dead || f.stamina < cost || f.cooldown > 0) return false;
    f.stamina -= cost;
    f.bombT = profile.duration ?? 0.5;
    f.attackT = 0;
    f.slashT = 0;
    f.spearT = 0;
    f.cooldown = profile.cooldown ?? 1.8;
    playWhoosh(1.4);
    setTimeout(() => {
        if (f.dead || state !== 'play' || f.bombT <= 0) return;
        const mesh = new THREE.Mesh(bombGeo, bombMat);
        const target = f.commandTarget || (f.target && !f.target.dead ? f.target : currentEnemy);
        const targetPosition = target?.group?.position || target?.position;
        const fwd = targetPosition
            ? targetPosition.clone().sub(f.group.position).setY(0).normalize()
            : new THREE.Vector3(Math.sin(f.group.rotation.y), 0, Math.cos(f.group.rotation.y));
        mesh.position.copy(f.group.position).add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(fwd, 0.7);
        const vel = fwd.clone().multiplyScalar(15);
        vel.y = 3.2;
        scene.add(mesh);
        bombs.push({ mesh, vel, life: 2.5, owner: f, damage: profile.damage ?? 60, radius: profile.radius ?? 4.5, towerDamage: profile.towerDamage ?? 70 });
    }, 180);
    return true;
}
function explodeBomb(b) {
    const pos = b.mesh.position.clone();
    scene.remove(b.mesh);
    spawnSparks(pos, 0xff7700, 36);
    spawnSparks(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xffe060, 24);
    playHit();
    shake = 0.45;
    // Friendly bombs damage every nearby enemy; bombs have the strongest single hit.
    const ownerIsHero = b.owner === player || b.owner.team === 'hero';
    const targets = ownerIsHero ? enemies : [player, ...allies];
    const radius = b.radius ?? 4.5;
    for (const t of targets) {
        if (t.dead) continue;
        const dist = t.group.position.distanceTo(pos);
        if (dist < radius) {
            const dmg = ownerIsHero ? Math.round((b.damage ?? 60) * (1 - dist / (radius + 0.5))) : 2;
            const guardedEnemyDamage = !ownerIsHero && t === player && keys.KeyX ? 2 * 0.28 : 2;
            t.hp -= ownerIsHero ? Math.max(1, dmg) : guardedEnemyDamage;
            t.hitT = 0.35;
            const push = t.group.position.clone().sub(pos).setY(0).normalize();
            t.vel.copy(push).setLength(12);
            const hitPos = t.group.position.clone().setY(1);
            spawnSparks(hitPos, 0xff3300, 15);
            spawnBlood(hitPos, 5);
            if (t.hp <= 0) killFighter(t);
        }
    }
    const towerTarget = ownerIsHero ? enemyTower : friendlyTower;
    const towerDistance = Math.hypot(towerTarget.position.x - pos.x, towerTarget.position.z - pos.z);
    if (towerDistance < radius) {
        const towerDamage = ownerIsHero ? (b.towerDamage ?? 70) * Math.max(0.15, 1 - towerDistance / (radius + 0.5)) : 2;
        damageTower(towerTarget, towerDamage, b.owner);
    }
}
function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i];
        b.vel.y -= 18 * dt;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.rotation.x += dt * 6;
        b.life -= dt;
        const heroBomb = b.owner === player || b.owner.team === 'hero';
        const targets = heroBomb ? enemies : [player, ...allies];
        const hitTarget = targets.some(target => !target.dead
            && Math.hypot(target.group.position.x - b.mesh.position.x, target.group.position.z - b.mesh.position.z) < 0.75
            && b.mesh.position.y < 2.2);
        if (hitTarget || b.mesh.position.y <= 0.2 || b.life <= 0) {
            explodeBomb(b);
            bombs.splice(i, 1);
        }
    }
}
const particles = [];
const sparkGeo = new THREE.SphereGeometry(0.07, 5, 5);
const bloodGeo = new THREE.SphereGeometry(0.045, 5, 4);
const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8f111b });
function spawnBlood(pos, count = 5) {
    for (let i = 0; i < count; i++) {
        const drop = new THREE.Mesh(bloodGeo, bloodMat);
        drop.position.copy(pos);
        drop.userData.v = new THREE.Vector3((Math.random() - 0.5) * 4, 0.5 + Math.random() * 2.4, (Math.random() - 0.5) * 4);
        drop.userData.life = 0.32 + Math.random() * 0.12;
        scene.add(drop);
        particles.push(drop);
    }
}
function spawnSparks(pos, color, count = 14) {
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(sparkGeo, mat);
        m.position.copy(pos);
        m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8);
        m.userData.life = 0.5;
        scene.add(m);
        particles.push(m);
    }
}
function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.userData.life -= dt;
        p.userData.v.y -= 18 * dt;
        p.position.addScaledVector(p.userData.v, dt);
        p.scale.setScalar(Math.max(0.01, p.userData.life * 2));
        if (p.userData.life <= 0) {
            scene.remove(p);
            particles.splice(i, 1);
        }
    }
}
let shake = 0;
let hitStop = 0;

// ---------- Game state & Math Boost System ----------
/* Энгийн дайсны ээлж — дарга (golem) үүнд ордоггүй */
const ENEMY_KEYS = ['treant', 'cultist', 'goblin'];
const BOSS_KEY = 'golem';
const HERO_NAMES = { swordsman: 'SWORDSMAN', barbarian: 'BARBARIAN', spearman: 'SPEARMAN', bomber: 'BOMBER', archer: 'ARCHER' };
const ENEMY_NAMES = { treant: 'TREANT', cultist: 'DARK CULTIST', goblin: 'GOBLIN', golem: 'LAVA GOLEM' };

let currentHeroKey = 'swordsman';
/* Баатар бүрийн хувцасны өнгө — бие биенээсээ ч, улаан дайснаас ч ялгарна.
   Өөрчлөхдөө зөвхөн энэ хүснэгтийг засна. */
const HERO_COLORS = {
    swordsman: 0xa9c7f7,  /* СЭЛЭМЧИН — цайвар хөх */
    barbarian: 0xf0b49f,  /* БАРБАР   — цайвар зэв */
    spearman:  0xa6ead2,  /* ЖАДТАН   — цайвар хаш */
    bomber:    0xf8d9a0,  /* ТЭСРЭГЧ  — цайвар хув */
    archer:    0xd6c6fd   /* ХАРВААЧ  — цайвар нил */
};
const ALLY_TINT = 0.78;   /* нөхдийн өнгө багавтар цайвар — тоглогчоос ялгарна */
function heroColor(key, ally) {
    const c = HERO_COLORS[key] ?? HERO_COLORS.swordsman;
    if (!ally) return c;
    /* Нөхдийг арай цайвар болгоно */
    const r = Math.min(255, Math.round(((c >> 16) & 255) + (255 - ((c >> 16) & 255)) * (1 - ALLY_TINT)));
    const g = Math.min(255, Math.round(((c >> 8) & 255) + (255 - ((c >> 8) & 255)) * (1 - ALLY_TINT)));
    const b = Math.min(255, Math.round((c & 255) + (255 - (c & 255)) * (1 - ALLY_TINT)));
    return (r << 16) | (g << 8) | b;
}

let player = createFighter(heroColor(currentHeroKey), 1, currentHeroKey);
player.group.visible = false;
scene.add(player.group);
let currentEnemy = null;
let enemies = [];
let allies = [];
const MAX_FIGHTERS = 10;
let pendingHeroKeys = [];
let pendingHeroChoices = 0;
let pendingHeroRewardAttacks = [];
let autoAttackTimer = 8;
let correctHeroProgress = 0;
let wrongHeroProgress = 0;
let correctActionIndex = 0;
let state = 'menu';
const MAX_WAVE = 10;          /* Тоглоом 10 ҮЕ-тэй — шилдэгийн хүснэгт үүгээр эрэмбэлэгдэнэ */
let wave = 0;
let reinforcementTimer = 30;
let waveClearRewarded = false;
let score = 0;
let yaw = 0;
let pitch = 0.35;
const keys = {};
let touchMoveX = 0;
let touchMoveY = 0;
let movePointerId = null;

// Math boost mechanic
let playerPowerBoost = 1.0;
let boostTimer = 0;
let questionSerial = 0;
let currentMath = { q: '', answer: 0, options: [], id: 'initial' };
let mathTimeLeft = getQuizSettings().seconds;
let queuedTimeoutEnemies = 0;
let autoAttackQueue = [];
let allyAttackCredits = 0;

function generateMathQuestion() {
    currentMath = { ...createQuizQuestion(getQuizSettings()), id: `${Date.now()}-${++questionSerial}` };
    mathTimeLeft = getQuizSettings().seconds;
    renderMathUI();
}

function renderMathUI() {
    const qEl = $('math-q');
    const optsEl = $('math-options');
    if (!qEl || !optsEl) return;
    setMathText(qEl, currentMath.q);
    const timerEl = $('math-timer');
    if (timerEl) {
        timerEl.textContent = `${Math.max(0, Math.ceil(mathTimeLeft))}s`;
        timerEl.classList.toggle('urgent', mathTimeLeft <= 5);
    }
    optsEl.innerHTML = '';
    currentMath.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'math-opt';
        setMathText(btn, opt);
        btn.onclick = (e) => {
            e.stopPropagation();
            solveMath(opt);
        };
        optsEl.appendChild(btn);
    });
    updateMathProgress();
}

function updateMathProgress() {
    const progressEl = $('math-progress');
    if (!progressEl) return;
    const correctLabel = `ЗӨВ ${correctHeroProgress}/3`;
    progressEl.textContent = `${correctLabel} · АЛДАА ${wrongHeroProgress}/3 · ${fighterCountOnField()}/${MAX_FIGHTERS}`;
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
    const validKeys = ['swordsman', 'barbarian', 'spearman', 'bomber', 'archer'];
    if (!validKeys.includes(heroKey)) return;
    const attackOnSpawn = pendingHeroRewardAttacks.shift() || false;
    pendingHeroChoices--;
    pendingHeroKeys.push({ heroKey, attackOnSpawn });
    spawnPendingHeroes();
    updateRecruitPanel();
}
for (const button of document.querySelectorAll('.recruit-option[data-recruit-key]')) {
    button.addEventListener('click', () => chooseRecruit(button.dataset.recruitKey), { signal: gameEvents.signal });
}

function sendCurrentQuestion(timedOut = false) {
    const network = window.ArenaMultiplayer;
    if (network?.connected && network.role === 'host') {
        network.send({ type: 'question', question: currentMath, timeLeft: mathTimeLeft, timedOut });
    }
}

function sendGameState() {
    const network = window.ArenaMultiplayer;
    if (network?.connected && network.role === 'host') {
        network.send({ type: 'state', active: state === 'play', settings: getQuizSettings(), question: currentMath, timeLeft: mathTimeLeft });
    }
}

function addTimeoutEnemy() {
    if (spawnEnemyGroup(wave || 1, 2) < 2) queuedTimeoutEnemies += 2;
}

function applyFailedAnswerPenalty(reason) {
    autoAttackQueue.length = 0;
    allyAttackCredits = 0;
    for (const fighter of [player, ...allies]) {
        if (fighter.dead) continue;
        fighter.commandQueue = [];
        fighter.commandTarget = null;
        fighter.attackT = 0;
        fighter.slashT = 0;
        fighter.spearT = 0;
        fighter.arrowT = 0;
        fighter.arrowSpawned = false;
        fighter.punchT = 0;
        fighter.kickT = 0;
        fighter.bombT = 0;
        fighter.hitDone = false;
        fighter.hp = Math.max(0, fighter.hp - 12);
        fighter.hitT = 0.3;
        if (fighter.hp <= 0) killFighter(fighter);
    }
    for (let i = bombs.length - 1; i >= 0; i--) {
        const bomb = bombs[i];
        if (bomb.owner === player || bomb.owner.team === 'hero') {
            scene.remove(bomb.mesh);
            bombs.splice(i, 1);
        }
    }
    showBanner(`${reason} · БААТРУУД -12 HP`);
}

function handleQuestionTimeout() {
    const network = window.ArenaMultiplayer;
    if (network?.connected && network.role === 'guest') {
        mathTimeLeft = 0;
        renderMathUI();
        return;
    }
    applyFailedAnswerPenalty('ХУГАЦАА ДУУССАН');
    if (state !== 'play') return;
    addTimeoutEnemy();
    generateMathQuestion();
    sendCurrentQuestion(true);
}

function installNetworkQuestion(message) {
    if (!message?.question || !Array.isArray(message.question.options)) return;
    currentMath = message.question;
    mathTimeLeft = Math.max(0, Math.min(getQuizSettings().seconds, Number(message.timeLeft) || getQuizSettings().seconds));
    renderMathUI();
}

/* Анги бүрийн ҮНДСЭН ЗЭВСЭГ — тулаанд үүнийгээ л голчлон ашиглана */
const HERO_WEAPON = {
    swordsman: 'slash',   /* сэлэм */
    barbarian: 'slash',   /* сүх */
    spearman: 'spear',    /* жад */
    bomber: 'bomb',       /* бөмбөг */
    archer: 'arrow'       /* нум */
};

function actionForHero(fighter) {
    const key = fighter.heroKey || currentHeroKey;
    const weapon = HERO_WEAPON[key] || 'slash';
    /* Тэнхээ хүрэх л бол зэвсгээ ашиглана */
    if ((fighter.stamina ?? 0) >= (heroAction(fighter, weapon).cost ?? 0)) {
        fighter.actionIndex = (fighter.actionIndex || 0) + 1;
        return weapon;
    }
    /* Тэнхээ дууссан үед л гар, хөлийн цохилт */
    const cycle = (fighter.profile?.actionCycle || getHeroProfile(key).actionCycle)
        .filter(a => a !== weapon);
    const action = cycle.length ? cycle[(fighter.actionIndex || 0) % cycle.length] : 'attack';
    fighter.actionIndex = (fighter.actionIndex || 0) + 1;
    return action;
}
function orderAllHeroesToAct() {
    for (const fighter of [player, ...allies]) {
        if (fighter.dead) continue;
        if (!Array.isArray(fighter.commandQueue)) fighter.commandQueue = [];
        /* Дараалал хуримтлагдахгүй — зайнаас гадуур байхад хуучин тушаал овоорохгүй */
        if (fighter.commandQueue.length >= 2) continue;
        fighter.commandQueue.push(actionForHero(fighter));
    }
}

function solveMath(chosen, fromRemote = false) {
    if (state !== 'play') return false;
    /* PvP: зочин дайсны талд — хариулт нь эзний талбайд нөлөөлнө */
    if (isPvpGuest() && !fromRemote) { pvpGuestAnswer(chosen === currentMath.answer); return true; }
    const solvedQuestionId = currentMath.id;
    if (chosen === currentMath.answer) {
        correctActionIndex++;
        correctHeroProgress++;
        if (correctHeroProgress >= 3) {
            correctHeroProgress = 0;
            queueHeroReward(true);
            showBanner('ЗӨВ! ШИНЭ БААТРАА СОНГО');
        } else showBanner('ЗӨВ! БААТАР ДОВТОЛЖ БАЙНА');
        orderAllHeroesToAct();
        playerPowerBoost = 1;
        boostTimer = 0;
        playWhoosh(1.8);
        spawnSparks(player.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xa855f7, 24);
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
            showBanner('3 АЛДАА · ШИНЭ БААТРАА СОНГО');
        }
    }
    updateMathProgress();
    generateMathQuestion();

    const network = window.ArenaMultiplayer;
    if (network?.connected) {
        if (!fromRemote) network.send({ type: 'answer', questionId: solvedQuestionId, answer: chosen });
        if (network.role === 'host') sendCurrentQuestion(false);
    }
    return true;
}
generateMathQuestion();

function applyHeroProfile(f, heroKey) {
    const profile = getHeroProfile(heroKey);
    f.heroKey = profile.key;
    f.profile = profile;
    f.maxHp = profile.hp;
    f.maxStamina = profile.stamina;
    f.staminaRegen = profile.staminaRegen;
    f.speed = profile.speed;
    f.damage = profile.damage;
    f.recovery = profile.recovery;
    return f;
}
function resetPlayer(f) {
    Object.assign(f, {
        hp: f.maxHp, stamina: f.maxStamina || 100, vel: new THREE.Vector3(),
        attackT: 0, slashT: 0, spearT: 0, arrowT: 0, arrowSpawned: false, punchT: 0, kickT: 0, bombT: 0, jumpT: 0, turnT: 0, dodgeT: 0,
        hitT: 0, cooldown: 0, dead: false, hitDone: false, commandQueue: [], commandTarget: null, actionIndex: 0,
        posY: 0, velY: 0, onGround: true
    });
}
function initFighterStats(f, maxHp) {
    if (!f.netId) f.netId = ++netIdSeq;
    f.maxHp = maxHp;
    resetPlayer(f);
}
applyHeroProfile(player, currentHeroKey);
initFighterStats(player, player.maxHp);
attachFighterHealthBar(player);

/* ═══════════ PvP ═══════════
   Эзэн (host) = БААТРЫН ТАЛ, зочин (guest) = ДАЙСНЫ ТАЛ.
   Тулааныг зөвхөн эзэн тооцоолж, байдлаа зочинд дамжуулна. */
const PVP_HZ = 15;                 /* секундэд хэдэн удаа байдлаа илгээх */
const PVP_LERP = 12;               /* зочин дээрх зөөлрүүлэлт */
const PVP_KEYS = ['swordsman', 'barbarian', 'spearman', 'bomber', 'archer',
                  'treant', 'cultist', 'goblin', 'golem'];
function netLink() { const n = window.ArenaMultiplayer; return (n && n.connected) ? n : null; }
function isPvpHost() { const n = netLink(); return !!n && n.role === 'host'; }
function isPvpGuest() { const n = netLink(); return !!n && n.role === 'guest'; }

/* Эзэн: талбайн бүх тулаанчийн байдлыг нягт хэлбэрээр илгээнэ */
function sendSnapshot() {
    const n = netLink();
    if (!n) return;
    const all = [player, ...allies, ...enemies];
    n.send({
        t: 'snap', w: wave,
        ht: Math.round(friendlyTower.hp), et: Math.round(enemyTower.hp),
        f: all.map(f => [
            f.netId || 0,
            PVP_KEYS.indexOf(f.weaponKey || 'swordsman'),
            f.team === 'enemy' ? 1 : 0,
            Math.round(f.group.position.x * 50),
            Math.round(f.group.position.z * 50),
            Math.round(f.group.rotation.y * 100),
            Math.round(Math.max(0, f.hp || 0)),
            Math.round(f.maxHp || 1),
            f.dead ? 1 : 0,
            Math.round((f.scale || 1) * 100)
        ])
    });
}

/* Зочин: ирсэн байдлаар талбайгаа дахин зохион байгуулна */
function applySnapshot(msg) {
    if (!Array.isArray(msg.f)) return;
    wave = msg.w || wave;
    friendlyTower.hp = msg.ht;
    enemyTower.hp = msg.et;
    const seen = new Set();
    for (const a of msg.f) {
        const [id, ki, foe, x50, z50, ry100, hp, maxHp, dead, sc100] = a;
        if (!id) continue;
        seen.add(id);
        const key = PVP_KEYS[ki] || 'swordsman';
        let f = netFighters.get(id);
        if (!f) {
            const scale = (sc100 || 100) / 100;
            if (foe) {
                const skin = ENEMY_SKIN[key] || ENEMY_SKIN.goblin;
                f = createFighter(skin.color, scale, key, skin);
                f.team = 'enemy';
            } else {
                f = createFighter(heroColor(key), scale, key);
                f.team = 'hero';
                applyHeroProfile(f, key);
            }
            f.netId = id;
            initFighterStats(f, maxHp || 100);
            attachFighterHealthBar(f);
            f.group.position.set(x50 / 50, 0, z50 / 50);
            scene.add(f.group);
            netFighters.set(id, f);
        }
        f.netX = x50 / 50;
        f.netZ = z50 / 50;
        f.netRy = ry100 / 100;
        f.maxHp = maxHp || f.maxHp;
        f.hp = hp;
        if (dead && !f.dead) { f.dead = true; f.deathT = 0; }
    }
    for (const [id, f] of [...netFighters]) {
        if (seen.has(id)) continue;
        scene.remove(f.group);
        disposeFighterHealthBar(f);
        netFighters.delete(id);
    }
    /* Камер, HUD хуучин массивуудыг хэрэглэдэг тул тэднийг дүүргэнэ */
    allies = [...netFighters.values()].filter(f => f.team !== 'enemy');
    enemies = [...netFighters.values()].filter(f => f.team === 'enemy');
}

/* Зочны нэг алхам — тооцоолол байхгүй, зөвхөн зөөлрүүлэлт ба бодлогын цаг */
function stepGuest(dt) {
    if (mathTimeLeft > 0) {
        mathTimeLeft = Math.max(0, mathTimeLeft - dt);
        if (mathTimeLeft <= 0) {
            const n = netLink();
            if (n) n.send({ t: 'pvp', ok: false });
            showBanner('ХУГАЦАА ДУУССАН · ДАЙСАН СУЛРАВ');
            generateMathQuestion();
        }
    }
    const k = Math.min(1, dt * PVP_LERP);
    for (const f of netFighters.values()) {
        if (f.netX === undefined) continue;
        const px = f.group.position.x;
        const pz = f.group.position.z;
        f.group.position.x += (f.netX - px) * k;
        f.group.position.z += (f.netZ - pz) * k;
        let dy = f.netRy - f.group.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        f.group.rotation.y += dy * k;
        /* Алхалтын анимац ажиллахын тулд хурдыг нь гаргана */
        const inv = 1 / Math.max(dt, 0.0001);
        f.vel.set((f.group.position.x - px) * inv, 0, (f.group.position.z - pz) * inv);
        if (f.dead) f.deathT += dt;
        updateFighterHealthBar(f);
    }
}

/* Зочин хариулахад — өөрийн талбайд биш, эзний талбайд нөлөөлнө */
function pvpGuestAnswer(correct) {
    const n = netLink();
    if (n) n.send({ t: 'pvp', ok: !!correct });
    showBanner(correct ? 'ЗӨВ! ДАЙСАН НЭМЭГДЛЭЭ' : 'АЛДАА · ДАЙСАН СУЛРАВ');
    generateMathQuestion();
}

/* Зочныг тулаан харах горимд оруулна */
function startPvpGuest() {
    if (pvpStarted) return;
    pvpStarted = true;
    $('overlay').style.display = 'none';
    state = 'play';
    player.group.visible = false;   /* зочинд өөрийн баатар байхгүй */
    player.dead = true;
    enemies = [];
    allies = [];
    $('e-name') && ($('e-name').textContent = '⚔ БААТРУУДЫН ЦАЙЗ');
    showBanner('ТА ДАЙСНЫ ТАЛД · ЗӨВ БОДОХ ТУТАМ ДАЙСАН НЭМЭГДЭНЭ');
    generateMathQuestion();
}

function fighterCountOnField() {
    return 1 + allies.length + enemies.length;
}

/* Дайсны тал — хар нүүрсэн их бие, нил ягаан нөмрөг, улайсан лаавын ан цав.
   color = их биеийн өнгө, glow = ялгарах лаав/шившлэг. */
const ENEMY_SKIN = {
    /* Хар нүүрс шиг бараан их бие (lift < 1), дотроос нь лаав улайна (glow). */
    /* Загварын ӨӨРИЙН текстурыг харуулна — холтос, хуяг, нүдний гялбаа нь
       тод гарна. tint бага = будахгүй, lift = зүгээр л цайруулж тодруулна. */
    treant:  { color: 0x8a5a2a, glow: 0xff6a1a, glowStrength: 0.22, tint: 0.06, lift: 1.7  },
    goblin:  { color: 0x9ad04a, glow: 0xc0ff50, glowStrength: 0.30, tint: 0.06, lift: 1.7  },
    cultist: { color: 0x8a4ad0, glow: 0xb070ff, glowStrength: 0.34, tint: 0.06, lift: 1.65 },
    golem:   { color: 0xff5a1e, glow: 0xff9a28, glowStrength: 0.55, tint: 0.06, lift: 1.55 }
};

function createEnemy(waveNumber, spawnX = 10.5, spawnZ = 0, bossSlot = waveNumber % 3 === 0) {
    if (fighterCountOnField() >= MAX_FIGHTERS) return null;
    const isBoss = bossSlot;
    const enemyKey = isBoss ? BOSS_KEY : ENEMY_KEYS[(waveNumber - 1) % ENEMY_KEYS.length];
    const skin = ENEMY_SKIN[enemyKey] || ENEMY_SKIN.goblin;
    const e = createFighter(skin.color, isBoss ? 1.3 : 1.1, enemyKey, skin);
    e.team = 'enemy';
    initFighterStats(e, (isBoss ? 210 : 140) + waveNumber * (isBoss ? 14 : 10));
    attachFighterHealthBar(e);
    e.speed = ((isBoss ? 2.2 : 2.7) + Math.min(waveNumber * 0.05, 0.55)) * 0.9;
    e.damage = 24 + Math.min(6, Math.floor(Math.max(0, waveNumber - 1) / 2) * 2) + (isBoss ? 8 : 0);
    e.think = 0.8;
    e.cooldown = Math.random() * 1.4;
    e.strafe = 1;
    e.enemyKey = enemyKey;
    e.enemyName = ENEMY_NAMES[enemyKey] || 'WARRIOR';
    e.group.position.set(Math.max(6, spawnX), 0, spawnZ);
    e.group.rotation.y = -Math.PI / 2;
    scene.add(e.group);
    enemies.push(e);
    return e;
}

function waveEnemyCount(waveNumber) {
    return Math.min(8, 2 + Math.floor((waveNumber - 1) / 2) * 2);
}

function spawnEnemyGroup(waveNumber, requestedCount) {
    const available = Math.max(0, MAX_FIGHTERS - fighterCountOnField());
    const count = Math.min(requestedCount, available - (available % 2));
    let spawned = 0;
    for (let i = 0; i < count; i++) {
        /* Даргын үед эхний нэг нь golem, бусад нь ТЭР ҮЕИЙН энгийн төрөл */
        const bossSlot = waveNumber % 3 === 0 && i === 0;
        const lane = i - (count - 1) / 2;
        if (createEnemy(waveNumber, 10.5 + Math.floor(i / 5) * 1.25, lane * 1.35, bossSlot)) spawned++;
    }
    return spawned;
}

function spawnPendingHeroes() {
    while (pendingHeroKeys.length && allies.length < MAX_FIGHTERS - 2 && fighterCountOnField() < MAX_FIGHTERS) {
        const selection = pendingHeroKeys.shift();
        const heroKey = selection.heroKey;
        const ally = createFighter(heroColor(heroKey, true), 0.92, heroKey);
        applyHeroProfile(ally, heroKey);
        initFighterStats(ally, ally.maxHp);
        attachFighterHealthBar(ally);
        ally.team = 'hero';
        ally.think = Math.random() * 0.3;
        ally.strafe = Math.random() < 0.5 ? -1 : 1;
        ally.actionIndex = 0;
        ally.commandQueue = [];
        ally.group.position.set(-7.3, 0, (allies.length % 3 - 1) * 1.15);
        ally.group.rotation.y = Math.PI / 2;
        scene.add(ally.group);
        allies.push(ally);
        if (selection.attackOnSpawn) ally.commandQueue.push(actionForHero(ally));
    }
    updateMathProgress();
}

function startWave() {
    wave++;
    reinforcementTimer = 30;
    waveClearRewarded = false;
    player.group.position.set(-6, 0, 0);
    player.group.rotation.y = Math.PI / 2;
    enemies = [];
    const spawned = spawnEnemyGroup(wave, waveEnemyCount(wave));
    currentEnemy = enemies[0] || null;

    const eNameEl = $('e-name');
    const roundEl = $('match-round');
    if (eNameEl) eNameEl.textContent = '💎 ДАЙСНЫ ЦАЙЗ';
    if (roundEl) roundEl.textContent = `ҮЕ ${wave}/${MAX_WAVE} · 30s`;

    showBanner(spawned ? `ҮЕ ${wave} · ${spawned} ДАЙСАН НЭГ ДОР!` : 'ТАЛБАЙ ДҮҮРЭН · ДАЙСАН ХҮЛЭЭНЭ');
    playWhoosh(1.5);
}

function spawnReinforcements() {
    if (wave < MAX_WAVE) wave++;   /* 10-р үе хамгийн дээд — цаашид зөвхөн хүч нэмэгдэнэ */
    const spawned = spawnEnemyGroup(wave, waveEnemyCount(wave));
    reinforcementTimer = 30;
    waveClearRewarded = false;
    showBanner(spawned
        ? wave % 3 === 0 ? `BOSS + ${spawned - 1} ДАЙСАН НЭГ ДОР!` : `${spawned} ДАЙСАН НЭГ ДОР ДОВТОЛЛОО!`
        : 'ТАЛБАЙ ДҮҮРЭН · ДАЙСАН ХҮЛЭЭНЭ');
    playWhoosh(1.3);
}

function showBanner(text) {
    $('banner').textContent = text;
    $('banner').style.opacity = 1;
    clearTimeout(showBanner.t);
    showBanner.t = setTimeout(() => ($('banner').style.opacity = 0), 1600);
}

function startGame() {
    const selectedHeroKey = window.__selectedHeroKey || 'swordsman';
    if (selectedHeroKey !== currentHeroKey) {
        scene.remove(player.group);
        disposeFighterHealthBar(player);
        currentHeroKey = selectedHeroKey;
        player = createFighter(heroColor(currentHeroKey), 1, currentHeroKey);
        applyHeroProfile(player, currentHeroKey);
        player.group.visible = true;
        scene.add(player.group);
        initFighterStats(player, player.maxHp);
        attachFighterHealthBar(player);
        player.team = 'hero';
    }
    enemies.forEach(e => { scene.remove(e.group); disposeFighterHealthBar(e); });
    allies.forEach(a => { scene.remove(a.group); disposeFighterHealthBar(a); });
    for (const bomb of bombs) scene.remove(bomb.mesh);
    bombs.length = 0;
    for (const arrow of arrows) scene.remove(arrow.mesh);
    arrows.length = 0;
    enemies = [];
    allies = [];
    pendingHeroKeys = [];
    pendingHeroChoices = 0;
    pendingHeroRewardAttacks = [];
    autoAttackTimer = 1.5;
    updateRecruitPanel();
    currentEnemy = null;
    wave = 0;
    score = 0;
    correctHeroProgress = 0;
    wrongHeroProgress = 0;
    correctActionIndex = 0;
    for (const tower of [friendlyTower, enemyTower]) {
        tower.hp = tower.maxHp;
        tower.dead = false;
        tower.collapseT = 0;
        tower.collapsed = false;
        tower.group.position.y = 0;
        tower.group.rotation.set(0, 0, 0);
        tower.hitT = 0;
        resetTowerMaterials(tower);
    }
    playerPowerBoost = 1.0;
    boostTimer = 0;
    autoAttackQueue = [];
    allyAttackCredits = 0;
    queuedTimeoutEnemies = 0;
    mathTimeLeft = getQuizSettings().seconds;
    resetPlayer(player);
    player.team = 'hero';
    player.group.position.set(-6, 0, 0);
    player.group.visible = true;
    state = 'play';
    $('math-panel').style.display = 'flex';
    generateMathQuestion();
    startWave();
    updateMathProgress();
    sendGameState();
    setStatus('Хөх чулуун цайз ба улаан болор цайзын төлөөх тулаан · 3D бэхлэлтүүд автоматаар ачаалагдана.');
}

function beginChallenge() {
    $('overlay').querySelector('h1').textContent = 'MATH MORTAL';
    $('overlay').style.display = 'none';
    $('play').textContent = 'БОДЛОГО ЭХЛҮҮЛЭХ';
    startGame();
}

// ---------- Quiz synchronization and pause/settings controls ----------
function pauseGame(reason = 'Түр зогслоо · үргэлжлүүлэх товч эсвэл Esc дарна уу.', fromRemote = false) {
    if (state !== 'play') return;
    state = 'paused';
    Object.keys(keys).forEach(code => keys[code] = false);
    resetMovePad();
    $('overlay').querySelector('h1').textContent = 'ТҮР ЗОГСЛОО';
    $('msg').textContent = reason;
    $('play').textContent = 'ҮРГЭЛЖЛҮҮЛЭХ';
    $('overlay').style.display = 'flex';
    setStatus('Түр зогслоо · үргэлжлүүлэхэд бодлогын хугацаа хадгалагдана.');
    if (!fromRemote && window.ArenaMultiplayer?.connected) window.ArenaMultiplayer.send({ type: 'pause' });
}
function resumeGame(fromRemote = false) {
    if (state !== 'paused') return;
    state = 'play';
    $('overlay').querySelector('h1').textContent = 'MATH MORTAL';
    $('overlay').style.display = 'none';
    setStatus('Тулаан үргэлжилж байна · зөв хариулт баатрын довтолгоог эхлүүлнэ.');
    if (!fromRemote && window.ArenaMultiplayer?.connected) {
        window.ArenaMultiplayer.send({ type: 'resume' });
        sendGameState();
    }
}
function toggleMute() {
    muted = !muted;
    if (muted) {
        music?.pause();
        if (hitSfx) hitSfx.pause();
    } else if (state === 'play') {
        initializeAudio();
        if (audioFallbackActive) startProceduralMusic();
        else music?.play().catch(() => audioWarning('Music file unavailable; using synthesized audio.'));
    }
    const button = $('music-toggle');
    if (button) {
        /* SVG дүрсийг дарахгүйн тулд зөвхөн бичгийн хэсгийг солино */
        const label = $('music-label');
        if (label) label.textContent = muted ? 'ДУУ ХААЛТТАЙ' : 'ДУУ АСААЛТТАЙ';
        else button.textContent = muted ? 'ДУУ ХААЛТТАЙ' : 'ДУУ АСААЛТТАЙ';
        button.setAttribute('aria-pressed', String(muted));
    }
    setStatus(muted ? 'Дуу хаалттай · M дарж асаана.' : 'Дуу асаалттай.');
}
$('play').onclick = () => {
    initializeAudio();
    if (state === 'paused') resumeGame();
    else beginChallenge();
};
$('pause-toggle')?.addEventListener('click', () => {
    if (state === 'play') pauseGame();
    else if (state === 'paused') resumeGame();
});
$('settings-toggle')?.addEventListener('click', () => {
    if (state === 'play') pauseGame('Тохиргоогоо өөрчлөхдөө тоглоом түр зогссон байна.');
    else $('overlay').style.display = 'flex';
});
$('music-toggle')?.addEventListener('click', toggleMute);
/* Сан ачаалагдмагц дотоод генератораар гарсан бодлогыг жинхэнэ бодлогоор солино */
window.addEventListener('arena:pool-ready', () => {
    if (state === 'play' && currentMath && currentMath.local) generateMathQuestion();
}, { signal: gameEvents.signal });
window.addEventListener('arena:settings-changed', () => {
    const network = window.ArenaMultiplayer;
    if (network?.connected && network.role === 'guest') return;
    if (state === 'play' || state === 'paused') generateMathQuestion();
    if (network?.connected && network.role === 'host') sendGameState();
}, { signal: gameEvents.signal });
window.addEventListener('arena:peer-connected', () => {
    if (window.ArenaMultiplayer?.role === 'host') sendGameState();
}, { signal: gameEvents.signal });
window.addEventListener('arena:network-message', event => {
    const message = event.detail;
    const network = window.ArenaMultiplayer;
    if (!message || !network?.connected) return;
    /* ── PvP мессежүүд ── */
    if (message.t === 'snap' && isPvpGuest()) {
        if (!pvpStarted) startPvpGuest();
        applySnapshot(message);
        return;
    }
    if (message.t === 'pvp' && isPvpHost() && state === 'play') {
        if (message.ok) {
            const spawned = spawnEnemyGroup(wave || 1, 2);
            if (spawned < 2) queuedTimeoutEnemies += 2;
            showBanner('ӨРСӨЛДӨГЧ ЗӨВ БОДЛОО · ДАЙСАН НЭМЭГДЛЭЭ');
            playWhoosh(0.8);
        } else {
            for (const e of enemies) if (!e.dead) e.hp = Math.max(1, e.hp - 14);
            showBanner('ӨРСӨЛДӨГЧ АЛДЛАА · ДАЙСАН СУЛРАВ');
        }
        return;
    }
    if (message.t === 'end' && isPvpGuest()) {
        state = 'over';
        $('overlay').querySelector('h1').textContent = message.won ? 'GAME OVER' : 'VICTORY!';
        $('msg').textContent = message.won
            ? 'Өрсөлдөгч дайсны цайзыг нураалаа. Та хожигдлоо.'
            : 'Баатруудын цайз нурлаа! Та яллаа.';
        $('play').style.display = 'none';
        $('overlay').style.display = 'flex';
        return;
    }
    if (message.type === 'request-state' && network.role === 'host') {
        sendGameState();
    } else if (message.type === 'pause') {
        pauseGame(undefined, true);
    } else if (message.type === 'resume') {
        resumeGame(true);
    }
}, { signal: gameEvents.signal });
document.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
        event.preventDefault();
        if (state === 'play') pauseGame();
        else if (state === 'paused') resumeGame();
        return;
    }
    if (event.code === 'KeyM') toggleMute();
}, { signal: gameEvents.signal });

const gameCanvas = renderer.domElement;
gameCanvas.style.touchAction = 'none';
/* Дэлгэц дээр чирэхэд камер хажуу тийш харна; тавихад тулаан руугаа буцна */
gameCanvas.addEventListener('pointerdown', event => {
    camPanPointer = { id: event.pointerId, x: event.clientX };
}, { signal: gameEvents.signal });
gameCanvas.addEventListener('pointermove', event => {
    if (!camPanPointer || event.pointerId !== camPanPointer.id) return;
    const dx = event.clientX - camPanPointer.x;
    camPanPointer.x = event.clientX;
    camPan = THREE.MathUtils.clamp(camPan - dx * 0.04, -CAM_PAN_LIMIT, CAM_PAN_LIMIT);
    camPanIdle = 0;
}, { signal: gameEvents.signal });
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    gameCanvas.addEventListener(type, () => { camPanPointer = null; camPanIdle = 0; },
        { signal: gameEvents.signal });
}
gameCanvas.addEventListener('contextmenu', event => event.preventDefault(), { signal: gameEvents.signal });

// ---------- Combat ----------
function fighterIsBusy(f) {
    return f.attackT > 0 || f.slashT > 0 || f.spearT > 0 || f.arrowT > 0 || f.punchT > 0 || f.kickT > 0 || f.bombT > 0 || f.dodgeT > 0 || f.hitT > 0 || f.cooldown > 0 || f.dead;
}
function spendActionStamina(f, action) {
    const cost = heroAction(f, action).cost ?? 0;
    if (f.stamina < cost) return false;
    f.stamina -= cost;
    return true;
}
function tryAttack(f) {
    if (fighterIsBusy(f)) return false;
    f.attackT = heroAction(f, 'basic').duration ?? 0.45;
    f.hitDone = false;
    playWhoosh(f === player ? 1 : 0.7);
    return true;
}
function trySlash(f) {
    const profile = heroAction(f, 'slash');
    if (fighterIsBusy(f) || !spendActionStamina(f, 'slash')) return false;
    f.slashT = profile.duration ?? 0.55;
    f.hitDone = false;
    playWhoosh(0.85);
    return true;
}
function trySpear(f) {
    const profile = heroAction(f, 'spear');
    if (fighterIsBusy(f) || !spendActionStamina(f, 'spear')) return false;
    f.spearT = profile.duration ?? 0.5;
    f.hitDone = false;
    playWhoosh(1.05);
    return true;
}
function tryArrow(f) {
    const profile = heroAction(f, 'arrow');
    if (fighterIsBusy(f) || !spendActionStamina(f, 'arrow')) return false;
    f.arrowT = profile.duration ?? 0.46;
    f.arrowSpawned = false;
    f.cooldown = profile.cooldown ?? 0.68;
    playWhoosh(1.45);
    return true;
}
function tryPunch(f) {
    const profile = heroAction(f, 'punch');
    if (fighterIsBusy(f) || !spendActionStamina(f, 'punch')) return false;
    f.punchT = profile.duration ?? 0.4;
    f.hitDone = false;
    playWhoosh(1.2);
    return true;
}
function tryKick(f) {
    const profile = heroAction(f, 'kick');
    if (fighterIsBusy(f) || !spendActionStamina(f, 'kick')) return false;
    f.kickT = profile.duration ?? 0.48;
    f.hitDone = false;
    playWhoosh(0.95);
    return true;
}
function tryJump(f) {
    if (!f.onGround || f.dodgeT > 0 || f.dead || f.stamina < 12) return;
    f.stamina -= 12;
    f.velY = 9.5;
    f.onGround = false;
    f.jumpT = 0.5;
    playWhoosh(1.5);
}
function tryTurn180(f) {
    if (f.turnT > 0 || f.dead) return;
    f.turnT = 0.35;
    yaw += Math.PI;
    f.group.rotation.y += Math.PI;
    playWhoosh(1.6);
}
function tryDodge(f, dir) {
    if (f.dodgeT > 0 || f.stamina < 25 || f.dead) return;
    if (dir.lengthSq() < 0.01) dir = new THREE.Vector3(Math.sin(f.group.rotation.y), 0, Math.cos(f.group.rotation.y)).negate();
    f.stamina -= 25;
    f.dodgeT = 0.35;
    f.attackT = 0;
    f.slashT = 0;
    f.spearT = 0;
    f.punchT = 0;
    f.kickT = 0;
    f.bombT = 0;
    f.arrowT = 0;
    f.arrowSpawned = false;
    f.vel.copy(dir).setLength(11);
}
function finishMatch(won, defeatReason = 'tower') {
    if (state === 'over') return;
    state = 'over';
    updateRecruitPanel();
    if (typeof document.exitPointerLock === 'function') document.exitPointerLock();
    $('overlay').querySelector('h1').textContent = won ? 'VICTORY!' : 'GAME OVER';
    $('msg').textContent = won
        ? (defeatReason === 'cleared'
            ? `БҮХ 10 ҮЕ ДУУСЛАА! Оноо ${score}`
            : `Дайсны болор цайз нурав! ҮЕ ${wave}/${MAX_WAVE} · Оноо ${score}`)
        : defeatReason === 'heroes'
            ? `Танай багт амьд баатар үлдсэнгүй. ҮЕ ${wave}/${MAX_WAVE} · Оноо ${score}`
            : `Танай чулуун цайз нурлаа. ҮЕ ${wave}/${MAX_WAVE} · Оноо ${score}`;
    $('play').style.display = '';
    $('play').textContent = 'ДАХИН ТУЛАЛДАХ';
    $('overlay').style.display = 'flex';
    /* Хүрсэн ҮЕ (1–10) + оноог шилдэгийн хүснэгтэд бүртгэнэ */
    const reached = Math.max(1, Math.min(MAX_WAVE, wave || 1));
    const lvlEl = $('lb-reached');
    if (lvlEl) lvlEl.textContent = `Та ҮЕ ${reached}/${MAX_WAVE} хүртэл явлаа · ${score} оноо`;
    lbSubmit(reached, score);
    if (isPvpHost()) { const n = netLink(); if (n) n.send({ t: 'end', won: !!won }); }
    sendGameState();
}
function damageTower(tower, amount, attacker) {
    if (!tower || tower.hp <= 0) return;
    const heroAttack = attacker === player || attacker.team === 'hero';
    if ((tower.team === 'enemy') !== heroAttack) return;
    // Each enemy hit removes a fixed 2 HP from the friendly keep in every wave.
    const friendlyKeepDamage = 2;
    const towerDamage = tower.team === 'hero' ? friendlyKeepDamage : amount / 12;
    tower.hp = Math.max(0, tower.hp - towerDamage);
    tower.hitT = 0.24;
    setTowerHitGlow(tower, true);
    spawnSparks(tower.position.clone().add(new THREE.Vector3(0, 2.8, 0)), tower.team === 'enemy' ? 0xff6544 : 0x75caff, 10);
    playHit();
    shake = 0.18;
    if (tower.hp <= 0) {
        tower.dead = true;
        tower.collapseT = 0;
        tower.collapsed = false;
        showBanner(tower.team === 'enemy' ? 'ДАЙСНЫ БОЛОР ЦАЙЗ НУРЛА!' : 'ТАНАЙ ЧУЛУУН ЦАЙЗ НУРЛА!');
        spawnSparks(tower.position.clone().add(new THREE.Vector3(0, 3, 0)), tower.team === 'enemy' ? 0xff6544 : 0x75caff, 34);
    }
}
function updateTowerCollapse(dt) {
    for (const tower of [friendlyTower, enemyTower]) {
        if (tower.hitT > 0) {
            tower.hitT = Math.max(0, tower.hitT - dt);
            if (tower.hitT === 0) setTowerHitGlow(tower, false);
        }
        if (!tower.dead || tower.collapsed) continue;
        tower.collapseT = Math.min(1.1, tower.collapseT + dt);
        const progress = THREE.MathUtils.clamp(tower.collapseT / 1.1, 0, 1);
        const eased = 1 - (1 - progress) * (1 - progress);
        tower.group.rotation.z = (tower.team === 'hero' ? 1 : -1) * eased * 1.35;
        if (progress >= 1) {
            tower.collapsed = true;
            finishMatch(tower.team === 'enemy');
            return;
        }
    }
}
function resolveAttack(attacker, targets, damage, range) {
    const isHero = attacker === player || attacker.team === 'hero';
    const finalDamage = isHero ? damage * playerPowerBoost : 2;

    for (const t of targets) {
        if (t.dead || t.dodgeT > 0) continue;
        const to = t.group.position.clone().sub(attacker.group.position);
        to.y = 0;
        const d = to.length();
        if (d > range * attacker.scale) continue;

        const guardScale = t === player && keys.KeyX ? 0.28 : 1;
        const appliedDamage = finalDamage * guardScale;
        t.hp -= appliedDamage;
        t.hitT = 0.3;
        t.attackT = 0;
        t.slashT = 0;
        t.spearT = 0;
        t.punchT = 0;
        t.kickT = 0;
        
        // Push opponent back along X axis
        const pushDir = Math.sign(t.group.position.x - attacker.group.position.x) || 1;
        t.vel.x = pushDir * (t === player ? 7 : 9);
        
        const at = t.group.position.clone();
        at.y = 1.2 * t.scale;
        spawnSparks(at, isHero ? 0xffdd44 : 0xff3030, 15);
        spawnBlood(at, 5);
        playHit();
        shake = t === player ? 0.35 : 0.2;
        hitStop = 0.05;
        if (t.hp <= 0) killFighter(t);
    }
    if (isHero && attacker.commandTarget === enemyTower) {
        const towerDistance = Math.max(0, enemyTower.position.distanceTo(attacker.group.position) - 0.55);
        if (towerDistance <= range * attacker.scale + 0.35) damageTower(enemyTower, finalDamage, attacker);
    } else if (!isHero && attacker.siegeTarget === friendlyTower) {
        const towerDistance = Math.max(0, friendlyTower.position.distanceTo(attacker.group.position) - 0.55);
        if (towerDistance <= range * attacker.scale + 0.45) damageTower(friendlyTower, finalDamage, attacker);
    }
}
function killFighter(f) {
    f.dead = true;
    f.deathT = 0;
    if (f === player || f.team === 'hero') {
        const survivors = [player, ...allies].some(hero => !hero.dead);
        if (!survivors) showBanner('БҮХ БААТАР УНАВ · ЦАМХГАА ХАМГААЛ!');
        else if (f === player) showBanner('БААТАР УНАВ · БАГ ҮРГЭЛЖЛҮҮЛНЭ');
    } else {
        if (f.team === 'enemy') score += 100 * wave;
        spawnSparks(f.group.position.clone().setY(1), 0xffffff, 24);
    }
}

// ---------- Update ----------
function updateFighterPhysics(f, desired, dt) {
    if (f.dodgeT > 0 || f.hitT > 0) {
        f.vel.multiplyScalar(Math.pow(0.02, dt));
    } else {
        f.vel.lerp(desired, Math.min(1, dt * 12));
    }
    f.group.position.addScaledVector(f.vel, dt);

    // Vertical physics (jump and gravity)
    if (!f.onGround) {
        f.velY = (f.velY || 0) - 24 * dt;
        f.posY = (f.posY || 0) + f.velY * dt;
        if (f.posY <= 0) {
            f.posY = 0;
            f.velY = 0;
            f.onGround = true;
        }
    } else {
        f.posY = 0;
    }
    f.group.position.y = f.posY || 0;

    const p = f.group.position;
    const maxR = ARENA_R - 0.5;
    const r = Math.hypot(p.x, p.z);
    if (r > maxR) {
        p.x = (p.x / r) * maxR;
        p.z = (p.z / r) * maxR;
    }
    keepOutsideTowers(f);
    f.dodgeT = Math.max(0, f.dodgeT - dt);
    f.hitT = Math.max(0, f.hitT - dt);
    f.jumpT = Math.max(0, (f.jumpT || 0) - dt);
    f.turnT = Math.max(0, (f.turnT || 0) - dt);
    f.bombT = Math.max(0, (f.bombT || 0) - dt);
    f.arrowT = Math.max(0, (f.arrowT || 0) - dt);
    f.cooldown = Math.max(0, f.cooldown - dt);
    f.stamina = Math.min(f.maxStamina || 100, f.stamina + dt * (f.staminaRegen ?? 18));
}

function faceToward(f, dir, dt, rate = 14) {
    if (dir.lengthSq() < 0.001) return;
    const target = Math.atan2(dir.x, dir.z);
    let diff = target - f.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    f.group.rotation.y += diff * Math.min(1, dt * rate);
}

function stepAttack(f, targets, damage, dt) {
    const recovery = f.team === 'enemy'
        ? 1.5 + Math.random() * 0.7
        : f.recovery ?? 0.7;
    const resolveClassAttack = (action, multiplier, range) => {
        const profile = heroAction(f, action);
        const isHero = f === player || f.team === 'hero';
        resolveAttack(f, targets, damage * (isHero ? (profile.mult ?? multiplier) : multiplier), isHero ? profile.range : range);
    };
    if (f.attackT > 0) {
        f.attackT -= dt;
        if (!f.hitDone && f.attackT < 0.25) {
            f.hitDone = true;
            resolveClassAttack('basic', 1, 2.4);
        }
        if (f.attackT <= 0) f.cooldown = recovery;
    }
    if (f.slashT > 0) {
        f.slashT -= dt;
        if (!f.hitDone && f.slashT < 0.3) {
            f.hitDone = true;
            resolveClassAttack('slash', 1.15, 2.8);
        }
        if (f.slashT <= 0) f.cooldown = recovery;
    }
    if (f.spearT > 0) {
        f.spearT -= dt;
        if (!f.hitDone && f.spearT < 0.27) {
            f.hitDone = true;
            resolveClassAttack('spear', 1.35, 3.5);
        }
        if (f.spearT <= 0) f.cooldown = recovery;
    }
    if (f.punchT > 0) {
        f.punchT -= dt;
        if (!f.hitDone && f.punchT < 0.22) {
            f.hitDone = true;
            resolveClassAttack('punch', 0.6, 2.0);
        }
        if (f.punchT <= 0) f.cooldown = recovery;
    }
    if (f.kickT > 0) {
        f.kickT -= dt;
        if (!f.hitDone && f.kickT < 0.28) {
            f.hitDone = true;
            resolveClassAttack('kick', 0.8, 2.5);
        }
        if (f.kickT <= 0) f.cooldown = recovery;
    }
}

function actionRange(action, fighter) {
    if (fighter?.profile) return heroAction(fighter, action).range ?? fighter.profile.preferredRange;
    return action === 'arrow' ? 9.5 : action === 'bomb' ? 9 : action === 'spear' ? 3.5 : action === 'slash' ? 2.8 : action === 'kick' ? 2.5 : action === 'punch' ? 2 : 2.4;
}
function startAction(f, action) {
    if (action === 'arrow') return tryArrow(f);
    if (action === 'bomb') return throwBomb(f);
    if (action === 'spear') return trySpear(f);
    if (action === 'slash') return trySlash(f);
    if (action === 'kick') return tryKick(f);
    if (action === 'punch') return tryPunch(f);
    return tryAttack(f);
}
function nearestLivingEnemy(position) {
    return enemies.filter(enemy => !enemy.dead).reduce((closest, enemy) =>
        !closest || enemy.group.position.distanceToSquared(position) < closest.group.position.distanceToSquared(position) ? enemy : closest, null);
}
function keepOutsideTowers(fighter) {
    const p = fighter.group.position;
    for (const tower of [friendlyTower, enemyTower]) {
        const dx = p.x - tower.position.x;
        const dz = p.z - tower.position.z;
        const distance = Math.hypot(dx, dz);
        const minimumDistance = 2.15 + 0.62 * fighter.scale;
        if (distance >= minimumDistance) continue;
        if (distance <= 0.001) {
            p.x = tower.position.x + (tower.team === 'hero' ? minimumDistance : -minimumDistance);
            p.z = tower.position.z;
        } else {
            p.x = tower.position.x + dx / distance * minimumDistance;
            p.z = tower.position.z + dz / distance * minimumDistance;
        }
    }
}
function towerApproachPoint(tower, fighter) {
    const offset = tower.team === 'enemy' ? -2.85 : 2.85;
    return new THREE.Vector3(tower.position.x + offset, 0, THREE.MathUtils.clamp(fighter.group.position.z, -1.8, 1.8));
}
function updateHero(fighter, dt) {
    if (fighter.dead) return;
    fighter.body.scale.setScalar(fighter.scale);
    const enemyTarget = nearestLivingEnemy(fighter.group.position);
    const target = enemyTarget || enemyTower;
    const targetPos = enemyTarget ? enemyTarget.group.position : towerApproachPoint(enemyTower, fighter);
    const to = targetPos.clone().sub(fighter.group.position).setY(0);
    const dist = to.length();
    const queuedAction = fighter.commandQueue?.[0];
    const preferredRange = queuedAction
        ? actionRange(queuedAction, fighter) * fighter.scale
        : (fighter.profile?.preferredRange ?? 2.5) * fighter.scale;
    const desired = new THREE.Vector3();
    if (dist > preferredRange * 0.84 && dist > 0.001) desired.copy(to).setLength(fighter.speed || 4);
    updateFighterPhysics(fighter, desired, dt);
    if (fighter.arrowT > 0 && !fighter.arrowSpawned && fighter.arrowT < 0.24) {
        fighter.arrowSpawned = true;
        shootArrow(fighter);
    }
    faceToward(fighter, to, dt, 11);
    fighter.target = enemyTarget;
    stepAttack(fighter, enemies, fighter.damage || 30, dt);
    if (queuedAction && !fighterIsBusy(fighter)) {
        const targetDistance = enemyTarget
            ? enemyTarget.group.position.distanceTo(fighter.group.position)
            : Math.max(0, enemyTower.position.distanceTo(fighter.group.position) - 0.55);
        const staminaCost = heroAction(fighter, queuedAction).cost ?? 0;
        if (targetDistance <= actionRange(queuedAction, fighter) * fighter.scale && fighter.stamina >= staminaCost) {
            fighter.commandTarget = target;
            if (startAction(fighter, queuedAction)) fighter.commandQueue.shift();
        }
    }
}
function updatePlayer(dt) { updateHero(player, dt); }
function updateAlly(ally, dt) { updateHero(ally, dt); }

function updateEnemy(e, dt) {
    const heroTargets = [player, ...allies].filter(f => !f.dead);
    const closestHero = heroTargets.reduce((closest, fighter) =>
        !closest || fighter.group.position.distanceToSquared(e.group.position) < closest.group.position.distanceToSquared(e.group.position) ? fighter : closest, null);
    const heroDist = closestHero ? closestHero.group.position.distanceTo(e.group.position) : Infinity;
    const target = closestHero && heroDist < 5.5 ? closestHero : friendlyTower;
    const towerTarget = target === friendlyTower;
    const targetPos = towerTarget ? towerApproachPoint(friendlyTower, e) : target.group.position;
    const to = targetPos.clone().sub(e.group.position).setY(0);
    const dist = to.length();
    const desired = new THREE.Vector3();
    e.think -= dt;
    if (e.think <= 0) {
        e.think = 0.8 + Math.random() * 0.55;
        if (!towerTarget && target.attackT > 0.1 && dist < 3.2 && Math.random() < 0.16) {
            tryDodge(e, new THREE.Vector3(e.group.position.x > target.group.position.x ? 1 : -1, 0, 0));
        }
    }
    const reach = towerTarget ? 2.5 * e.scale : 1.7 * e.scale;
    if (e.attackT <= 0 && e.slashT <= 0 && e.spearT <= 0 && e.punchT <= 0 && e.hitT <= 0) {
        if (dist > reach) {
            if (dist > 0.001) desired.copy(to).setLength(e.speed);
        } else if (e.cooldown <= 0) {
            if (towerTarget) e.siegeTarget = friendlyTower;
            const r = Math.random();
            if (r < 0.5) tryAttack(e);
            else if (r < 0.8) trySlash(e);
            else tryPunch(e);
        }
    }
    updateFighterPhysics(e, desired, dt);
    faceToward(e, to, dt, 14);
    if (!towerTarget) e.siegeTarget = null;
    stepAttack(e, towerTarget ? [] : [target], e.damage, dt);
}

function separateFighters() {
    const all = [player, ...allies, ...enemies].filter(f => !f.dead);
    for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
            const a = all[i].group.position;
            const b = all[j].group.position;
            const minD = 0.55 * (all[i].scale + all[j].scale);
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const d = Math.hypot(dx, dz) || 0.001;
            if (d < minD) {
                const push = (minD - d) / 2;
                a.x -= (dx / d) * push;
                a.z -= (dz / d) * push;
                b.x += (dx / d) * push;
                b.z += (dz / d) * push;
            }
        }
    }
    for (const fighter of all) keepOutsideTowers(fighter);
}

function updateGame(dt) {
    updateTowerCollapse(dt);
    if (state !== 'play') return;
    /* Тулаан автоматаар — баатрууд 1.5с тутамд зэвсгээ далайна.
       Тэнхээ, хүлээлт, зай нь өөрөө хязгаарлах тул хэт олон болохгүй. */
    autoAttackTimer -= dt;
    if (autoAttackTimer <= 0) {
        orderAllHeroesToAct();
        autoAttackTimer = 1.5;
    }
    if (mathTimeLeft > 0) {
        mathTimeLeft = Math.max(0, mathTimeLeft - dt);
        if (mathTimeLeft <= 0) handleQuestionTimeout();
    }
    if (boostTimer > 0) {
        boostTimer -= dt;
        if (boostTimer <= 0) playerPowerBoost = 1.0;
    }

    reinforcementTimer -= dt;
    if (reinforcementTimer <= 0) spawnReinforcements();

    let nearest = null;
    let nearestDistanceSq = Infinity;
    for (const e of enemies) {
        if (e.dead) continue;
        const distanceSq = e.group.position.distanceToSquared(player.group.position);
        if (distanceSq < nearestDistanceSq) {
            nearest = e;
            nearestDistanceSq = distanceSq;
        }
    }
    currentEnemy = nearest;
    updatePlayer(dt);
    allies.forEach(a => !a.dead && updateAlly(a, dt));
    enemies.forEach(e => !e.dead && updateEnemy(e, dt));
    separateFighters();
    for (const fighter of [...enemies, ...allies]) {
        if (fighter.dead) {
            fighter.deathT += dt;
            if (fighter.deathT > 1.2) scene.remove(fighter.group);
        }
    }
    for (const fighter of [...enemies, ...allies]) {
        if (fighter.dead && fighter.deathT > 1.2) disposeFighterHealthBar(fighter);
    }
    enemies = enemies.filter(e => !e.dead || e.deathT <= 1.2);
    allies = allies.filter(a => !a.dead || a.deathT <= 1.2);
    spawnPendingHeroes();
    while (queuedTimeoutEnemies >= 2 && fighterCountOnField() <= MAX_FIGHTERS - 2) {
        const spawned = spawnEnemyGroup(wave || 1, 2);
        if (spawned < 2) break;
        queuedTimeoutEnemies -= spawned;
    }
    if (state === 'play' && enemies.length === 0 && !waveClearRewarded) {
        player.hp = Math.min(player.maxHp, player.hp + 40);
        score += 500 * wave;
        waveClearRewarded = true;
        if (wave >= MAX_WAVE) { finishMatch(true, 'cleared'); return; }
        showBanner(`ҮЕ ${wave}/${MAX_WAVE} ДУУСЛАА · ДАРААГИЙНХ 30s`);
    }
}

/* Камер тулааны ДЭРГЭД зогсоно. Тоглогчийг биш, тулаан болж буй ГАЗРЫГ дагана:
   баатруудын хамгийн урд нэгэн ба дайсны хамгийн урд нэгний дунд цэг. */
const CAM_NEAR_RANGE = 10;    /* фронтоос энэ зайд байгаа тулаанчдыг тооцно */
const CAM_MIN_DIST = 10;      /* хамгийн ойр */
const CAM_MAX_DIST = 21;      /* хамгийн хол */
const CAM_PAN_LIMIT = 13;     /* гараар хажуу тийш харах дээд зай */

let camPan = 0;        /* чирж харсан хэвтээ шилжилт */
let camPanIdle = 0;    /* сүүлд чирснээс хойшхи хугацаа */
let camPanPointer = null;

/* Тулааны фронт — хаана зодоон болж байна */
function combatFrontX() {
    const living = [player, ...allies, ...enemies].filter(f => !f.dead);
    const heroes = living.filter(f => f.team !== 'enemy');
    const foes = living.filter(f => f.team === 'enemy');
    const avg = list => list.reduce((a, f) => a + f.group.position.x, 0) / list.length;
    if (!foes.length) return heroes.length ? avg(heroes) : 0;
    if (!heroes.length) return avg(foes);
    const heroFront = Math.max(...heroes.map(f => f.group.position.x));
    const foeFront = Math.min(...foes.map(f => f.group.position.x));
    /* Хоёр тал ойрхон бол зодооны дунд цэг. Хол байвал дундуур нь харвал
       хоосон талбай харагдана — тиймээс баатрынхаа урдуур дагана. */
    return heroFront + Math.min((foeFront - heroFront) * 0.5, 2.5);
}

function updateCamera(dt) {
    /* Чирээгүй бол аажмаар тулаан руугаа эргэнэ */
    if (!camPanPointer) {
        camPanIdle += dt;
        if (camPanIdle > 1.6) camPan = THREE.MathUtils.lerp(camPan, 0, Math.min(1, dt * 1.8));
    }
    const px = combatFrontX() + camPan;
    const activeFighters = [player, ...allies, ...enemies].filter(fighter =>
        !fighter.dead && Math.abs(fighter.group.position.x - px) <= CAM_NEAR_RANGE);
    let minX = px - 3.6;
    let maxX = px + 3.6;
    let minZ = -1.2;
    let maxZ = 1.2;
    let maxY = 4.4;
    for (const fighter of activeFighters) {
        const radius = 0.8 * fighter.scale;
        minX = Math.min(minX, fighter.group.position.x - radius);
        maxX = Math.max(maxX, fighter.group.position.x + radius);
        minZ = Math.min(minZ, fighter.group.position.z - radius);
        maxZ = Math.max(maxZ, fighter.group.position.z + radius);
        maxY = Math.max(maxY, fighter.group.position.y + 2.5 * fighter.scale);
    }

    /* Камер талбайн гадна гарахгүй */
    const edge = enemyTower.position.x - 3.5;
    const targetX = THREE.MathUtils.clamp((minX + maxX) * 0.5, -edge, edge);
    const targetZ = THREE.MathUtils.clamp((minZ + maxZ) * 0.5, -2, 2);
    const target = new THREE.Vector3(targetX, 1.45, targetZ);
    const pitch = 0.16;
    const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
    const halfWidth = (maxX - minX) * 0.5 + 0.9;
    const projectedHeight = (maxY * Math.cos(pitch)) + (maxZ - minZ) * Math.sin(pitch) + 0.9;
    const widthDistance = halfWidth / Math.tan(horizontalHalfFov);
    const heightDistance = projectedHeight * 0.5 / Math.tan(verticalHalfFov);
    const distance = THREE.MathUtils.clamp(
        Math.max(widthDistance, heightDistance), CAM_MIN_DIST, CAM_MAX_DIST);
    const desiredPosition = new THREE.Vector3(
        target.x,
        target.y + Math.sin(pitch) * distance,
        target.z + Math.cos(pitch) * distance
    );
    const blend = Math.min(1, dt * 3.5);
    camera.position.lerp(desiredPosition, blend);
    const smoothTarget = camera.userData.lookTarget || (camera.userData.lookTarget = target.clone());
    smoothTarget.lerp(target, blend);

    if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.35;
        camera.position.y += (Math.random() - 0.5) * shake * 0.35;
        shake = Math.max(0, shake - dt * 1.5);
    }
    camera.lookAt(smoothTarget);
}

function updateHud() {
    const timerEl = $('math-timer');
    if (timerEl) {
        timerEl.textContent = `${Math.max(0, Math.ceil(mathTimeLeft))}s`;
        timerEl.classList.toggle('urgent', mathTimeLeft <= 5);
    }
    const pHpEl = $('p-hp');
    const eHpEl = $('e-hp');
    if (pHpEl) pHpEl.style.width = `${Math.max(0, friendlyTower.hp / friendlyTower.maxHp) * 100}%`;
    if (eHpEl) eHpEl.style.width = `${Math.max(0, enemyTower.hp / enemyTower.maxHp) * 100}%`;
    const friendlyNameEl = $('p-name');
    const enemyNameEl = $('e-name');
    if (friendlyNameEl) friendlyNameEl.textContent = `🏰 БААТРУУДЫН ЦАЙЗ · ${Math.ceil(friendlyTower.hp)}%`;
    if (enemyNameEl) enemyNameEl.textContent = `💎 ДАЙСНЫ ЦАЙЗ · ${Math.ceil(enemyTower.hp)}%`;
    for (const fighter of [player, ...allies, ...enemies]) updateFighterHealthBar(fighter);
    updateMathProgress();
    const roundEl = $('match-round');
    if (roundEl && state === 'play') roundEl.textContent = `ҮЕ ${wave}/${MAX_WAVE} · ${Math.ceil(reinforcementTimer)}s`;

    const badge = $('boost-badge');
    if (badge) {
        if (boostTimer > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = `⚡ x${playerPowerBoost.toFixed(1)} POWER (${Math.ceil(boostTimer)}s)`;
        } else {
            badge.style.display = 'none';
        }
    }
}

// ---------- Draggable movement pad and icon-only touch actions ----------
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
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width * 0.31;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    touchMoveX = x / radius;
    touchMoveY = y / radius;
    if (Math.hypot(touchMoveX, touchMoveY) < 0.13) touchMoveX = touchMoveY = 0;
    moveStick.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}
movePad?.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
    movePointerId = event.pointerId;
    try { movePad.setPointerCapture(event.pointerId); } catch { /* Capture is optional. */ }
    updateMovePad(event);
}, { signal: gameEvents.signal });
movePad?.addEventListener('pointermove', event => {
    if (event.pointerId === movePointerId) {
        event.preventDefault();
        updateMovePad(event);
    }
}, { signal: gameEvents.signal });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    movePad?.addEventListener(type, event => {
        if (event.pointerId === movePointerId) resetMovePad();
    }, { signal: gameEvents.signal });
}

const heldActionKeys = { crouch: 'KeyV', guard: 'KeyX' };
function runTouchAction(action) {
    if (state !== 'play') return;
    if (action === 'jump') tryJump(player);
    else if (action === 'punch') tryPunch(player);
    else if (action === 'kick') tryKick(player);
    else if (action === 'slash') trySlash(player);
    else if (action === 'dodge') tryDodge(player, moveInput());
}
document.querySelectorAll('.fight-btn').forEach(btn => {
    const action = btn.dataset.action;
    const release = () => {
        btn.classList.remove('pressed');
        const key = heldActionKeys[action];
        if (key) keys[key] = false;
    };
    btn.addEventListener('pointerdown', event => {
        event.preventDefault();
        event.stopPropagation();
        btn.classList.add('pressed');
        try { btn.setPointerCapture(event.pointerId); } catch { /* Capture is optional. */ }
        if (btn.dataset.hold === 'true') {
            if (state === 'play') keys[heldActionKeys[action]] = true;
        } else runTouchAction(action);
    }, { signal: gameEvents.signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        btn.addEventListener(type, release, { signal: gameEvents.signal });
    }
});

const timer = new THREE.Timer();
renderer.setAnimationLoop(time => {
    try {
        timer.update(time);
        let dt = Math.min(timer.getDelta(), 0.05);
        if (hitStop > 0) {
            hitStop -= dt;
            dt *= 0.1;
        }
        if (isPvpGuest()) {
            /* Зочин тооцоолохгүй — эзний илгээсэн байдлыг л зурна */
            if (state === 'play') stepGuest(dt);
            updateParticles(dt);
        } else if (state === 'play' || state === 'over') {
            if (state === 'play') updateGame(dt);
            updateParticles(dt);
            updateBombs(dt);
            updateArrows(dt);
            /* Эзэн: байдлаа тогтмол дамжуулна */
            if (isPvpHost() && state === 'play') {
                pvpSendTimer -= dt;
                if (pvpSendTimer <= 0) { pvpSendTimer = 1 / PVP_HZ; sendSnapshot(); }
            }
        }
        animateFighter(player, dt);
        enemies.forEach(e => animateFighter(e, dt));
        allies.forEach(a => animateFighter(a, dt));
        updateCamera(dt);
        updateHud();
        renderer.render(scene, camera);
    } catch (error) {
        console.error('3D arena frame failed; switching to reduced mode.', error);
        window.__arenaFallback?.('A 3D runtime problem occurred; switched to the procedural arena.');
    }
});
