/* MATH MORTAL — ШИЛДЭГИЙН ХҮСНЭГТ.
 *
 * Хэн хэддүгээр ҮЕ (1–10) хүртэл явснаар эрэмбэлнэ. Ижил үе дээр оноогоор.
 * Сервер: /api/arena  (GET → шилдэг 10, POST → өөрийн дүнг бүртгэнэ).
 * Нэвтрээгүй бол зөвхөн хүснэгтийг үзнэ — дүн бүртгэгдэхгүй.
 */
const API_BASE = (typeof location !== 'undefined' && /cyber-math|localhost|127\.0\.0\.1/.test(location.host))
  ? '' : 'https://cyber-math.com';

export const MAX_WAVE = 10;

function token() {
  try { return localStorage.getItem('cm_token') || ''; } catch { return ''; }
}

function el(id) { return document.getElementById(id); }

function row(r, i, mine) {
  const li = document.createElement('li');
  li.className = 'lb-row' + (mine ? ' lb-me' : '');
  const place = document.createElement('span');
  place.className = 'lb-place';
  place.textContent = String(i + 1);
  const name = document.createElement('span');
  name.className = 'lb-name';
  name.textContent = r.name || 'Тоглогч';
  const lvl = document.createElement('span');
  lvl.className = 'lb-lvl';
  lvl.textContent = 'ҮЕ ' + r.level;
  const sc = document.createElement('span');
  sc.className = 'lb-score';
  sc.textContent = String(r.score ?? 0);
  li.append(place, name, lvl, sc);
  return li;
}

function note(text) {
  const n = el('lb-note');
  if (n) n.textContent = text || '';
}

/* Хүснэгтийг татаж дэлгэцэнд гаргана */
export async function lbLoad() {
  const list = el('lb-list');
  if (!list) return;
  /* Өргөн дэлгэцэд хүснэгт нээлттэй; утсан дээр хураалттай — товч доош түлхэгдэхгүй */
  const box = el('lb');
  if (box && !box.dataset.init) { box.dataset.init = '1'; box.open = window.innerWidth > 700; }
  list.textContent = '';
  const wait = document.createElement('li');
  wait.className = 'lb-empty';
  wait.textContent = 'Ачааллаж байна…';
  list.appendChild(wait);
  try {
    const h = {};
    const t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    const r = await fetch(`${API_BASE}/api/arena`, { headers: h });
    const d = await r.json();
    const top = (d && d.top) || [];
    list.textContent = '';
    if (!top.length) {
      const e = document.createElement('li');
      e.className = 'lb-empty';
      e.textContent = 'Хараахан бүртгэл байхгүй — эхний байрыг эзэл!';
      list.appendChild(e);
    } else {
      top.forEach((x, i) => list.appendChild(row(x, i, d.me && d.me.rank === i + 1)));
    }
    if (!t) note('Нэвтэрвэл өөрийн дүн хүснэгтэд бүртгэгдэнэ.');
    else if (d && d.me) note(`Таны дүн: ҮЕ ${d.me.level} · ${d.me.score} оноо · ${d.me.rank}-р байр`);
    else note('Тулалдаад өөрийн дүнг бүртгүүл.');
  } catch {
    list.textContent = '';
    const e = document.createElement('li');
    e.className = 'lb-empty';
    e.textContent = 'Хүснэгтийг татаж чадсангүй.';
    list.appendChild(e);
    note('');
  }
}

/* Тулаан дуусахад дүнг бүртгэнэ. Нэвтрээгүй бол зүгээр л алгасна. */
export async function lbSubmit(level, score) {
  const t = token();
  const lvl = Math.max(1, Math.min(MAX_WAVE, Math.round(Number(level) || 1)));
  if (!t) { note('Нэвтэрвэл дүн бүртгэгдэнэ. Таны үе: ҮЕ ' + lvl); return null; }
  try {
    const r = await fetch(`${API_BASE}/api/arena`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ level: lvl, score: Math.max(0, Math.round(Number(score) || 0)) })
    });
    const d = await r.json();
    if (d && d.ok) { const box = el('lb'); if (box) box.open = true; await lbLoad(); return d; }
    note((d && d.error) || 'Дүн бүртгэгдсэнгүй.');
  } catch { note('Дүн бүртгэхэд сүлжээний алдаа.'); }
  return null;
}
