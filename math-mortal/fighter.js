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
const WHITE = new THREE.Color(0xffffff);
/* Загварын GLB-д зэвсгийн геометр байхгүй (зөвхөн бие) тул зэвсгийг нь
   гарын ясанд нь зүүнэ. Ингэснээр анимацыг дагаж хөдөлнө. */
const WEAPON_HAND = { archer: 'lefthand' };   /* нум — зүүн гарт */
/* Дайсны биеийн хэмжээ 1.1–1.3 дахин том тул зэвсэг нь дэндүү том болдог.
   Зөвхөн зэвсгийг нь багасгана (нэг нь хэт том бол энд засна). */
const WEAPON_SCALE = { treant: 0.6, golem: 0.68, cultist: 0.58, goblin: 0.62 };
/* three.js загвар ачаалахдаа нэрнээс ":" зэрэг тэмдэгтийг хасдаг
   (mixamorig:RightHand → mixamorigRightHand) тул нэрээр нь биш,
   ТӨГСГӨЛӨӨР нь хайна. */
function findBone(model, suffix) {
    let found = null;
    model.traverse(o => {
        if (found) return;
        if ((o.name || '').toLowerCase().replace(/[^a-z]/g, '').endsWith(suffix)) found = o;
    });
    return found;
}
function buildWeapon(key) {
    const steel = new THREE.MeshStandardMaterial({ color: 0xc6d0de, metalness: 0.85, roughness: 0.28 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.7 });
    const g = new THREE.Group();
    const add = (geo, mat, y, z = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(0, y, z);
        m.castShadow = true;
        g.add(m);
        return m;
    };
    if (key === 'spearman') {
        add(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8), wood, 0.5);
        add(new THREE.ConeGeometry(0.085, 0.3, 8), steel, 1.62);
    } else if (key === 'barbarian') {
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 8), wood, 0.3);
        add(new THREE.BoxGeometry(0.1, 0.42, 0.36), steel, 0.8, 0.07);
    } else if (key === 'archer') {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, -0.62, 0), new THREE.Vector3(0, -0.3, 0.2),
            new THREE.Vector3(0, 0, 0.26), new THREE.Vector3(0, 0.3, 0.2),
            new THREE.Vector3(0, 0.62, 0)
        ]);
        const bow = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 6, false),
            new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.7 }));
        bow.castShadow = true;
        g.add(bow);
        add(new THREE.CylinderGeometry(0.008, 0.008, 1.24, 5), steel, 0);
    } else if (key === 'bomber') {
        add(new THREE.SphereGeometry(0.16, 12, 10), dark, 0.18);
        add(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 6), steel, 0.38);
    } else if (key === 'treant') {
        /* Мушгиа модон таяг — төмөр үзүүргүй (жад биш), намхан, мөчиртэй */
        const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 });
        const moss = new THREE.MeshStandardMaterial({ color: 0x5c7a32, roughness: 0.95 });
        add(new THREE.CylinderGeometry(0.055, 0.075, 1.55, 7), bark, 0.42);
        /* Оройн бүдүүн зангилаа */
        add(new THREE.SphereGeometry(0.11, 8, 7), bark, 1.2);
        /* Хоёр тийш сарвайсан мөчир */
        const t1 = add(new THREE.CylinderGeometry(0.026, 0.034, 0.42, 6), bark, 1.08, 0.1);
        t1.rotation.x = 0.85;
        const t2 = add(new THREE.CylinderGeometry(0.024, 0.03, 0.34, 6), bark, 0.98, -0.08);
        t2.rotation.x = -0.95;
        /* Хөвд */
        add(new THREE.SphereGeometry(0.06, 7, 6), moss, 0.72, 0.05);
    } else if (key === 'golem') {
        /* Лаавын бөөрөнхий сүх — чулуу, гэрэлтэй ан цав */
        const rock = new THREE.MeshStandardMaterial({ color: 0x2a2228, roughness: 0.95 });
        const lava = new THREE.MeshStandardMaterial({
            color: 0x30211c, emissive: 0xff5a12, emissiveIntensity: 1.6, roughness: 0.8 });
        /* Чулуун СҮХ — лаавын улайсан ирмэгтэй */
        add(new THREE.CylinderGeometry(0.055, 0.065, 1.0, 7), rock, 0.32);
        add(new THREE.BoxGeometry(0.12, 0.26, 0.14), rock, 0.86);
        add(new THREE.BoxGeometry(0.08, 0.34, 0.34), rock, 0.86, 0.22);
        add(new THREE.BoxGeometry(0.085, 0.36, 0.06), lava, 0.86, 0.40);
    } else if (key === 'cultist') {
        /* Шившлэгийн таяг — оройд нь ягаан гал */
        const staff = new THREE.MeshStandardMaterial({ color: 0x2e2434, roughness: 0.8 });
        const magic = new THREE.MeshStandardMaterial({
            color: 0x3a1038, emissive: 0xe03cc0, emissiveIntensity: 2.2, roughness: 0.4 });
        add(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 7), staff, 0.55);
        add(new THREE.TorusGeometry(0.17, 0.035, 6, 14), staff, 1.72);
        add(new THREE.SphereGeometry(0.11, 10, 8), magic, 1.72);
    } else if (key === 'goblin') {
        /* Инженерийн том түлхүүр */
        const iron = new THREE.MeshStandardMaterial({ color: 0x8d949c, metalness: 0.8, roughness: 0.4 });
        const grip = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
        add(new THREE.BoxGeometry(0.09, 1.0, 0.1), iron, 0.4);
        add(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 7), grip, 0.08);
        add(new THREE.BoxGeometry(0.4, 0.14, 0.13), iron, 0.92);
        add(new THREE.BoxGeometry(0.12, 0.26, 0.13), iron, 1.04, 0);
        const jaw = add(new THREE.BoxGeometry(0.12, 0.26, 0.13), iron, 1.04, 0);
        jaw.position.x = 0.16;
    } else {
        /* сэлэм */
        add(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 8), wood, 0.08);
        add(new THREE.BoxGeometry(0.28, 0.06, 0.09), dark, 0.22);
        add(new THREE.BoxGeometry(0.075, 0.98, 0.028), steel, 0.74);
        add(new THREE.ConeGeometry(0.052, 0.16, 4), steel, 1.3);
    }
    return g;
}

