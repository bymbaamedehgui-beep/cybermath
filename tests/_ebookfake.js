// Цахим номын хүснэгтүүд (api/_ebook.js — ws_ebooks, ws_ebook_parts) санах ойд: tests/ebook.test.js ба локал шалгалтын сервер.
// Бодит DB руу ХЭЗЭЭ Ч хандахгүй. create() → { query, db } — query(sql, params) нь pg-ийн { rows }-тэй ижил.
'use strict';
function create() {
  const db = { books: new Map(), parts: new Map(), sql: [] };      // parts: 'key|up|i' → { key, up, i, data, at }
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  async function query(sql, p) {
    p = p || [];
    const q = norm(sql);
    db.sql.push(q);
    if (/^CREATE TABLE IF NOT EXISTS ws_ebook(s|_parts) /.test(q)) return { rows: [] };
    if (q === 'SELECT up, n, pages, label, paper, updated_at FROM ws_ebooks WHERE key=$1') {
      const b = db.books.get(p[0]); return { rows: b ? [Object.assign({}, b)] : [] };
    }
    if (/^SELECT p\.data FROM ws_ebook_parts p JOIN ws_ebooks e ON e\.key=p\.key AND e\.up=p\.up WHERE p\.key=\$1 AND p\.up=\$2 AND p\.i=\$3$/.test(q)) {
      const b = db.books.get(p[0]), x = db.parts.get(p[0] + '|' + p[1] + '|' + p[2]);
      return { rows: b && b.up === p[1] && x ? [{ data: x.data }] : [] };
    }
    if (/^INSERT INTO ws_ebook_parts \(key, up, i, data\) VALUES \(\$1,\$2,\$3,\$4\) ON CONFLICT \(key, up, i\) DO UPDATE /.test(q)) {
      db.parts.set(p[0] + '|' + p[1] + '|' + p[2], { key: p[0], up: p[1], i: p[2], data: Buffer.from(p[3]), at: Date.now() }); return { rows: [] };
    }
    if (q === 'SELECT i, octet_length(data) AS sz FROM ws_ebook_parts WHERE key=$1 AND up=$2') {
      return { rows: Array.from(db.parts.values()).filter((x) => x.key === p[0] && x.up === p[1]).map((x) => ({ i: x.i, sz: x.data.length })) };
    }
    if (/^INSERT INTO ws_ebooks \(key, up, n, pages, label, paper, bytes, updated_at\) VALUES /.test(q)) {
      db.books.set(p[0], { up: p[1], n: p[2], pages: p[3], label: p[4], paper: p[5], bytes: p[6], updated_at: new Date().toISOString() }); return { rows: [] };
    }
    if (q === 'DELETE FROM ws_ebook_parts WHERE key=$1 AND up<>$2') {
      for (const [k, x] of db.parts) if (x.key === p[0] && x.up !== p[1]) db.parts.delete(k);
      return { rows: [] };
    }
    if (/^DELETE FROM ws_ebook_parts p WHERE p\.created_at < NOW\(\) - INTERVAL '2 days' AND NOT EXISTS /.test(q)) return { rows: [] };
    throw new Error('ebook fake: тодорхойгүй SQL ' + q);
  }
  return { query, db };
}
module.exports = { create };
