const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── Бүх ангийн дэд бүлгүүд агуулгаар (idempotent; дэд бүлэг тус бүрийг сэргээнэ) ──
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_subgroups (id BIGSERIAL PRIMARY KEY, grade TEXT NOT NULL, name TEXT NOT NULL, pos INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_place (grp TEXT NOT NULL, slug TEXT NOT NULL, kind TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (grp, slug, kind))`);
      const SGALL = {
        '3-р анги': [
          { name:'Үржих, хуваах', slugs:['urjver-hurd.html','urjver-3x2-20.html','huvaalt-3x2-12.html','huvaalt-mongol-12.html'] },
          { name:'Тэгшитгэл', slugs:['tegshitgel-3.html'] },
        ],
        '4-р анги': [
          { name:'Үржих, хуваах', slugs:['urjver-4x3-12.html','huvaalt-4x2-12.html','huvaalt-4x3-12.html','huvaalt-tom-12.html'] },
          { name:'Бутархай', slugs:['butarhai-urjih-18.html','butarhai-nemeh-18.html','butarhai-hasah-18.html','butarhai-huvaah-16.html','butarhai-jish-4.html','arav-toymloh-4.html'] },
          { name:'Тэгшитгэл, бодлого', slugs:['uguulber-4-hard.html','tegshitgel-4.html'] },
        ],
        '5-р анги': [
          { name:'Хуваалт', slugs:['huvaalt-5x2-12.html','huvaalt-5x3-12.html','huvaalt-6x3-12.html'] },
          { name:'Бодлого', slugs:['herchim-arga-12.html','uguulber-4angi-12.html','hurd-bodlogo-12.html','zoruu-bodlogo-12.html'] },
          { name:'Энгийн бутархай', slugs:['butarhai-uildluud-10.html','butarhai-urjih-18.html','butarhai-nemeh-18.html','butarhai-hasah-18.html','butarhai-huvaah-16.html','butarhai-hura-18.html','butarhai-holimog-16.html','butarhai-ekvivalent-24.html','butarhai-jish-5.html'] },
          { name:'Аравтын бутархай', slugs:['arav-butarhai-nemeh-18.html','arav-butarhai-hasah-18.html','arav-butarhai-urjih-18.html','arav-butarhai-huvaah-18.html','arav-butarhai-ilerhiilel-12.html','arav-engiin-holimog-12.html','arav-toymloh-5.html'] },
          { name:'Тэгшитгэл', slugs:['tegshitgel-5.html'] },
        ],
        '6-р анги': [
          { name:'Аравтын бутархай', slugs:['arav-toymloh-6.html','arav6-nemeh.html','arav6-hasah.html','arav6-urjih.html','arav6-huvaah.html','arav6-ilerhiilel.html','arav6-holimog.html'] },
          { name:'Сөрөг тоо', slugs:['numshul-nemeh-hasah-12.html','negativ-too-100.html','temdegt-nemeh-hasah-60.html','temdegt-urjhuv-20.html','temdegt-ilerhiilel-20.html'] },
          { name:'Тоо, хуваагдал', slugs:['anhny-too-100.html','anhny-zadlal-16.html','hieh-hbeh-16.html','izil-huvaari-16.html','huvari-arav-protsent-16.html'] },
          { name:'Энгийн бутархай', slugs:['butarhai-uildluud-10.html','butarhai-huvaah-16.html','butarhai-hura-18.html','butarhai-holimog-16.html','butarhai-ekvivalent-24.html','butarhai-jish-6.html'] },
          { name:'Алгебр илэрхийлэл', slugs:['algebr-gishuun-negtgeh-16.html','algebr-haalt-zadlah-16.html','algebr-hyalbarchlah-14.html'] },
          { name:'Тэгшитгэл', slugs:['tegshitgel-6.html'] },
          { name:'Геометр (өнцөг)', slugs:['hamar-ongo.html','hamar-ongo-2.html','bosoo-ongo.html','bosoo-ongo-2.html','gurvaljin-ongo.html','gurvaljin-ongo-2.html','olon-ongogt-ongo.html','olon-ongogt-ongo-2.html'] },
        ],
        '7-р анги': [
          { name:'Дараалал, прогресс', slugs:['daraalal-zui-togtol-12.html','arifmetik-progress-12.html'] },
          { name:'Алгебр илэрхийлэл', slugs:['algebr-gishuun-negtgeh-16.html','algebr-haalt-zadlah-16.html','algebr-hyalbarchlah-14.html'] },
          { name:'Зэрэг', slugs:['aravt-zereg-16.html','kvadrat-zereg-20.html','zereg-chanar-30.html'] },
          { name:'Рационал тоо', slugs:['ratsional-nemeh-hasah-20.html','ratsional-urjih-huvaah-20.html','ratsional-toon-ilerhiilel-16.html'] },
          { name:'Олон гишүүнт', slugs:['neg-olon-gishuunt-20.html','olon-olon-gishuunt-16.html','olon-gishuunt-emhetgel-20.html','standart-emhetgel-16.html','niitleg-uurjigdehuun-20.html','niitleg-monom-16.html','gishuunchlen-urjih-16.html'] },
          { name:'Тэгшитгэл', slugs:['tegshitgel-7.html','shugaman-tegshitgel-16.html'] },
          { name:'Геометр (өнцөг)', slugs:['hamar-ongo.html','hamar-ongo-2.html','bosoo-ongo.html','bosoo-ongo-2.html','gurvaljin-ongo.html','gurvaljin-ongo-2.html','olon-ongogt-ongo.html','olon-ongogt-ongo-2.html','solbison-ongo.html','gadaad-ongo.html'] },
        ],
        '8-р анги': [
          { name:'Зэрэг, язгуур', slugs:['zereg-uildel-12.html','zereg-chanar-hard-10.html','yazguur-hyalbarchlah-20.html','rats-zereg-yazguur-ilerhiilel-16.html','rats-zeregt-18.html','rats-yazguur-gargah-18.html','kvadrat-yazguur-20.html','kvadrat-yazguur-buhel-20.html','kub-zereg-yazguur-16.html','ratsional-yazguur-20.html','rats-zereg-yazguur-16.html','zereg-yazguur-ilerhiilel-20.html'] },
          { name:'Хураах томьёо, задлал', slugs:['niilber-kvadrat-20.html','yalgavar-kvadrat-20.html','kvadratuud-ylgavar-20.html','alg-7-tomyo-9.html','algebr-butarhai-7tomyo-9.html','algebr-butarhai-abc-9.html','algebr-butarhai-2hyz-9.html','niitleg-2-16.html'] },
          { name:'Алгебрын бутархай', slugs:['algebr-butarhai-16.html','algebr-butarhai-2-16.html','algebr-butarhai-nh-16.html','algebr-butarhai-uh-16.html','algebr-kvadrat-butarhai-16.html','algebr-kvadrat-uh-16.html'] },
          { name:'Тэгшитгэл, систем', slugs:['shts-2-16.html','shugaman-tents-bish-16.html'] },
          { name:'Функц, график', slugs:['shuluun-grafik-8.html','shuluun-nalalt-8.html','shts-grafik-8.html','shugaman-urvuu-12.html'] },
        ],
        '9-р анги': [
          { name:'Алгебр', slugs:['troichlen-zadlal-12.html','buleglekh-zadlal-14.html','irratsional-ilerhiilel-20.html','yazguur-hyalbarchlah-20.html','algebr-butarhai-buh-16.html','algebr-butarhai-buh-2-16.html','algebr-butarhai-buh-3-16.html','algebr-buh-4-16.html','alg-7-tomyo-9.html','algebr-butarhai-7tomyo-9.html','algebr-butarhai-abc-9.html','algebr-butarhai-2hyz-9.html','songon-yazguur-4torol.html'] },
          { name:'Тэгшитгэл', slugs:['kvadrat-tegshitgel-20.html','kvadrat-tegshitgel-2-16.html','ratsional-tegshitgel-16.html','shts-3-12.html'] },
          { name:'Функц', slugs:['shugaman-urvuu-12.html'] },
          { name:'Геометр', slugs:['bisektris-chanar.html','median-chanar.html','trig-gar-arga.html','trig-sin.html','trig-cos.html','trig-tan.html','trig-tal-urt.html','trig-ongo-oloh.html','koordinat-arga.html','koordinat-arga-2.html','vektor-koordinat.html','vektor-koordinat-2.html','vektor-uildel.html'] },
        ],
        '10-р анги': [
          { name:'2.1 Тэг ба сөрөг илтгэгчтэй зэрэг', slugs:['zereg-teg-sorog-10.html','zereg-teg-sorog-hard-10.html'] },
          { name:'2.2 n зэргийн язгуур', slugs:['yazguur-n-zereg-10.html','yazguur-n-zereg-hard-10.html'] },
          { name:'2.2 n зэргийн язгуурын чанар', slugs:['zereg-yazguur-chanar-10.html','zereg-yazguur-chanar-hard-10.html'] },
          { name:'2.3 Рационал тоон илтгэгчтэй зэрэг', slugs:['ratsional-iltgegch-10.html','ratsional-iltgegch-2-10.html'] },
          { name:'2.4 Стандарт хэлбэрээр бичсэн тооны үйлдэл', slugs:['standart-helber-uildel-10.html'] },
          { name:'II бүлэг — Жишиг ба шалгалт', slugs:['jishig-daalgavar-zereg-10.html','jishig-daalgavar-2-zereg-10.html','shalgalt-material-zereg-10.html'] },
          { name:'3.1 Рационал илтгэгчтэй алгебрын илэрхийлэл', slugs:['algebr-ratsional-1-10.html','algebr-ratsional-2-10.html'] },
          { name:'3.2 Үржигдэхүүн болгон задлах', slugs:['urjigdehuun-zadlah-1-10.html','urjigdehuun-zadlah-2-10.html'] },
          { name:'Квадрат функцийн график', slugs:['grafik-ax2.html','grafik-ax2-c.html','grafik-ax-h2.html','grafik-oroin-helber.html','grafik-erenhii.html','kvadrat-grafik-zoolt-8.html'] },
        ],
        '11-р анги': [
          { name:'Тэгшитгэл, тэнцэтгэл биш', slugs:['kvadrat-tentsbish-grafik.html','tegshitgel-sistem-4torol.html','iltgegch-tegshitgel-16.html'] },
          { name:'Матриц ба систем', slugs:['matrits-urvuu-sistem-12.html','matrits-2x2-20.html','matrits-3x3-det-12.html','kramer-3-6.html'] },
        ],
        '12-р анги': [
          { name:'Модултай тэгшитгэл', slugs:['modul-tegshitgel-12.html','modul-tegshitgel-2-12.html','modul-tegshitgel-3-12.html'] },
          { name:'Модул тэнцэтгэл биш', slugs:['modul-tentsetgel-bish-12.html','modul-tentsetgel-bish-2-12.html','modul-tentsetgel-bish-3-12.html'] },
          { name:'Модул — аргууд', slugs:['modul-12.html','modul-ab-kvadrat-12.html','modul-orluulga-kvadrat-12.html','modul-radikal-12.html'] },
          { name:'Шалгалт', slugs:['modul-shalgalt-12.html','modul-shalgalt-material-12.html'] },
        ],
      };
      await pool.query(`ALTER TABLE ws_subgroups ADD COLUMN IF NOT EXISTS parent_id BIGINT`).catch(() => {});
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_settings (skey TEXT PRIMARY KEY, sval TEXT)`).catch(() => {});
      // Дэд бүлгийг ЗӨВХӨН НЭГ УДАА (цоо шинэ DB дээр) bootstrap хийнэ. Дараа нь UI бүрэн эзэмшинэ:
      // хэрэглэгч устгасан/нэр өөрчилсөн/nest хийсэн бүлгийг seed дахин ҮҮСГЭХГҮЙ.
      const bootRow = await pool.query(`SELECT sval FROM ws_settings WHERE skey='sg_bootstrapped'`);
      const bootDone = bootRow.rows.length > 0;
      const sgCount = Number((await pool.query('SELECT COUNT(*)::int AS n FROM ws_subgroups')).rows[0].n);
      if (!bootDone && sgCount === 0) {
        for (const grade of Object.keys(SGALL)) {
          const groups = SGALL[grade];
          for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            const ins = await pool.query('INSERT INTO ws_subgroups (grade, name, pos) VALUES ($1,$2,$3) RETURNING id', [grade, g.name, i]);
            const lbl = 'sg:' + Number(ins.rows[0].id);
            for (const slug of g.slugs) {
              await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'add') ON CONFLICT DO NOTHING`, [lbl, slug]);
            }
          }
        }
      }
      if (!bootDone) {
        await pool.query(`INSERT INTO ws_settings (skey, sval) VALUES ('sg_bootstrapped','1') ON CONFLICT (skey) DO UPDATE SET sval='1'`);
      }
      // Bootstrap-с ХОЙШ нэмэгдсэн дэд бүлгүүд — тус бүрийг ЗӨВХӨН НЭГ УДАА нэмнэ (устгасныг сэргээхгүй)
      const ADDITIONS = [
        { grade: '10-р анги', name: '3.3 Алгебрын бутархайн үржүүлэх, хуваах', slugs: ['algebr-butarhai-urjuuleh-1-10.html', 'algebr-butarhai-urjuuleh-2-10.html'] },
        { grade: '10-р анги', name: '3.4 Алгебрын бутархайн нэмэх, хасах', slugs: ['butarhai-nemeh-hasah-1-10.html', 'butarhai-nemeh-hasah-2-10.html'] },
        { grade: '10-р анги', name: 'III бүлэг — Жишиг ба шалгалт', slugs: ['jishig-3-1-10.html', 'jishig-3-2-10.html', 'shalgalt-material-3-10.html'] },
        { grade: '10-р анги', name: '4.1 Тэгш өнцөгт координатын систем, цэгийн координат', slugs: ['koordinat-sistem-1-10.html', 'koordinat-sistem-2-10.html'] },
        { grade: '10-р анги', name: '4.2 Шулууны налалт', slugs: ['shuluu-nalalt-1-10.html', 'shuluu-nalalt-2-10.html'] },
        { grade: '10-р анги', name: '4.3 Шулууны тэгшитгэл', slugs: ['shuluu-tegshitgel-1-10.html', 'shuluu-tegshitgel-2-10.html'] },
        { grade: '10-р анги', name: '4.4 Тойргийн тэгшитгэл', slugs: ['toirog-tegshitgel-1-10.html', 'toirog-tegshitgel-2-10.html'] },
        { grade: '10-р анги', name: 'IV бүлэг — Жишиг ба шалгалт', slugs: ['jishig-4-1-10.html', 'jishig-4-2-10.html', 'shalgalt-material-4-10.html'] },
        { grade: '10-р анги', name: '5.1 Функц, тодорхойлогдох муж ба дүр', slugs: ['funkts-muj-dur-1-10.html', 'funkts-mon-eseh-2-10.html'] },
        { grade: '10-р анги', name: '5.3 y = a/x функц', slugs: ['funkts-ax-graf-10.html', 'funkts-ax-tegsh-10.html'] },
        { grade: '10-р анги', name: '5.4 y = axⁿ хэлбэрийн функцийн график', slugs: ['funkts-axn-muj-10.html', 'funkts-ax2inv-graf-10.html', 'funkts-sqrt-cube-graf-10.html'] },
        { grade: '10-р анги', name: '5.5 y = aˣ илтгэгч функцийн график', slugs: ['funkts-exp-graf-10.html', 'funkts-exp-tegsh-10.html'] },
        { grade: '10-р анги', name: '5.6 Муруйн шүргэгч, шүргэгчийн налалт', slugs: ['shurgegch-nalalt-1-10.html', 'shurgegch-nalalt-2-10.html'] },
        { grade: '10-р анги', name: 'V бүлэг — Жишиг ба шалгалт', slugs: ['jishig-5-1-10.html', 'jishig-5-2-10.html', 'shalgalt-material-5-10.html'] },
        { grade: '10-р анги', name: '6.1 Нэг хувьсагчтай шугаман тэнцэтгэл биш ба систем', slugs: ['shugaman-teng-bish-1-10.html', 'shugaman-teng-bish-2-10.html'] },
        { grade: '10-р анги', name: '6.2 Квадрат тэгшитгэл', slugs: ['kvadrat-teng-bodoh-1-10.html', 'kvadrat-teng-bodoh-2-10.html'] },
        { grade: '10-р анги', name: '6.3 Квадрат тэгшитгэлд шилждэг тэгшитгэл', slugs: ['shiljih-teng-1-10.html', 'shiljih-teng-2-10.html'] },
        { grade: '10-р анги', name: '6.4 Хоёр хувьсагчтай шугаман тэнцэтгэл биш ба систем', slugs: ['shugaman-teng-bish-2huv-10.html', 'shugaman-teng-bish-2huv-2-10.html'] },
        { grade: '10-р анги', name: '6.5 Илтгэгч тэгшитгэл', slugs: ['iltgegch-teng-1-10.html', 'iltgegch-teng-2-10.html', 'iltgegch-teng-3-10.html'] },
        { grade: '10-р анги', name: 'VI бүлэг — Жишиг ба шалгалт', slugs: ['jishig-6-1-10.html', 'jishig-6-2-10.html', 'shalgalt-material-6-10.html'] },
        { grade: '10-р анги', name: '7.1 Тойрогт багтсан өнцөг', slugs: ['bagtsan-onts-1-10.html', 'bagtsan-onts-2-10.html'] },
        { grade: '10-р анги', name: '7.2 Тойрогт багтсан ба тойрог багтаасан олон өнцөгт', slugs: ['gurv-bagtsan-toirog-10.html', 'gurv-bagtaasan-toirog-10.html', 'toirogt-bagtsan-olon-10.html', 'toirog-bagtaasan-olon-10.html'] },
        { grade: '10-р анги', name: '7.3 Тойргийн хөвч, шүргэгч, огтлогчийн чанар', slugs: ['toirog-hovch-10.html', 'toirog-shurgegch-10.html', 'shurgegch-hovch-onts-10.html'] },
        { grade: '10-р анги', name: 'Квадрат график — графикаас тэгшитгэл', slugs: ['grafik-kvadrat-tegsh.html'] },
      ];
      const seedAddRow = await pool.query(`SELECT sval FROM ws_settings WHERE skey='sg_seeded_add'`);
      let seededAdd = [];
      try { seededAdd = seedAddRow.rows.length ? (JSON.parse(seedAddRow.rows[0].sval || '[]') || []) : []; } catch (e2) { seededAdd = []; }
      // ── Нэг удаагийн цэвэрлэгээ: idempotent seed-ийн алдаанаас болж дахин үүссэн давхардсан дэд бүлгүүд (id 90-94) ──
      const cf = await pool.query(`SELECT sval FROM ws_settings WHERE skey='cleanup_dupsg_v1'`);
      if (!cf.rows.length) {
        const DUPS = [[90, '4.4 Тойргийн тэгшитгэл'], [91, 'IV бүлэг — Жишиг ба шалгалт'], [92, '5.1 Функц, тодорхойлогдох муж ба дүр'], [93, '5.3 y = a/x функц'], [94, 'Квадрат график — графикаас тэгшитгэл']];
        for (const [did, nm] of DUPS) {
          const chk = await pool.query('SELECT id FROM ws_subgroups WHERE id=$1 AND name=$2', [did, nm]);
          if (chk.rows.length) {
            const lbl = 'sg:' + did;
            await pool.query('DELETE FROM ws_place WHERE grp=$1', [lbl]);
            await pool.query('DELETE FROM ws_order WHERE grp=$1', [lbl]);
            await pool.query('UPDATE ws_subgroups SET parent_id=NULL WHERE parent_id=$1', [did]).catch(() => {});
            await pool.query('DELETE FROM ws_subgroups WHERE id=$1', [did]);
          }
        }
        await pool.query(`INSERT INTO ws_settings (skey, sval) VALUES ('cleanup_dupsg_v1','1') ON CONFLICT (skey) DO UPDATE SET sval='1'`);
      }
      for (const add of ADDITIONS) {
        if (seededAdd.indexOf(add.name) >= 0) continue;   // аль хэдийн нэг удаа нэмсэн бол алгасна (устгал/нэр засварыг хүндэтгэнэ)
        const ex = await pool.query('SELECT id FROM ws_subgroups WHERE grade=$1 AND name=$2', [add.grade, add.name]);
        if (!ex.rows.length) {
          const mx = await pool.query('SELECT COALESCE(MAX(pos),0)+1 AS p FROM ws_subgroups WHERE grade=$1', [add.grade]);
          const ins = await pool.query('INSERT INTO ws_subgroups (grade, name, pos) VALUES ($1,$2,$3) RETURNING id', [add.grade, add.name, mx.rows[0].p]);
          const lbl = 'sg:' + Number(ins.rows[0].id);
          for (const slug of add.slugs) {
            await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'add') ON CONFLICT DO NOTHING`, [lbl, slug]);
          }
        }
        seededAdd.push(add.name);
      }
      await pool.query(`INSERT INTO ws_settings (skey, sval) VALUES ('sg_seeded_add',$1) ON CONFLICT (skey) DO UPDATE SET sval=$1`, [JSON.stringify(seededAdd)]);
    } catch (e) { console.error('[all subgroups]', e.message); }

    // Nodes seed
    const nodes = [
      [1,"Бүхэл тооны зэрэг, шинж чанар","lesson","🔢","8"],
      [2,"Стандарт хэлбэр (a×10ⁿ)","locked","📏","8"],
      [3,"Язгуурын тухай ойлголт, √, ∛","locked","√","8"],
      [4,"Язгуурын шинж чанар, хялбарчлах","locked","√","8"],
      [5,"Олон гишүүнтийн ойлголт","locked","📊","8"],
      [6,"Нэмэх, хасах үйлдэл","locked","➕","8"],
      [7,"Үржүүлэх үйлдэл","locked","✖️","8"],
      [8,"Хураах томьёо (a±b)², a²-b²","locked","📐","8"],
      [9,"Задлан бичих","locked","🔍","8"],
      [10,"Алгебрийн бутархайн ойлголт","locked","➗","8"],
      [11,"Хялбарчлах, үржүүлэх, хуваах","locked","➗","8"],
      [12,"Нэмэх, хасах бутархай","locked","➕","8"],
      [13,"Нийлмэл бутархай","locked","🔗","8"],
      [14,"Нэг хувьсагчтай тэгшитгэл","locked","🟰","8"],
      [15,"Хоёр хувьсагчтай тэгшитгэл","locked","🟰","8"],
      [16,"Систем — орлуулах арга","locked","🔄","8"],
      [17,"Систем — нэмэх арга","locked","➕","8"],
      [18,"Текст бодлого → тэгшитгэл","locked","📝","8"],
      [19,"Шугаман тэнцэтгэл бус байдал","locked","⚖️","8"],
      [20,"Тэнцэтгэл бус байдлын систем","locked","⚖️","8"],
      [21,"Тоон шугам дээр дүрслэх","locked","📉","8"],
      [22,"Функцийн ойлголт, тэмдэглэгээ","locked","📈","8"],
      [23,"Шугаман функц y=kx+b, график","locked","📈","8"],
      [24,"k ба b коэффициент","locked","📊","8"],
      [25,"Шулуунуудын харилцан байдал","locked","↔️","8"],
      [26,"Параллелограммын шинж чанар","locked","🔷","8"],
      [27,"Тэгш өнцөгт, ромб, квадрат","locked","🟦","8"],
      [28,"Трапец, шинж чанар","locked","📐","8"],
      [29,"Талбай тооцоолох","locked","📏","8"],
      [30,"Адил хэмжсэн байх нөхцөл","locked","🔺","8"],
      [31,"Адил хэмжсэний шинж чанар","locked","🔺","8"],
      [32,"Дундаж шугам","locked","📏","8"],
      [33,"Адил хэмжсэн бодлого","locked","📝","8"],
      [34,"Пифагорын теоремийн томьёо","locked","📐","8"],
      [35,"Пифагор — гурвалжинд хэрэглэх","locked","📐","8"],
      [36,"Пифагор — өдөр тутмын бодлого","locked","🏠","8"],
      [37,"Пифагорын тоонууд","locked","🔢","8"],
      [38,"Тойрог ба тойрог","locked","⭕","8"],
      [39,"Хөвч, диаметр, шинж чанар","locked","⭕","8"],
      [40,"Тангенс шугам","locked","↗️","8"],
      [41,"Тойрогт багтсан өнцөг","locked","📐","8"],
      [42,"Өгөгдөл цуглуулах, ангилах","locked","📋","8"],
      [43,"Дундаж, медиан, мод","locked","📊","8"],
      [44,"Диаграмм: багана, дугуй, шугам","locked","📉","8"],
      [45,"Өгөгдөл тайлбарлах","locked","🔎","8"],
      [46,"Рационал ба иррационал тоо","locked","∞","9"],
      [47,"Бодит тооны олонлог, бүтэц","locked","ℝ","9"],
      [48,"Модуль (үнэмлэхүй утга)","locked","||","9"],
      [49,"Тооны тэнхлэг дээр дүрслэх","locked","📏","9"],
      [50,"Язгуурын шинж чанар давтах","locked","√","9"],
      [51,"Нэмэх, хасах (ижил язгуур)","locked","➕","9"],
      [52,"Үржүүлэх, хуваах (язгуур)","locked","✖️","9"],
      [53,"Хуваарийг рационалчлах","locked","➗","9"],
      [54,"Иррационал тэгшитгэл","locked","🟰","9"],
      [55,"Квадрат тэгшитгэлийн ойлголт","locked","²","9"],
      [56,"Бүрэн квадратт хүргэх арга","locked","🔲","9"],
      [57,"Discriminant (D=b²-4ac)","locked","D","9"],
      [58,"Vieta-гийн теорем","locked","V","9"],
      [59,"Квадрат тэгшитгэл задлах","locked","🔑","9"],
      [60,"Квадрат тэгшитгэл — бодлого","locked","📝","9"],
      [61,"Шугаман тэнцэтгэл бус давтах","locked","⚖️","9"],
      [62,"Квадрат тэнцэтгэл бус байдал","locked","⚖️","9"],
      [63,"Интервалын арга","locked","📊","9"],
      [64,"Систем тэнцэтгэл бус байдал","locked","🔗","9"],
      [65,"Функцийн ойлголт, давталт","locked","📈","9"],
      [66,"Квадрат функц y=ax²+bx+c","locked","📈","9"],
      [67,"Парабол — оройн координат","locked","∩","9"],
      [68,"Параболын график байгуулах","locked","📊","9"],
      [69,"Функцийн нэмэгдэх, буурах","locked","↗️","9"],
      [70,"Хэсэг-шугаман функц","locked","📉","9"],
      [71,"Дарааллын тухай ойлголт","locked","🔢","9"],
      [72,"Арифметик прогресс, d олох","locked","➕","9"],
      [73,"n-р гишүүн олох томьёо aₙ","locked","aₙ","9"],
      [74,"Нийлбэр олох томьёо Sₙ","locked","∑","9"],
      [75,"Арифметик прогресс — бодлого","locked","📝","9"],
      [76,"Геометрийн прогресс, q олох","locked","✖️","9"],
      [77,"n-р гишүүн олох томьёо (геом)","locked","qⁿ","9"],
      [78,"Нийлбэр олох томьёо Sₙ (геом)","locked","∑","9"],
      [79,"Хязгааргүй геометрийн прогресс","locked","∞","9"],
      [80,"Геометрийн прогресс — бодлого","locked","📝","9"],
      [81,"Хурц өнцгийн sin, cos, tan, cot","locked","📐","9"],
      [82,"Тригонометрийн үндсэн харилцаа","locked","🔗","9"],
      [83,"30°, 45°, 60° өнцгийн утга","locked","📐","9"],
      [84,"Гурвалжны тал, өнцөг тооцоолох","locked","🔺","9"],
      [85,"Тригонометр — хэрэглээний бодлого","locked","📝","9"],
      [86,"Синусын теорем, баталгаа","locked","sin","9"],
      [87,"Синус — тал, өнцөг олох","locked","sin","9"],
      [88,"Синусын теорем — бодлого","locked","📝","9"],
      [89,"Косинусын теорем, баталгаа","locked","cos","9"],
      [90,"Косинус — тал, өнцөг олох","locked","cos","9"],
      [91,"Синус, косинус хавсарган хэрэглэх","locked","📐","9"],
      [92,"Нум, хөвч, өнцгийн харилцаа","locked","⭕","9"],
      [93,"Тойрогт бичигдсэн өнцөг","locked","⭕","9"],
      [94,"Тойрогт багтсан олон өнцөгт","locked","🔷","9"],
      [95,"Тойргийн талбай, нумын урт","locked","📏","9"],
      [96,"Векторын тухай ойлголт","locked","→","9"],
      [97,"Вектор нэмэх, хасах, үржүүлэх","locked","→","9"],
      [98,"Координатын системд вектор","locked","📊","9"],
      [99,"Скаляр үржвэр","locked","·","9"],
      [100,"Вектор — геометр бодлого","locked","📝","9"],
      [101,"Нэмэх зарчим","locked","➕","9"],
      [102,"Үржүүлэх зарчим","locked","✖️","9"],
      [103,"Хослол (Combination) Cₙᵏ","locked","C","9"],
      [104,"Байрлал (Permutation) Pₙ","locked","P","9"],
      [105,"Binomial коэффициент","locked","∑","9"],
      [106,"Магадлалын классик тодорхойлолт","locked","🎲","9"],
      [107,"Нэмэх теорем","locked","➕","9"],
      [108,"Үржүүлэх теорем","locked","✖️","9"],
      [109,"Хамтарсан ба хасагдах үйл явдал","locked","🔀","9"],
      [110,"Нөхцөлт магадлал","locked","🎯","9"],
      [111,"Магадлал — бодлого","locked","📝","9"],
      [112,"Өгөгдлийн тархалт","locked","📊","9"],
      [113,"Дундаж, медиан, мод давтах","locked","📈","9"],
      [114,"Дисперс, стандарт хазайлт","locked","σ","9"],
      [115,"Диаграмм ба график тайлбарлах","locked","📉","9"],
      [116,"Статистик — практик бодлого","locked","📝","9"],
    ];

    // Nodes table шинэчлэх — зөвхөн байхгүй node-уудыг нэмнэ, байгааг өөрчлөхгүй
    for (const [id, name, type, icon, grade] of nodes) {
      await pool.query(
        'INSERT INTO nodes (id, name, type, icon, grade, sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
        [id, name, type, icon, grade, id]
      );
    }

    // Exam nodes нэмэх
    const examNodes = [
      [117,"📝 Шалгалт: Тооны илэрхийлэл","locked","📝","8"],
      [118,"📝 Шалгалт: Олон гишүүнт","locked","📝","8"],
      [119,"📝 Шалгалт: Алгебрийн бутархай","locked","📝","8"],
      [120,"📝 Шалгалт: Шугаман тэгшитгэл","locked","📝","8"],
      [121,"📝 Шалгалт: Тэнцэтгэл бус","locked","📝","8"],
      [122,"📝 Шалгалт: Функц","locked","📝","8"],
      [123,"📝 Шалгалт: Дөрвөн өнцөгт","locked","📝","8"],
      [124,"📝 Шалгалт: Адил хэмжсэн","locked","📝","8"],
      [125,"📝 Шалгалт: Пифагорын теорем","locked","📝","8"],
      [126,"📝 Шалгалт: Тойрог I","locked","📝","8"],
      [127,"📝 Шалгалт: Статистик I","locked","📝","8"],
      [128,"📝 Шалгалт: Бодит тоо","locked","📝","9"],
      [129,"📝 Шалгалт: Иррационал","locked","📝","9"],
      [130,"📝 Шалгалт: Квадрат тэгшитгэл","locked","📝","9"],
      [131,"📝 Шалгалт: Тэнцэтгэл бус II","locked","📝","9"],
      [132,"📝 Шалгалт: Функц II","locked","📝","9"],
      [133,"📝 Шалгалт: Арифметик прогресс","locked","📝","9"],
      [134,"📝 Шалгалт: Геом прогресс","locked","📝","9"],
      [135,"📝 Шалгалт: Тригонометр","locked","📝","9"],
      [136,"📝 Шалгалт: Синусын теорем","locked","📝","9"],
      [137,"📝 Шалгалт: Косинусын теорем","locked","📝","9"],
      [138,"📝 Шалгалт: Тойрог II","locked","📝","9"],
      [139,"📝 Шалгалт: Вектор","locked","📝","9"],
      [140,"📝 Шалгалт: Тооллын зарчим","locked","📝","9"],
      [141,"📝 Шалгалт: Магадлал","locked","📝","9"],
      [142,"📝 Шалгалт: Статистик II","locked","📝","9"],
    ];
    for (const [id, name, type, icon, grade] of examNodes) {
      await pool.query(
        'INSERT INTO nodes (id, name, type, icon, grade, sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
        [id, name, type, icon, grade, id]
      );
    }

    // ===== 6-р ангийн сургалтын зам (ЕБС хөтөлбөр) — 9-р анги шиг node хэлбэрээр =====
    const grade6Nodes = [
      // Натурал тоо ба үйлдэл
      [301,"Натурал тоо, орон, дугаарлалт","lesson","🔢","6"],
      [302,"Том тоо унших, бичих","locked","🔟","6"],
      [303,"Нэмэх, хасах","locked","➕","6"],
      [304,"Үржүүлэх","locked","✖️","6"],
      [305,"Бүхэл тоог хуваах","locked","➗","6"],
      [306,"Үлдэгдэлтэй хуваах","locked","🔁","6"],
      [307,"Үйлдлийн дараалал, хаалт","locked","🧮","6"],
      // Хуваагдал
      [308,"Тэгш ба сондгой тоо","locked","⚖️","6"],
      [309,"2, 5, 10-т хуваагдах шинж","locked","✔️","6"],
      [310,"3, 9-т хуваагдах шинж","locked","✅","6"],
      [311,"Анхны ба составын тоо","locked","🔷","6"],
      [312,"Анхны үржигдэхүүнд задлах","locked","🧩","6"],
      [313,"ХИЕХ — их ерөнхий хуваагч","locked","🔗","6"],
      [314,"ХБЕҮ — бага ерөнхий үржвэр","locked","🔃","6"],
      // Энгийн бутархай
      [315,"Бутархайн ойлголт","locked","½","6"],
      [316,"Зөв, буруу, холимог тоо","locked","🍰","6"],
      [317,"Ижилтгэсэн бутархай","locked","🟰","6"],
      [318,"Бутархайг хураах","locked","✂️","6"],
      [319,"Бутархай харьцуулах","locked","⚖️","6"],
      [320,"Ижил хуваарьтай нэмэх, хасах","locked","➕","6"],
      [321,"Өөр хуваарьтай нэмэх, хасах","locked","➖","6"],
      [322,"Бутархай үржүүлэх","locked","✖️","6"],
      [323,"Бутархай хуваах","locked","➗","6"],
      [324,"Холимог тооны үйлдэл","locked","🔀","6"],
      [325,"Бутархайн бодлого","locked","📘","6"],
      // Аравтын бутархай
      [326,"Аравтын бутархайн ойлголт","locked","💠","6"],
      [327,"Аравтын бутархай харьцуулах","locked","⚖️","6"],
      [328,"Тоймлох","locked","🎯","6"],
      [329,"Аравтын бутархай нэмэх, хасах","locked","➕","6"],
      [330,"Аравтын бутархай үржүүлэх","locked","✖️","6"],
      [331,"Аравтын бутархай хуваах","locked","➗","6"],
      [332,"Энгийн ↔ аравтын хөрвүүлэлт","locked","🔄","6"],
      // Хувь ба харьцаа
      [333,"Хувийн ойлголт (%)","locked","％","6"],
      [334,"Тооны хувь олох","locked","📊","6"],
      [335,"Харьцаа","locked","⚖️","6"],
      [336,"Пропорц","locked","🟰","6"],
      [337,"Хувийн бодлого (хямдрал, хүү)","locked","💰","6"],
      // Сөрөг тоо ба координат
      [338,"Эерэг ба сөрөг тоо","locked","➖","6"],
      [339,"Тооны тэнхлэг","locked","📏","6"],
      [340,"Эсрэг тоо, модуль","locked","±","6"],
      [341,"Сөрөг тоо харьцуулах","locked","⚖️","6"],
      [342,"Нэмэх, хасах (сөрөгтэй)","locked","➕","6"],
      [343,"Үржих, хуваах (сөрөгтэй)","locked","✖️","6"],
      [344,"Координатын хавтгай","locked","📈","6"],
      [345,"Цэг тэмдэглэх","locked","📍","6"],
      // Илэрхийлэл ба тэгшитгэл
      [346,"Тоон илэрхийлэл","locked","🧮","6"],
      [347,"Үсэгт илэрхийлэл","locked","🔤","6"],
      [348,"Илэрхийллийн утга олох","locked","🎯","6"],
      [349,"Энгийн тэгшитгэл","locked","🟰","6"],
      [350,"Тэгшитгэл бодох (нэмэх, хасах)","locked","➕","6"],
      [351,"Тэгшитгэл бодох (үржих, хуваах)","locked","✖️","6"],
      [352,"Текст бодлого тэгшитгэлээр","locked","📖","6"],
      // Геометр
      [353,"Цэг, шулуун, хэрчим, туяа","locked","📏","6"],
      [354,"Өнцөг, өнцөг хэмжих","locked","📐","6"],
      [355,"Өнцгийн төрөл","locked","🔺","6"],
      [356,"Гурвалжин, түүний төрөл","locked","🔺","6"],
      [357,"Дөрвөн өнцөгт","locked","⬛","6"],
      [358,"Периметр","locked","🔲","6"],
      [359,"Тэгш өнцөгт, квадратын талбай","locked","📐","6"],
      [360,"Гурвалжны талбай","locked","📐","6"],
      [361,"Тэгш хэм","locked","🪞","6"],
      [362,"Тойрог, радиус, диаметр","locked","⭕","6"],
      [363,"Эзлэхүүн (параллелепипед)","locked","📦","6"],
      // Хэмжигдэхүүн ба статистик
      [364,"Уртын нэгж","locked","📏","6"],
      [365,"Талбайн нэгж","locked","⬛","6"],
      [366,"Эзлэхүүний нэгж","locked","📦","6"],
      [367,"Массын нэгж","locked","⚖️","6"],
      [368,"Цаг хугацаа","locked","⏰","6"],
      [369,"Өгөгдөл, хүснэгт, диаграм","locked","📊","6"],
      [370,"Дундаж утга","locked","📈","6"],
      [371,"Магадлалын эхэн ойлголт","locked","🎲","6"],
      // Нэгжийн шалгалтууд
      [372,"📝 Шалгалт: Натурал тоо ба хуваагдал","locked","📝","6"],
      [373,"📝 Шалгалт: Энгийн бутархай","locked","📝","6"],
      [374,"📝 Шалгалт: Аравтын бутархай","locked","📝","6"],
      [375,"📝 Шалгалт: Хувь ба харьцаа","locked","📝","6"],
      [376,"📝 Шалгалт: Сөрөг тоо ба координат","locked","📝","6"],
      [377,"📝 Шалгалт: Илэрхийлэл ба тэгшитгэл","locked","📝","6"],
      [378,"📝 Шалгалт: Геометр","locked","📝","6"],
      [379,"📝 Шалгалт: Хэмжигдэхүүн ба статистик","locked","📝","6"],
    ];
    await pool.query("DELETE FROM nodes WHERE grade='6' AND id < 300");
    for (const [id, name, type, icon, grade] of grade6Nodes) {
      await pool.query(
        'INSERT INTO nodes (id, name, type, icon, grade, sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
        [id, name, type, icon, grade, id]
      );
    }


    // Questions seed
    const seedQuestions = [
  {
    "node_id": 1,
    "text": "2³ = ?",
    "choices": [
      "6",
      "8",
      "12",
      "16"
    ],
    "correct": "8",
    "hint": "2×2×2=8"
  },
  {
    "node_id": 1,
    "text": "3⁴ = ?",
    "choices": [
      "12",
      "27",
      "81",
      "64"
    ],
    "correct": "81",
    "hint": "3×3×3×3=81"
  },
  {
    "node_id": 1,
    "text": "(-2)³ = ?",
    "choices": [
      "8",
      "-8",
      "6",
      "-6"
    ],
    "correct": "-8",
    "hint": "(-2)×(-2)×(-2)=-8"
  },
  {
    "node_id": 1,
    "text": "a⁰ = ? (a≠0)",
    "choices": [
      "0",
      "a",
      "1",
      "-1"
    ],
    "correct": "1",
    "hint": "Аливаа тэгш бус тооны 0-р зэрэг 1"
  },
  {
    "node_id": 1,
    "text": "2⁻² = ?",
    "choices": [
      "1/4",
      "-4",
      "1/2",
      "-1/4"
    ],
    "correct": "1/4",
    "hint": "1/2²=1/4"
  },
  {
    "node_id": 1,
    "text": "5² × 5³ = ?",
    "choices": [
      "5⁵",
      "5⁶",
      "25⁵",
      "5"
    ],
    "correct": "5⁵",
    "hint": "Зэрэг нэмнэ: 5⁵"
  },
  {
    "node_id": 1,
    "text": "a³ ÷ a² = ?",
    "choices": [
      "a²",
      "a",
      "1",
      "a⁶"
    ],
    "correct": "a",
    "hint": "Зэрэг хасна: a¹=a"
  },
  {
    "node_id": 1,
    "text": "(2³)² = ?",
    "choices": [
      "2⁵",
      "2⁶",
      "64",
      "32"
    ],
    "correct": "64",
    "hint": "2^(3×2)=2⁶=64"
  },
  {
    "node_id": 1,
    "text": "10⁻³ = ?",
    "choices": [
      "1000",
      "100",
      "0.001",
      "0.01"
    ],
    "correct": "0.001",
    "hint": "1/1000=0.001"
  },
  {
    "node_id": 1,
    "text": "(-1)¹⁰⁰ = ?",
    "choices": [
      "-1",
      "0",
      "1",
      "100"
    ],
    "correct": "1",
    "hint": "Тэгш зэрэг → эерэг: 1"
  },
  {
    "node_id": 2,
    "text": "0.00045 стандарт хэлбэрт: ?",
    "choices": [
      "4.5×10⁻⁴",
      "45×10⁻⁵",
      "0.45×10⁻³",
      "4.5×10⁴"
    ],
    "correct": "4.5×10⁻⁴",
    "hint": "4.5×10⁻⁴"
  },
  {
    "node_id": 2,
    "text": "3.2×10³ = ?",
    "choices": [
      "320",
      "3200",
      "32000",
      "0.0032"
    ],
    "correct": "3200",
    "hint": "3200"
  },
  {
    "node_id": 2,
    "text": "6.7×10⁻² = ?",
    "choices": [
      "67",
      "0.67",
      "0.067",
      "0.0067"
    ],
    "correct": "0.067",
    "hint": "0.067"
  },
  {
    "node_id": 2,
    "text": "450000 стандарт хэлбэрт: ?",
    "choices": [
      "4.5×10⁵",
      "45×10⁴",
      "0.45×10⁶",
      "4.5×10⁶"
    ],
    "correct": "4.5×10⁵",
    "hint": "4.5×10⁵"
  },
  {
    "node_id": 2,
    "text": "1.2×10³ + 3.4×10³ = ?",
    "choices": [
      "4.6×10³",
      "4.6×10⁶",
      "46×10²",
      "4.6×10²"
    ],
    "correct": "4.6×10³",
    "hint": "4.6×10³"
  },
  {
    "node_id": 2,
    "text": "(2×10³)² = ?",
    "choices": [
      "4×10⁶",
      "4×10⁹",
      "2×10⁶",
      "4×10⁵"
    ],
    "correct": "4×10⁶",
    "hint": "4×10⁶"
  },
  {
    "node_id": 2,
    "text": "0.000001 = ?",
    "choices": [
      "1×10⁻⁵",
      "1×10⁻⁶",
      "10⁻⁷",
      "1×10⁶"
    ],
    "correct": "1×10⁻⁶",
    "hint": "1×10⁻⁶"
  },
  {
    "node_id": 2,
    "text": "2.5×10² × 4×10³ = ?",
    "choices": [
      "10×10⁵",
      "10⁵",
      "10⁶",
      "2.5×10⁶"
    ],
    "correct": "10⁵",
    "hint": "10⁵=100000"
  },
  {
    "node_id": 2,
    "text": "Дэлхийн масс 6×10²⁴ кг. Сар 7.3×10²² кг. Ялгаа: ?",
    "choices": [
      "6×10²⁴",
      "7.3×10²²",
      "5.9×10²⁴",
      "6.7×10²⁴"
    ],
    "correct": "6×10²⁴",
    "hint": "≈6×10²⁴"
  },
  {
    "node_id": 2,
    "text": "n = ? (8000 = 8×10ⁿ)",
    "choices": [
      "2",
      "3",
      "4",
      "5"
    ],
    "correct": "3",
    "hint": "3"
  },
  {
    "node_id": 3,
    "text": "√64 = ?",
    "choices": [
      "6",
      "7",
      "8",
      "9"
    ],
    "correct": "8",
    "hint": "8×8=64"
  },
  {
    "node_id": 3,
    "text": "∛27 = ?",
    "choices": [
      "3",
      "9",
      "6",
      "27"
    ],
    "correct": "3",
    "hint": "3×3×3=27"
  },
  {
    "node_id": 3,
    "text": "√144 = ?",
    "choices": [
      "11",
      "12",
      "13",
      "14"
    ],
    "correct": "12",
    "hint": "12×12=144"
  },
  {
    "node_id": 3,
    "text": "√(−4) = ?",
    "choices": [
      "−2",
      "2",
      "байхгүй",
      "4"
    ],
    "correct": "байхгүй",
    "hint": "Бодит тооны хязгаарт байхгүй"
  },
  {
    "node_id": 3,
    "text": "∛125 = ?",
    "choices": [
      "3",
      "5",
      "25",
      "125"
    ],
    "correct": "5",
    "hint": "5×5×5=125"
  },
  {
    "node_id": 3,
    "text": "√(0.25) = ?",
    "choices": [
      "0.025",
      "0.5",
      "2.5",
      "5"
    ],
    "correct": "0.5",
    "hint": "0.5×0.5=0.25"
  },
  {
    "node_id": 3,
    "text": "√(1/9) = ?",
    "choices": [
      "1/3",
      "1/9",
      "3",
      "9"
    ],
    "correct": "1/3",
    "hint": "1/3"
  },
  {
    "node_id": 3,
    "text": "∛(−8) = ?",
    "choices": [
      "−2",
      "2",
      "−4",
      "4"
    ],
    "correct": "−2",
    "hint": "(−2)³=−8"
  },
  {
    "node_id": 3,
    "text": "√(4/25) = ?",
    "choices": [
      "2/5",
      "4/5",
      "1/5",
      "2/25"
    ],
    "correct": "2/5",
    "hint": "2/5"
  },
  {
    "node_id": 3,
    "text": "⁴√16 = ?",
    "choices": [
      "2",
      "4",
      "8",
      "16"
    ],
    "correct": "2",
    "hint": "2⁴=16"
  },
  {
    "node_id": 4,
    "text": "√12 = ?",
    "choices": [
      "2√3",
      "3√2",
      "4√3",
      "√6"
    ],
    "correct": "2√3",
    "hint": "√(4×3)=2√3"
  },
  {
    "node_id": 4,
    "text": "√50 = ?",
    "choices": [
      "5√2",
      "25√2",
      "√25",
      "10√5"
    ],
    "correct": "5√2",
    "hint": "√(25×2)=5√2"
  },
  {
    "node_id": 4,
    "text": "√2 × √8 = ?",
    "choices": [
      "2",
      "4",
      "√10",
      "16"
    ],
    "correct": "4",
    "hint": "√16=4"
  },
  {
    "node_id": 4,
    "text": "3√2 + 5√2 = ?",
    "choices": [
      "8√4",
      "8√2",
      "15√2",
      "√10"
    ],
    "correct": "8√2",
    "hint": "8√2"
  },
  {
    "node_id": 4,
    "text": "√18 − √2 = ?",
    "choices": [
      "2√2",
      "√16",
      "4√2",
      "√20"
    ],
    "correct": "2√2",
    "hint": "3√2−√2=2√2"
  },
  {
    "node_id": 4,
    "text": "√(a²b) = ?",
    "choices": [
      "a√b",
      "a²√b",
      "ab",
      "a²b"
    ],
    "correct": "a√b",
    "hint": "a√b (a≥0)"
  },
  {
    "node_id": 4,
    "text": "√75 = ?",
    "choices": [
      "5√3",
      "3√5",
      "25√3",
      "√25"
    ],
    "correct": "5√3",
    "hint": "√(25×3)=5√3"
  },
  {
    "node_id": 4,
    "text": "(√5)² = ?",
    "choices": [
      "√5",
      "5",
      "25",
      "10"
    ],
    "correct": "5",
    "hint": "5"
  },
  {
    "node_id": 4,
    "text": "√(9×4) = ?",
    "choices": [
      "6",
      "12",
      "3×4",
      "36"
    ],
    "correct": "6",
    "hint": "√36=6"
  },
  {
    "node_id": 4,
    "text": "1/√2 рационалчлах: ?",
    "choices": [
      "√2",
      "√2/2",
      "1/2",
      "2/√2"
    ],
    "correct": "√2/2",
    "hint": "√2/2"
  },
  {
    "node_id": 5,
    "text": "3x + 2x = ?",
    "choices": [
      "5x",
      "5x²",
      "6x",
      "x⁵"
    ],
    "correct": "5x",
    "hint": "(3+2)x=5x"
  },
  {
    "node_id": 5,
    "text": "x²+2x−3: зэрэг хэд вэ?",
    "choices": [
      "1",
      "2",
      "3",
      "−3"
    ],
    "correct": "2",
    "hint": "2"
  },
  {
    "node_id": 5,
    "text": "5x³−2x²+x−7: гишүүдийн тоо?",
    "choices": [
      "3",
      "4",
      "5",
      "7"
    ],
    "correct": "4",
    "hint": "4"
  },
  {
    "node_id": 5,
    "text": "2x+3 + 4x−1 = ?",
    "choices": [
      "6x+2",
      "6x+4",
      "2x+2",
      "8x+2"
    ],
    "correct": "6x+2",
    "hint": "6x+2"
  },
  {
    "node_id": 5,
    "text": "x²+x+1 утга x=2 үед: ?",
    "choices": [
      "4",
      "5",
      "6",
      "7"
    ],
    "correct": "7",
    "hint": "7"
  },
  {
    "node_id": 5,
    "text": "Хоёр гишүүнт гэж юу вэ?",
    "choices": [
      "1 гишүүнт",
      "2 гишүүнт",
      "3 гишүүнт",
      "4 гишүүнт"
    ],
    "correct": "2 гишүүнт",
    "hint": "2 гишүүнтэй олон гишүүнт"
  },
  {
    "node_id": 5,
    "text": "−3x⁴ гишүүний коэффициент: ?",
    "choices": [
      "3",
      "−3",
      "4",
      "x"
    ],
    "correct": "−3",
    "hint": "−3"
  },
  {
    "node_id": 5,
    "text": "3x²−3x²= ?",
    "choices": [
      "6x²",
      "0",
      "x²",
      "3"
    ],
    "correct": "0",
    "hint": "0"
  },
  {
    "node_id": 5,
    "text": "(x²+2x) + (x²−2x) = ?",
    "choices": [
      "2x²",
      "4x²",
      "0",
      "2x²+4x"
    ],
    "correct": "2x²",
    "hint": "2x²"
  },
  {
    "node_id": 5,
    "text": "2a+3b−a+b = ?",
    "choices": [
      "a+4b",
      "3a+4b",
      "a+2b",
      "3a+2b"
    ],
    "correct": "a+4b",
    "hint": "a+4b"
  },
  {
    "node_id": 6,
    "text": "(x²+3x) + (2x²−x) = ?",
    "choices": [
      "3x²+2x",
      "3x²+4x",
      "x²+2x",
      "3x²−2x"
    ],
    "correct": "3x²+2x",
    "hint": "3x²+2x"
  },
  {
    "node_id": 6,
    "text": "(5x−3) − (2x+1) = ?",
    "choices": [
      "3x−4",
      "3x−2",
      "7x−2",
      "3x+4"
    ],
    "correct": "3x−4",
    "hint": "3x−4"
  },
  {
    "node_id": 6,
    "text": "(x²+x+1) + (x²−x−1) = ?",
    "choices": [
      "2x²",
      "2x²+2",
      "0",
      "2"
    ],
    "correct": "2x²",
    "hint": "2x²"
  },
  {
    "node_id": 6,
    "text": "(2a+b) − (a−b) = ?",
    "choices": [
      "a+2b",
      "a",
      "3a",
      "a−2b"
    ],
    "correct": "a+2b",
    "hint": "a+2b"
  },
  {
    "node_id": 6,
    "text": "(3x+2y) + (x−y) = ?",
    "choices": [
      "4x+y",
      "4x+3y",
      "2x+y",
      "4x−y"
    ],
    "correct": "4x+y",
    "hint": "4x+y"
  },
  {
    "node_id": 6,
    "text": "(x³+x) − (x³−x) = ?",
    "choices": [
      "0",
      "2x",
      "2x³",
      "x"
    ],
    "correct": "2x",
    "hint": "2x"
  },
  {
    "node_id": 6,
    "text": "Хоёр олон гишүүнтийн нийлбэрийг хэрхэн олох вэ?",
    "choices": [
      "Гишүүдийг үржүүлнэ",
      "Ижил гишүүнийг нэмнэ",
      "Хуваана",
      "Зэргийг нэмнэ"
    ],
    "correct": "Ижил гишүүнийг нэмнэ",
    "hint": "Ижил гишүүнийг нэмнэ"
  },
  {
    "node_id": 6,
    "text": "(−3x+2) + (3x−2) = ?",
    "choices": [
      "0",
      "6x",
      "−6x",
      "4"
    ],
    "correct": "0",
    "hint": "0"
  },
  {
    "node_id": 6,
    "text": "(x²+5) − (x²+5) = ?",
    "choices": [
      "x²",
      "5",
      "0",
      "10"
    ],
    "correct": "0",
    "hint": "0"
  },
  {
    "node_id": 6,
    "text": "(2x²+3x−1) − (x²−x+2) = ?",
    "choices": [
      "x²+4x−3",
      "x²+2x−3",
      "3x²+2x−3",
      "x²+4x+3"
    ],
    "correct": "x²+4x−3",
    "hint": "x²+4x−3"
  },
  {
    "node_id": 7,
    "text": "2x(x+3) = ?",
    "choices": [
      "2x²+6",
      "2x+6x",
      "2x²+6x",
      "6x²+6x"
    ],
    "correct": "2x²+6x",
    "hint": "2x²+6x"
  },
  {
    "node_id": 7,
    "text": "(x+2)(x+3) = ?",
    "choices": [
      "x²+5x+6",
      "x²+6x+5",
      "x²+5x+5",
      "x²+6"
    ],
    "correct": "x²+5x+6",
    "hint": "x²+5x+6"
  },
  {
    "node_id": 7,
    "text": "(x−1)(x+1) = ?",
    "choices": [
      "x²+1",
      "x²−1",
      "x−1",
      "x²"
    ],
    "correct": "x²−1",
    "hint": "x²−1"
  },
  {
    "node_id": 7,
    "text": "3x(2x−5) = ?",
    "choices": [
      "6x²−15x",
      "6x²+15x",
      "6x−15",
      "5x²−15x"
    ],
    "correct": "6x²−15x",
    "hint": "6x²−15x"
  },
  {
    "node_id": 7,
    "text": "(2x+1)(x−3) = ?",
    "choices": [
      "2x²−5x−3",
      "2x²+5x−3",
      "2x²−5x+3",
      "x²−5x−3"
    ],
    "correct": "2x²−5x−3",
    "hint": "2x²−5x−3"
  },
  {
    "node_id": 7,
    "text": "(a+b)(c+d) = ?",
    "choices": [
      "ac+bd",
      "ac+ad+bc+bd",
      "abcd",
      "ac+bc"
    ],
    "correct": "ac+ad+bc+bd",
    "hint": "ac+ad+bc+bd"
  },
  {
    "node_id": 7,
    "text": "x²(x+1) = ?",
    "choices": [
      "x³+x²",
      "x²+x",
      "x³+x",
      "x³+1"
    ],
    "correct": "x³+x²",
    "hint": "x³+x²"
  },
  {
    "node_id": 7,
    "text": "(x+3)² = ?",
    "choices": [
      "x²+9",
      "x²+6x+9",
      "x²+3x+9",
      "x²+6x+3"
    ],
    "correct": "x²+6x+9",
    "hint": "x²+6x+9"
  },
  {
    "node_id": 7,
    "text": "−2(x−4) = ?",
    "choices": [
      "−2x−8",
      "−2x+8",
      "2x−8",
      "2x+8"
    ],
    "correct": "−2x+8",
    "hint": "−2x+8"
  },
  {
    "node_id": 7,
    "text": "(x+y)(x−y) = ?",
    "choices": [
      "x²+y²",
      "x²−xy",
      "x²−y²",
      "(x−y)²"
    ],
    "correct": "x²−y²",
    "hint": "x²−y²"
  },
  {
    "node_id": 8,
    "text": "(a+b)² = ?",
    "choices": [
      "a²+b²",
      "a²+2ab+b²",
      "a²+ab+b²",
      "(a+b)(a+b)"
    ],
    "correct": "a²+2ab+b²",
    "hint": "a²+2ab+b²"
  },
  {
    "node_id": 8,
    "text": "(a−b)² = ?",
    "choices": [
      "a²−b²",
      "a²+2ab+b²",
      "a²−2ab+b²",
      "a²−2ab−b²"
    ],
    "correct": "a²−2ab+b²",
    "hint": "a²−2ab+b²"
  },
  {
    "node_id": 8,
    "text": "(a+b)(a−b) = ?",
    "choices": [
      "a²+b²",
      "a²−ab",
      "a²−b²",
      "a+b"
    ],
    "correct": "a²−b²",
    "hint": "a²−b²"
  },
  {
    "node_id": 8,
    "text": "(3+x)² = ?",
    "choices": [
      "9+x²",
      "9+6x+x²",
      "3+6x+x²",
      "9+3x+x²"
    ],
    "correct": "9+6x+x²",
    "hint": "9+6x+x²"
  },
  {
    "node_id": 8,
    "text": "(5−y)² = ?",
    "choices": [
      "25+y²",
      "25−y²",
      "25−10y+y²",
      "25+10y+y²"
    ],
    "correct": "25−10y+y²",
    "hint": "25−10y+y²"
  },
  {
    "node_id": 8,
    "text": "49−x² задлах: ?",
    "choices": [
      "(7+x)(7−x)",
      "7(7−x)",
      "(x+7)²",
      "(7−x)²"
    ],
    "correct": "(7+x)(7−x)",
    "hint": "(7+x)(7−x)"
  },
  {
    "node_id": 8,
    "text": "x²+10x+25 = ?",
    "choices": [
      "(x+5)²",
      "(x+10)²",
      "(x+5)(x−5)",
      "x(x+10)"
    ],
    "correct": "(x+5)²",
    "hint": "(x+5)²"
  },
  {
    "node_id": 8,
    "text": "(2a+3b)² = ?",
    "choices": [
      "4a²+9b²",
      "4a²+6ab+9b²",
      "4a²+12ab+9b²",
      "2a²+12ab+3b²"
    ],
    "correct": "4a²+12ab+9b²",
    "hint": "4a²+12ab+9b²"
  },
  {
    "node_id": 8,
    "text": "4x²−9 задлах: ?",
    "choices": [
      "(2x+3)(2x−3)",
      "(2x−3)²",
      "2(2x²−9)",
      "(4x+3)(x−3)"
    ],
    "correct": "(2x+3)(2x−3)",
    "hint": "(2x+3)(2x−3)"
  },
  {
    "node_id": 8,
    "text": "a²+2a+1 задлах: ?",
    "choices": [
      "(a+1)(a−1)",
      "(a+1)²",
      "(a−1)²",
      "a(a+2)"
    ],
    "correct": "(a+1)²",
    "hint": "(a+1)²"
  },
  {
    "node_id": 9,
    "text": "x²−4 задлах: ?",
    "choices": [
      "(x+2)(x−2)",
      "(x+2)²",
      "(x−2)²",
      "x(x−4)"
    ],
    "correct": "(x+2)(x−2)",
    "hint": "(x+2)(x−2)"
  },
  {
    "node_id": 9,
    "text": "x²+5x+6 задлах: ?",
    "choices": [
      "(x+2)(x+3)",
      "(x+1)(x+6)",
      "(x+2)(x+4)",
      "(x+3)²"
    ],
    "correct": "(x+2)(x+3)",
    "hint": "(x+2)(x+3)"
  },
  {
    "node_id": 9,
    "text": "x²−7x+12 задлах: ?",
    "choices": [
      "(x−3)(x+4)",
      "(x+3)(x−4)",
      "(x−3)(x−4)",
      "(x−12)(x+1)"
    ],
    "correct": "(x−3)(x−4)",
    "hint": "(x−3)(x−4)"
  },
  {
    "node_id": 9,
    "text": "6x+9 задлах: ?",
    "choices": [
      "3(2x+3)",
      "6(x+3)",
      "3x(2+3)",
      "2(3x+9)"
    ],
    "correct": "3(2x+3)",
    "hint": "3(2x+3)"
  },
  {
    "node_id": 9,
    "text": "x²−x задлах: ?",
    "choices": [
      "x(x+1)",
      "x(x−1)",
      "x²(1−x)",
      "x(1−x)"
    ],
    "correct": "x(x−1)",
    "hint": "x(x−1)"
  },
  {
    "node_id": 9,
    "text": "x³−x задлах: ?",
    "choices": [
      "x(x−1)",
      "x(x+1)",
      "x(x+1)(x−1)",
      "x(x²−1)"
    ],
    "correct": "x(x+1)(x−1)",
    "hint": "x(x+1)(x−1)"
  },
  {
    "node_id": 9,
    "text": "x²+2x задлах: ?",
    "choices": [
      "x(x+2)",
      "2x(x+1)",
      "x²(1+2)",
      "x(x+1)"
    ],
    "correct": "x(x+2)",
    "hint": "x(x+2)"
  },
  {
    "node_id": 9,
    "text": "2x²−8 задлах: ?",
    "choices": [
      "2(x+2)(x−2)",
      "2(x²−4)",
      "(2x+4)(x−2)",
      "2x(x−4)"
    ],
    "correct": "2(x+2)(x−2)",
    "hint": "2(x+2)(x−2)"
  },
  {
    "node_id": 9,
    "text": "x²−9 задлах: ?",
    "choices": [
      "(x+3)(x−3)",
      "(x+3)²",
      "(x−3)²",
      "x(x−9)"
    ],
    "correct": "(x+3)(x−3)",
    "hint": "(x+3)(x−3)"
  },
  {
    "node_id": 9,
    "text": "ax+ay задлах: ?",
    "choices": [
      "a(x+y)",
      "ax(1+y)",
      "a²xy",
      "ax+ay"
    ],
    "correct": "a(x+y)",
    "hint": "a(x+y)"
  },
  {
    "node_id": 10,
    "text": "x/x = ? (x≠0)",
    "choices": [
      "x",
      "0",
      "1",
      "x²"
    ],
    "correct": "1",
    "hint": "1"
  },
  {
    "node_id": 10,
    "text": "Алгебрийн бутархай тодорхойлогдохгүй хэзээ?",
    "choices": [
      "Тооллогч 0 үед",
      "Хуваарь 0 үед",
      "x=1 үед",
      "Үргэлж"
    ],
    "correct": "Хуваарь 0 үед",
    "hint": "Хуваарь 0 үед"
  },
  {
    "node_id": 10,
    "text": "1/2 + 1/3 = ?",
    "choices": [
      "2/5",
      "1/6",
      "5/6",
      "2/6"
    ],
    "correct": "5/6",
    "hint": "5/6"
  },
  {
    "node_id": 10,
    "text": "2/x + 3/x = ?",
    "choices": [
      "5/x",
      "5/x²",
      "6/x",
      "5x"
    ],
    "correct": "5/x",
    "hint": "5/x"
  },
  {
    "node_id": 10,
    "text": "(x+1)/1 = ?",
    "choices": [
      "1",
      "x",
      "x+1",
      "x−1"
    ],
    "correct": "x+1",
    "hint": "x+1"
  },
  {
    "node_id": 10,
    "text": "x/(x+1)-ийн тодорхойлолтын муж: ?",
    "choices": [
      "x≠0",
      "x≠1",
      "x≠−1",
      "x≠2"
    ],
    "correct": "x≠−1",
    "hint": "x≠−1"
  },
  {
    "node_id": 10,
    "text": "a/b хэзээ = 0 вэ?",
    "choices": [
      "a=0",
      "b=0",
      "a=b",
      "a=0, b≠0"
    ],
    "correct": "a=0, b≠0",
    "hint": "a=0, b≠0 үед"
  },
  {
    "node_id": 10,
    "text": "3/4 ÷ 3/8 = ?",
    "choices": [
      "1/2",
      "3/4",
      "2",
      "8"
    ],
    "correct": "2",
    "hint": "2"
  },
  {
    "node_id": 10,
    "text": "2/(x−1) тодорхойлолтын муж: ?",
    "choices": [
      "x≠0",
      "x≠1",
      "x≠2",
      "x≠−1"
    ],
    "correct": "x≠1",
    "hint": "x≠1"
  },
  {
    "node_id": 10,
    "text": "(x²−1)/(x−1) = ? (x≠1)",
    "choices": [
      "x−1",
      "x+1",
      "x²+1",
      "1"
    ],
    "correct": "x+1",
    "hint": "x+1"
  }
];
    const existingQ = await pool.query('SELECT text, node_id FROM questions');
    const existingSet = new Set(existingQ.rows.map(r => r.node_id + '|' + r.text));
    let addedQ = 0;
    for (const q of seedQuestions) {
      const key = q.node_id + '|' + q.text;
      if (!existingSet.has(key)) {
        await pool.query(
          'INSERT INTO questions (text, node_id, correct, choices, hint) VALUES ($1,$2,$3,$4,$5)',
          [q.text, q.node_id, q.correct, q.choices, q.hint ? JSON.stringify({text: q.hint}) : null]
        );
        addedQ++;
      }
    }

            res.json({ ok: true, message: `${nodes.length + examNodes.length + grade6Nodes.length} nodes seeded (+" + addedQ + " бодлого) (${grade6Nodes.length} нь 6-р анги)` });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