/* Галын зөөлөн толбо — зурган texture-ийг кодоор зурна (нэмэлт файлгүй) */
let FLAME_TEX = null;
function flameTexture() {
    if (FLAME_TEX) return FLAME_TEX;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,245,200,1)');
    grad.addColorStop(0.3, 'rgba(255,170,50,0.85)');
    grad.addColorStop(0.65, 'rgba(255,90,20,0.35)');
    grad.addColorStop(1, 'rgba(255,50,10,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    FLAME_TEX = new THREE.CanvasTexture(c);
    return FLAME_TEX;
}

/* LAVA GOLEM-ийн гал — дээш хөөрч бүдгэрэх тоосонцрууд */
const FLAME_COUNT = 14;
function buildFlame() {
    const g = new THREE.Group();
    const tex = flameTexture();
    for (let i = 0; i < FLAME_COUNT; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, color: 0xffffff, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0.9
        }));
        /* Тус бүр өөрийн "амьдралын" үе шаттай — тархсан харагдана */
        sp.userData = {
            t: i / FLAME_COUNT,
            speed: 0.9 + Math.random() * 0.5,
            x: (Math.random() - 0.5) * 0.34,
            z: (Math.random() - 0.5) * 0.34,
            size: 0.34 + Math.random() * 0.22
        };
        g.add(sp);
    }
    return g;
}

/* Дөлийг хөдөлгөнө — тоосонцор бүр дээш хөөрч, жижгэрч бүдгэрнэ */
function stepFlame(f, dt) {
    for (const sp of f.flame.children) {
        const d = sp.userData;
        d.t += dt * d.speed;
        if (d.t > 1) {
            d.t -= 1;
            d.x = (Math.random() - 0.5) * 0.34;
            d.z = (Math.random() - 0.5) * 0.34;
            d.size = 0.34 + Math.random() * 0.22;
        }
        const k = d.t;
        sp.position.set(d.x * (1 - k * 0.5), k * 0.9, d.z * (1 - k * 0.5));
        const sc = d.size * (1 - k * 0.65);
        sp.scale.set(sc, sc, sc);
        sp.material.opacity = 0.95 * (1 - k) * (1 - k);
    }
}

function attachFlame(f, model, key) {
    if (key !== 'golem') return;
    /* Ясны масштаб загвар бүрт өөр тул ясанд биш, тулаанчийн БИЕД нь зүүнэ —
       энэ нь дэлхийн нэгжтэй шууд тохирно. */
    const flame = buildFlame();
    flame.position.set(0, 2.15, 0);
    f.body.add(flame);
    f.flame = flame;
}

