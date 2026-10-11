import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const MODELS = {
    swordsman: 'assets/models/hero-swordsman-rig.glb',
    barbarian: 'assets/models/hero-barbarian-rig.glb',
    spearman: 'assets/models/hero-spearman-rig.glb',
    bomber: 'assets/models/hero-bomber.glb',
    archer: 'assets/models/hero-archer-ranger.glb',
    treant: 'assets/models/enemy-treant-rig.glb',
    golem: 'assets/models/enemy-lava-golem.glb',
    cultist: 'assets/models/enemy-shadow-cultist.glb',
    goblin: 'assets/models/enemy-goblin-rig2.glb',
};
const CLIPS = {
    idle: ['Sword_Idle', 'Idle'], walk: ['Walk'], run: ['Run', 'Sprint_Loop'],
    attack: ['Sword_Attack', 'Sword_Regular_A'],
    slash: ['Sword_Heavy_Combo', 'Sword_Regular_Combo', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Attack'],
    punch: ['Punch_Cross', 'Punch_Jab', 'Melee_Hook'],
    kick: ['Kick', 'Kick_Forward', 'Front_Kick', 'Roundhouse_Kick'],
    shoot: ['Spell_Simple_Shoot_L', 'Pistol_Shoot_L', 'OverhandThrow', 'Spell_Simple_Shoot'],
    bomb: ['OverhandThrow', 'Spell_Simple_Shoot', 'Sword_Attack'],
    jump: ['Jump_Start', 'NinjaJump_Start', 'Jump_Loop'],
    roll: ['Roll'],
    turn: ['Slide_Start', 'Roll', 'Run'],
    hit: ['Hit_Chest', 'Hit_Head'], death: ['Death01'],
};
const ONE_SHOT = { attack: 0.45, slash: 0.55, punch: 0.4, kick: 0.48, shoot: 0.48, bomb: 0.5, jump: 0.5, turn: 0.35, roll: 0.35, hit: 0.3 };
const loader = new GLTFLoader();
const modelCache = {};
function loadModel(key) {
    if (!modelCache[key]) {
        modelCache[key] = loader.loadAsync(MODELS[key]).catch(err => {
            console.warn(`Model ${key} unavailable, using primitive warrior.`, err);
            return null;
        });
    }
    return modelCache[key];
}
Object.keys(MODELS).forEach(loadModel);

function attachModel(f, key) {
    loadModel(key).then(gltf => {
        if (!gltf) return;
        const model = SkeletonUtils.clone(gltf.scene);
        if (gltf.animations?.length) {
            f.mixer = new THREE.AnimationMixer(model);
            f.actions = {};
            for (const [state, names] of Object.entries(CLIPS)) {
                const clip = names.map(n => gltf.animations.find(c => c.name === n)).find(Boolean);
                if (!clip) continue;
                const action = f.mixer.clipAction(clip);
                if (ONE_SHOT[state] || state === 'death') {
                    action.setLoop(THREE.LoopOnce, 1);
                    action.clampWhenFinished = true;
                    action.timeScale = ONE_SHOT[state] ? Math.max(1, clip.duration / ONE_SHOT[state]) : 1;
                }
                f.actions[state] = action;
            }
            f.animState = null;
        }
        const box = new THREE.Box3().setFromObject(model);
        const h = Math.max(0.001, box.max.y - box.min.y);
        const s = 2.1 / h;
        model.scale.setScalar(s);
        model.position.y = -box.min.y * s;
        model.traverse(o => {
            if (o.isMesh) {
                o.castShadow = true;
                const sourceMaterials = Array.isArray(o.material) ? o.material : [o.material];
                const tintedMaterials = sourceMaterials.map(sourceMaterial => {
                    const material = sourceMaterial.clone();
                    if (material.color) material.color.lerp(f.baseColor, 0.74);
                    if (material.emissive) f.flashMats.push(material);
                    return material;
                });
                o.material = Array.isArray(o.material) ? tintedMaterials : tintedMaterials[0];
            }
        });
        f.primitives.forEach(m => { m.visible = false; });
        f.body.add(model);
        f.model = model;
    });
}

// Builds a warrior; shows a 3D model when modelKey is given and loads, primitives otherwise.
export function createFighter(color, scale = 1, modelKey = null) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    body.scale.setScalar(scale);
    group.add(body);

    const armor = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48a, roughness: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.9, roughness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2018 });

    const mesh = (geo, mat, x, y, z, parent = body) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        parent.add(m);
        return m;
    };

    const torso = mesh(new THREE.BoxGeometry(0.7, 0.75, 0.4), armor, 0, 1.15, 0);
    mesh(new THREE.SphereGeometry(0.22, 12, 10), skin, 0, 1.75, 0);
    mesh(new THREE.ConeGeometry(0.26, 0.25, 12), steel, 0, 1.95, 0);

    const legL = new THREE.Group();
    legL.position.set(-0.18, 0.78, 0);
    body.add(legL);
    mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), dark, 0, -0.39, 0, legL);
    const legR = legL.clone();
    legR.position.x = 0.18;
    body.add(legR);

    const armR = new THREE.Group();
    armR.position.set(0.45, 1.45, 0);
    body.add(armR);
    mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), armor, 0, -0.3, 0, armR);
    const sword = mesh(new THREE.BoxGeometry(0.08, 0.06, 1.1), steel, 0, -0.6, 0.55, armR);
    mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), dark, 0, -0.6, 0.02, armR);
    let bowGroup = null;
    if (modelKey === 'spearman') {
        sword.visible = false;
        const shaft = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.45, 8), dark, 0, -0.58, 0.77, armR);
        shaft.rotation.x = Math.PI / 2;
        const spearTip = mesh(new THREE.ConeGeometry(0.1, 0.34, 8), steel, 0, -0.58, 1.63, armR);
        spearTip.rotation.x = Math.PI / 2;
    } else if (modelKey === 'bomber') {
        sword.visible = false;
        mesh(new THREE.SphereGeometry(0.19, 10, 8), dark, -0.45, 1.02, 0.23, body);
        mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), steel, -0.45, 1.22, 0.23, body);
    } else if (modelKey === 'archer') {
        sword.visible = false;
        bowGroup = new THREE.Group();
        body.add(bowGroup);
        const bowWood = new THREE.MeshStandardMaterial({ color: 0x244b70, roughness: 0.38, metalness: 0.32 });
        const bowCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.58, 2.08, 0.42), new THREE.Vector3(0.87, 1.83, 0.42),
            new THREE.Vector3(0.91, 1.46, 0.42), new THREE.Vector3(0.72, 1.12, 0.42),
            new THREE.Vector3(0.56, 0.98, 0.42)
        ]);
        mesh(new THREE.TubeGeometry(bowCurve, 16, 0.055, 7, false), bowWood, 0, 0, 0, bowGroup);
        const bowString = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.02, 5), steel, 0.57, 1.53, 0.42, bowGroup);
        bowString.rotation.z = 0.04;
        const quiver = mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.72, 8), dark, -0.31, 1.43, -0.22, body);
        quiver.rotation.z = -0.28;
        for (let i = 0; i < 3; i++) {
            const arrowShaft = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 5), steel, -0.4 + i * 0.08, 1.9, -0.22, body);
            arrowShaft.rotation.z = -0.18;
            mesh(new THREE.ConeGeometry(0.045, 0.12, 5), steel, -0.4 + i * 0.08, 2.28, -0.22, body);
        }
    }

    const armL = new THREE.Group();
    armL.position.set(-0.45, 1.45, 0);
    body.add(armL);
    mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), armor, 0, -0.3, 0, armL);
    mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16), steel, 0, -0.45, 0.2, armL).rotation.x = Math.PI / 2;

    const primitives = [];
    body.traverse(o => { if (o.isMesh) primitives.push(o); });
    const f = {
        group, body, torso, legL, legR, armL, armR, sword, bowGroup, armor, scale,
        baseColor: new THREE.Color(color), walkPhase: 0, deathT: 0, weaponKey: modelKey,
        primitives, flashMats: [], model: null,
    };
    if (modelKey && MODELS[modelKey]) attachModel(f, modelKey);
    return f;
}

