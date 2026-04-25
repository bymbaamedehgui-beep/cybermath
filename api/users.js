const pool = require('./_db');
const { sendPremiumEmail, sendFreeEmail } = require('./_email');

function todayStr() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (req.query && req.query.leaderboard) {
        const r = await pool.query('SELECT id,first_name,last_name,xp,avatar,grade,plan FROM users WHERE xp>0 ORDER BY xp DESC LIMIT 20');
        return res.json({ ok: true, users: r.rows });
      }
      const today = todayStr();
      const r = await pool.query(
        `SELECT id,email,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,
                completed_lessons,created_at,current_node_id,activity_log,hearts_empty_time
         FROM users ORDER BY created_at DESC`
      );
      const users = r.rows.map(u => {
        const log = u.activity_log || {};
        const completed = Array.isArray(u.completed_lessons) ? u.completed_lessons.length : 0;
        return {
          ...u,
          today_minutes: log[today] || 0,
          completed_count: completed
        };
      });
      return res.json({ ok: true, users });
    }

    if (req.method === 'PUT') {
      const { email, action, plan, xp, gems, hearts, streak, avatar, completed_lesson,
              stars_data, streak_data, current_node_id, hearts_empty_time, profile_image } = req.body || {};
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

      if (action === 'changePassword') {
        const { oldPassword, newPassword } = req.body;
        const r = await pool.query('SELECT pass FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
        if (r.rows[0].pass !== oldPassword) return res.json({ ok: false, error: 'Одоогийн нууц үг буруу байна' });
        await pool.query('UPDATE users SET pass=$1 WHERE email=$2', [newPassword, email]);
        return res.json({ ok: true });
      }

      if (action === 'addMinutes') {
        const { minutes } = req.body || {};
        const m = parseInt(minutes) || 1;
        const today = todayStr();
        const r = await pool.query('SELECT activity_log FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.json({ ok: false });
        const log = r.rows[0].activity_log || {};
        log[today] = (log[today] || 0) + m;
        await pool.query('UPDATE users SET activity_log=$1 WHERE email=$2', [log, email]);
        return res.json({ ok: true, today: log[today] });
      }

      if (action === 'saveLessonProgress') {
        const { lessonId, progress } = req.body || {};
        if (!lessonId) return res.json({ ok: false });
        const r = await pool.query('SELECT lesson_progress FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.json({ ok: false });
        const map = r.rows[0].lesson_progress || {};
        map[lessonId] = progress;
        await pool.query('UPDATE users SET lesson_progress=$1 WHERE email=$2', [map, email]);
        return res.json({ ok: true });
      }

      if (action === 'clearLessonProgress') {
        const { lessonId } = req.body || {};
        if (!lessonId) return res.json({ ok: false });
        const r = await pool.query('SELECT lesson_progress FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.json({ ok: false });
        const map = r.rows[0].lesson_progress || {};
        delete map[lessonId];
        await pool.query('UPDATE users SET lesson_progress=$1 WHERE email=$2', [map, email]);
        return res.json({ ok: true });
      }

      if (completed_lesson !== undefined) {
        await pool.query(
          `UPDATE users SET completed_lessons = array_append(COALESCE(completed_lessons,'{}'), $1::int)
           WHERE email=$2 AND NOT ($1::int = ANY(COALESCE(completed_lessons,'{}')))`,
          [completed_lesson, email]
        );
      }

      const sets = [];
      const vals = [];
      let i = 1;
      if (plan !== undefined) {
        sets.push(`plan=$${i++}`);
        vals.push(plan);
        if (plan === 'premium') {
          const { premium_until } = req.body || {};
          sets.push(`premium_until=$${i++}`);
          vals.push(premium_until ? new Date(premium_until) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
        } else if (plan === 'free') {
          sets.push(`premium_until=$${i++}`);
          vals.push(null);
        }
      }
      if (xp                !== undefined) { sets.push(`xp=$${i++}`);                vals.push(xp); }
      if (gems              !== undefined) { sets.push(`gems=$${i++}`);              vals.push(gems); }
      if (hearts            !== undefined) { sets.push(`hearts=$${i++}`);            vals.push(hearts); }
      if (streak            !== undefined) { sets.push(`streak=$${i++}`);            vals.push(streak); }
      if (avatar            !== undefined) { sets.push(`avatar=$${i++}`);            vals.push(avatar); }
      if (stars_data        !== undefined) { sets.push(`stars_data=$${i++}`);        vals.push(stars_data); }
      if (streak_data       !== undefined) { sets.push(`streak_data=$${i++}`);       vals.push(streak_data); }
      if (current_node_id   !== undefined) { sets.push(`current_node_id=$${i++}`);   vals.push(current_node_id); }
      if (profile_image     !== undefined) { sets.push(`profile_image=$${i++}`);     vals.push(profile_image); }
      if (hearts_empty_time !== undefined) {
        sets.push(`hearts_empty_time=$${i++}`);
        vals.push(hearts_empty_time === null ? null : new Date(hearts_empty_time));
      }

      if (sets.length) {
        vals.push(email);
        await pool.query(`UPDATE users SET ${sets.join(',')} WHERE email=$${i}`, vals);
      }

      if (plan !== undefined) {
        const u = await pool.query('SELECT first_name FROM users WHERE email=$1', [email]);
        if (u.rows.length) {
          const firstName = u.rows[0].first_name;
          if (plan === 'premium') sendPremiumEmail(email, firstName).catch(()=>{});
          else if (plan === 'free') sendFreeEmail(email, firstName).catch(()=>{});
        }
      }
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { email } = req.body || {};
      await pool.query('DELETE FROM users WHERE email=$1', [email]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