function attachWeapon(f, model, key) {
    const hand = findBone(model, WEAPON_HAND[key] || 'righthand') || findBone(model, 'righthand');
    if (!hand) return;
    const weapon = buildWeapon(key);
    /* Ясны масштабыг нөхөж, зэвсгийг бодит хэмжээтэй болгоно */
    model.updateWorldMatrix(true, true);
    const ws = new THREE.Vector3();
    hand.getWorldScale(ws);
    weapon.scale.setScalar((f.scale || 1) * (WEAPON_SCALE[key] ?? 1) / Math.max(0.0001, ws.x));
    /* Mixamo-гийн гарын ясны +Y нь хуруу тийш чиглэдэг тул зэвсгийг
       эргүүлэхгүй — атгасан гараас шууд урагшаа сунана. */
    weapon.rotation.set(0, 0, 0);
    hand.add(weapon);
    f.heldWeapon = weapon;
}

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
                    /* 0.74 нь загварын бүх нарийн ширийнийг дардаг байсан */
                    /* Хувцсыг ЦАЙВАР болгоно — загварын даавуу бараан тул
                       өнгийг нь бараг бүрэн сольж, арай цайруулна. */
                    /* Загварын өөрийн хуяг, арьс, нөмрөгийн текстурыг ХАДГАЛНА.
                       Зөвхөн багахан аяс нэмж, бага зэрэг цайруулна — ингэснээр
                       fantasy дайчны харагдах байдал нь алдагдахгүй. */
                    if (material.color) {
                        material.color.lerp(f.baseColor, f.tintAmount);
                        /* 1-ээс их утга = гэрэлтүүлгийн өсгөлт (бараан даавууг цайруулна),
                           1-ээс бага = бараантуулна (дайсны хар их бие). */
                        material.color.multiplyScalar(f.lift);
                    }
                    if (material.emissive) {
                        /* Загварт emissive давхарга байдаггүй — лаавын ан цав, шившлэг,
                           улайсан нүд нь зөвхөн baseColor текстурт будагдсан. Тиймээс
                           ТЭР ТЕКСТУРИЙГ ӨӨРИЙГ нь emissive map болгоно: гэрэлтэй
                           хэсэг нь (лаав, гал, нүд) гэрэлтэж, бараан чулуу нь бараан
                           хэвээр үлдэнэ. */
                        if (material.map) {
                            material.emissiveMap = material.map;
                            material.emissive.setScalar(f.glowStrength);
                        } else {
                            material.emissive.copy(f.glowColor).multiplyScalar(f.glowStrength);
                        }
                        material.emissiveIntensity = 1;
                        f.flashMats.push(material);
                    }
                    return material;
                });
                o.material = Array.isArray(o.material) ? tintedMaterials : tintedMaterials[0];
            }
        });
        f.primitives.forEach(m => { m.visible = false; });
        attachWeapon(f, model, key);
        attachFlame(f, model, key);
        f.body.add(model);
        f.model = model;
    });
}

// Builds a warrior; shows a 3D model when modelKey is given and loads, primitives otherwise.
/* opts: { glow, glowStrength, tint, lift }
     glow         — ялгарах өнгө (лаав, шившлэг). Өгөхгүй бол үндсэн өнгө.
     glowStrength — ялгарлын хүч (0–1)
     tint         — загварын өнгийг үндсэн өнгө рүү татах хэмжээ (0–1)
     lift         — текстурыг цайруулах коэффициент (1 = хэвээр) */
export function createFighter(color, scale = 1, modelKey = null, opts = {}) {
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
        glowColor: new THREE.Color(opts.glow ?? color),
        /* Анхдагч = баатрууд: загварынхаа эх текстурээр, зүгээр тод (дайсантай ижил
           зарчим). Дайсан нь createEnemy-ээс өөрийн утгуудыг дамжуулна. */
        glowStrength: opts.glowStrength ?? 0.05,
        tintAmount: opts.tint ?? 0.1,
        lift: opts.lift ?? 1.75,
        primitives, flashMats: [], model: null,
    };
    if (modelKey && MODELS[modelKey]) attachModel(f, modelKey);
    return f;
}

// Procedural animation driven by fighter state.
export function animateFighter(f, dt) {
    if (f.flame) stepFlame(f, dt);
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