// Procedural animation driven by fighter state.
export function animateFighter(f, dt) {
    const speed = Math.hypot(f.vel?.x || 0, f.vel?.z || 0);
    f.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(f.walkPhase) * Math.min(1, speed / 4) * 0.7;
    f.legL.rotation.x = swing;
    f.legR.rotation.x = -swing;
    f.armL.rotation.x = -swing * 0.5 - 0.6;

    if (f.kickT > 0) {
        const t = 1 - f.kickT / 0.48;
        f.legR.rotation.x = Math.sin(Math.min(1, t * 1.8) * Math.PI) * -1.55;
    } else {
        f.legR.rotation.x = -swing;
    }

    if (f.attackT > 0 || f.slashT > 0 || f.spearT > 0 || f.punchT > 0 || f.bombT > 0 || f.arrowT > 0) {
        const isSpear = f.spearT > 0;
        const isSlash = f.slashT > 0;
        const isPunch = f.punchT > 0;
        const isBomb = f.bombT > 0;
        const isArrow = f.arrowT > 0;
        const duration = isArrow ? 0.46 : isBomb ? 0.5 : isPunch ? 0.4 : isSpear ? 0.5 : isSlash ? 0.55 : 0.45;
        const remaining = isArrow ? f.arrowT : isBomb ? f.bombT : isPunch ? f.punchT : isSpear ? f.spearT : isSlash ? f.slashT : f.attackT;
        const t = 1 - remaining / duration;
        const wind = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        f.armR.rotation.x = isArrow ? -1.1 + 0.75 * wind : isBomb ? -1.4 + 1.1 * wind : isPunch ? -0.35 - 1.35 * wind : isSpear ? -0.7 + 1.5 * wind : t < 0.35 ? -2.2 * wind : 1.2 - 3.4 * wind;
        f.armR.rotation.z = isArrow ? 0.12 : isPunch || isSpear || isBomb ? 0 : t < 0.35 ? 0 : -0.4;
        f.body.rotation.y = isArrow ? -0.2 * wind : isBomb ? 0.22 * wind : isPunch ? -0.28 * wind : isSpear ? -0.12 * wind : t < 0.35 ? 0.4 * wind : -0.5 * (1 - wind);
    } else {
        f.armR.rotation.x = THREE.MathUtils.damp(f.armR.rotation.x, swing * 0.5 - 0.3, 10, dt);
        f.armR.rotation.z = 0;
        f.body.rotation.y = THREE.MathUtils.damp(f.body.rotation.y, 0, 10, dt);
    }

    if (f.mixer) {
        animateSkinned(f, speed, dt);
        return;
    }
    if (f.sword && !f.model && f.weaponKey !== 'spearman' && f.weaponKey !== 'archer') f.sword.visible = !(f.punchT > 0 || f.kickT > 0 || f.bombT > 0);

    // Dodge roll / hit recoil / death fall
    if (f.dead) {
        f.body.rotation.x = THREE.MathUtils.damp(f.body.rotation.x, -Math.PI / 2, 8, dt);
        f.body.position.y = THREE.MathUtils.damp(f.body.position.y, 0.2, 8, dt);
    } else if (f.dodgeT > 0) {
        f.body.rotation.x = 0;
        f.body.position.y = -0.4 * Math.sin((f.dodgeT / 0.35) * Math.PI);
    } else {
        f.body.rotation.x = f.hitT > 0 ? -0.35 : THREE.MathUtils.damp(f.body.rotation.x, 0, 10, dt);
        f.body.position.y = THREE.MathUtils.damp(f.body.position.y, 0, 10, dt);
    }

    const flash = f.hitT > 0.15;
    f.armor.emissive.setHex(flash ? 0xffffff : 0x000000);
    f.armor.emissiveIntensity = flash ? 0.8 : 0;
    if (f.model) {
        // Static models: lean into swings and bob while walking.
        const attackRemaining = f.bombT > 0 ? f.bombT : f.punchT > 0 ? f.punchT : f.spearT > 0 ? f.spearT : f.slashT > 0 ? f.slashT : f.attackT;
        const attackDuration = f.bombT > 0 ? 0.5 : f.punchT > 0 ? 0.4 : f.spearT > 0 ? 0.5 : f.slashT > 0 ? 0.55 : 0.45;
        const arrowSwing = f.arrowT > 0 ? Math.sin((1 - f.arrowT / 0.46) * Math.PI) : 0;
        f.model.rotation.x = f.arrowT > 0 ? -arrowSwing * 0.18 : attackRemaining > 0 ? Math.sin((1 - attackRemaining / attackDuration) * Math.PI) * 0.35 : 0;
        f.model.position.x = 0;
        f.model.rotation.z = swing * 0.12;
        for (const m of f.flashMats) {
            if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissive.getHex();
            m.emissive.setHex(flash ? 0xffffff : m.userData.baseEmissive);
        }
    }
}

