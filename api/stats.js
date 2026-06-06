const pool = require('./_db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

function verifyToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try { return jwt.verify(auth.slice(7), JWT_SECRET); } catch (e) { return null; }
}

function requireAdmin(req) {
  const decoded = verifyToken(req);
  if (!decoded || !decoded.admin) return { ok: false, error: 'Зөвхөн админ' };
  return { ok: true };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const adminCheck = requireAdmin(req);
  if (!adminCheck.ok) return res.status(403).json({ ok: false, error: adminCheck.error });

  try {
    const q1 = async (sql) => {
      try { const r = await pool.query(sql); return parseInt((r.rows[0] || {}).c || 0); }
      catch (e) { return null; }
    };
    const qAll = async (sql) => {
      try { return (await pool.query(sql)).rows; } catch (e) { return []; }
    };

    const stats = {};

    // ── ХЭРЭГЛЭГЧИД ──
    stats.users = {
      total: await q1(`SELECT COUNT(*) AS c FROM users WHERE verified=true`),
      total_all: await q1(`SELECT COUNT(*) AS c FROM users`),
      premium: await q1(`SELECT COUNT(*) AS c FROM users WHERE plan='premium'`),
      free: await q1(`SELECT COUNT(*) AS c FROM users WHERE plan='free' AND verified=true`),
      teachers: await q1(`SELECT COUNT(*) AS c FROM users WHERE role='teacher' AND verified=true`),
      admins: await q1(`SELECT COUNT(*) AS c FROM users WHERE role='admin'`),
      today: await q1(`SELECT COUNT(*) AS c FROM users WHERE created_at::date = CURRENT_DATE`),
      this_week: await q1(`SELECT COUNT(*) AS c FROM users WHERE created_at > NOW() - INTERVAL '7 days'`),
      this_month: await q1(`SELECT COUNT(*) AS c FROM users WHERE created_at > NOW() - INTERVAL '30 days'`),
      unverified: await q1(`SELECT COUNT(*) AS c FROM users WHERE verified=false`),
      by_grade: (await qAll(`SELECT COALESCE(grade::text,'?') AS grade, COUNT(*) AS c FROM users WHERE verified=true GROUP BY grade ORDER BY grade::text`)).map(r => ({ grade: r.grade, count: parseInt(r.c) })),
      total_xp: await q1(`SELECT COALESCE(SUM(xp),0) AS c FROM users`),
      avg_xp: await q1(`SELECT COALESCE(ROUND(AVG(xp)),0) AS c FROM users WHERE verified=true`),
      max_xp: await q1(`SELECT COALESCE(MAX(xp),0) AS c FROM users`),
      total_gems: await q1(`SELECT COALESCE(SUM(gems),0) AS c FROM users`),
      total_streak: await q1(`SELECT COALESCE(SUM(streak),0) AS c FROM users`),
      total_minutes: await q1(`
        SELECT COALESCE(SUM((val)::numeric), 0)::bigint AS c
        FROM users, jsonb_each_text(COALESCE(activity_log, '{}'::jsonb)) AS j(k, val)
        WHERE val ~ '^[0-9]+(\\.[0-9]+)?$'
      `),
    };

    // ── НОД (хичээл/бүлэг) ──
    stats.nodes = {
      total: await q1(`SELECT COUNT(*) AS c FROM nodes`),
      lessons: await q1(`SELECT COUNT(*) AS c FROM nodes WHERE type='lesson'`),
      with_intro: await q1(`SELECT COUNT(*) AS c FROM nodes WHERE intro_html IS NOT NULL AND intro_html <> ''`),
      by_grade: (await qAll(`SELECT COALESCE(grade::text,'?') AS grade, COUNT(*) AS c FROM nodes WHERE type='lesson' GROUP BY grade ORDER BY grade::text`)).map(r => ({ grade: r.grade, count: parseInt(r.c) })),
    };

    // ── БОДЛОГО ──
    stats.questions = {
      total: await q1(`SELECT COUNT(*) AS c FROM questions`),
      with_image: await q1(`SELECT COUNT(*) AS c FROM questions WHERE image IS NOT NULL AND image <> ''`),
      with_chart: await q1(`SELECT COUNT(*) AS c FROM questions WHERE chart IS NOT NULL AND chart::text <> 'null' AND chart::text <> ''`),
      by_difficulty: (await qAll(`SELECT COALESCE(difficulty,'?') AS difficulty, COUNT(*) AS c FROM questions GROUP BY difficulty ORDER BY difficulty`)).map(r => ({ difficulty: r.difficulty, count: parseInt(r.c) })),
      reports: await q1(`SELECT COUNT(*) AS c FROM question_reports`),
    };

    // ── АНГИ (classrooms) ──
    stats.classrooms = {
      total: await q1(`SELECT COUNT(*) AS c FROM classrooms`),
      members: await q1(`SELECT COUNT(*) AS c FROM classroom_members`),
      competition: await q1(`SELECT COUNT(*) AS c FROM classrooms WHERE competition=true`),
      lesson_attempts: await q1(`SELECT COUNT(*) AS c FROM classroom_lesson_attempts`),
    };

    // ── БАГЦ ХҮСЭЛТ ──
    stats.group_requests = {
      total: await q1(`SELECT COUNT(*) AS c FROM group_requests`),
      pending: await q1(`SELECT COUNT(*) AS c FROM group_requests WHERE status='pending'`),
      quoted: await q1(`SELECT COUNT(*) AS c FROM group_requests WHERE status='quoted'`),
      paid: await q1(`SELECT COUNT(*) AS c FROM group_requests WHERE status='paid'`),
    };

    // ── ПРОМО КОД ──
    stats.promo = {
      total: await q1(`SELECT COUNT(*) AS c FROM promo_codes`),
      active: await q1(`SELECT COUNT(*) AS c FROM promo_codes WHERE expires_at IS NULL OR expires_at > NOW()`),
      redemptions: await q1(`SELECT COUNT(*) AS c FROM promo_redemptions`),
    };

    // ── НӨХӨРЛӨЛ ──
    stats.friendships = {
      accepted: await q1(`SELECT COUNT(*) AS c FROM friendships WHERE status='accepted'`),
      pending: await q1(`SELECT COUNT(*) AS c FROM friendships WHERE status='pending'`),
    };

    // ── ЧАТ ──
    stats.chat = {
      messages_total: await q1(`SELECT COUNT(*) AS c FROM chat_messages`),
      messages_today: await q1(`SELECT COUNT(*) AS c FROM chat_messages WHERE created_at > NOW() - INTERVAL '1 day'`),
    };

    // ── ЛОГИ ──
    stats.logs = {
      total: await q1(`SELECT COUNT(*) AS c FROM logs`),
      today: await q1(`SELECT COUNT(*) AS c FROM logs WHERE created_at > NOW() - INTERVAL '1 day'`),
    };

    // ── ПЭТ (тэжээвэр) ──
    stats.pets = {
      total: await q1(`SELECT COUNT(*) AS c FROM user_pets`),
    };

    // ── ONLINE GAME ──
    stats.online_games = {
      total: await q1(`SELECT COUNT(*) AS c FROM online_games`),
    };

    // ── НИЙТ NULL утгуудыг 0 болгох ──
    Object.keys(stats).forEach(k => {
      Object.keys(stats[k]).forEach(kk => {
        if (stats[k][kk] === null) stats[k][kk] = 0;
      });
    });

    res.json({ ok: true, stats: stats, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[stats]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