// Skeletal animation: pick a clip from fighter state and crossfade to it.
function animateSkinned(f, speed, dt) {
    let next;
    if (f.dead) next = 'death';
    else if (f.jumpT > 0 || f.posY > 0.05) next = 'jump';
    else if (f.turnT > 0) next = 'turn';
    else if (f.dodgeT > 0) next = 'roll';
    else if (f.hitT > 0) next = 'hit';
    else if (f.arrowT > 0) next = 'shoot';
    else if (f.bombT > 0) next = 'bomb';
    else if (f.slashT > 0) next = 'slash';
    else if (f.spearT > 0) next = 'attack';
    else if (f.punchT > 0) next = 'punch';
    else if (f.kickT > 0) next = 'kick';
    else if (f.attackT > 0) next = 'attack';
    else if (speed > 6.5) next = 'run';
    else if (speed > 0.6) next = 'walk';
    else next = 'idle';
    if (!f.actions[next]) {
        // Fallbacks if specific clip is not in the model
        if ((next === 'slash' || next === 'punch' || next === 'kick' || next === 'bomb' || next === 'shoot') && f.actions.attack) next = 'attack';
        else if ((next === 'jump' || next === 'turn') && f.actions.roll) next = 'roll';
        else next = f.actions.idle ? 'idle' : Object.keys(f.actions)[0];
    }
    if (next && next !== f.animState) {
        const prev = f.actions[f.animState];
        const action = f.actions[next];
        if (action) {
            action.reset().play();
            if (prev) action.crossFadeFrom(prev, ONE_SHOT[next] ? 0.06 : 0.18, false);
            f.animState = next;
        }
    }
    if (f.animState === 'walk' || f.animState === 'run') {
        f.actions[f.animState].timeScale = THREE.MathUtils.clamp(speed / (f.animState === 'run' ? 8 : 4), 0.6, 1.6);
    }
    f.mixer.update(dt);
    f.body.rotation.set(0, 0, 0);
    f.body.position.y = f.posY || 0;
    const flash = f.hitT > 0.15;
    for (const m of f.flashMats) {
        if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissive.getHex();
        m.emissive.setHex(flash ? 0xffffff : m.userData.baseEmissive);
    }
}
