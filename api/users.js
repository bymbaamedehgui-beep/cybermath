const pool = require('./_db');
const { sendPremiumEmail, sendFreeEmail } = require('./_email');

function todayStr() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// Telegram notification helper
async function sendTelegramNotification(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (e) {
    console.log('Telegram error (non-fatal):', e.message);
  }
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
                completed_lessons,created_at,current_node_id,activity_log,hearts_empty_time,verified,role,
                school,aimag,sum,phone
         FROM users WHERE verified=true ORDER BY created_at DESC`
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

      if (action === 'heartbeat') {
        await pool.query('UPDATE users SET last_active_at=NOW() WHERE email=$1', [email]);
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

      // Багш ангид challenge оноох
      if (action === 'assignChallenge') {
        const { classroomId, title, lessons, dueDate } = req.body || {};
        if (!classroomId || !title || !lessons) return res.json({ ok: false, error: 'Missing fields' });
        // Анги доторх бүх сурагчдын challenges-руу нэмэх
        const m = await pool.query('SELECT student_email FROM class_members WHERE classroom_id=$1', [classroomId]);
        const challenge = {
          id: 'ch_' + Date.now(),
          title: title,
          lessons: lessons,
          dueDate: dueDate || null,
          assignedBy: email,
          assignedAt: new Date().toISOString(),
          classroomId: classroomId
        };
        for (const row of m.rows) {
          const u = await pool.query('SELECT challenges FROM users WHERE email=$1', [row.student_email]);
          if (u.rows.length) {
            const list = u.rows[0].challenges || [];
            list.push(challenge);
            await pool.query('UPDATE users SET challenges=$1 WHERE email=$2', [JSON.stringify(list), row.student_email]);
          }
        }
        // Telegram мэдэгдэл
        const teacherInfo = await pool.query('SELECT first_name, last_name FROM users WHERE email=$1', [email]);
        const className = await pool.query('SELECT name FROM classrooms WHERE id=$1', [classroomId]);
        const tName = teacherInfo.rows[0] ? (teacherInfo.rows[0].last_name || '') + ' ' + teacherInfo.rows[0].first_name : email;
        const cName = className.rows[0] ? className.rows[0].name : 'Анги#' + classroomId;
        const msg = `🎯 <b>Багш challenge оноолоо</b>\n\n👨‍🏫 ${tName.trim()}\n🏫 ${cName}\n📝 "${title}"\n📚 ${lessons.length} хичээл (${lessons.join(', ')})\n👥 ${m.rows.length} сурагчид илгээгдлээ${dueDate ? '\n📅 ' + dueDate : ''}`;
        sendTelegramNotification(msg).catch(()=>{});
        return res.json({ ok: true, count: m.rows.length, challenge });
      }

      // Сурагч challenge-ыг харах (хийгдээгүй ба хийсэн нь)
      if (action === 'getChallenges') {
        const r = await pool.query('SELECT challenges, completed_lessons FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.json({ ok: false });
        let list = r.rows[0].challenges || [];
        if (typeof list === 'string') { try { list = JSON.parse(list); } catch(e) { list = []; } }
        const done = r.rows[0].completed_lessons || [];
        // Challenge-ийн ахиц тооцох
        const enriched = list.map(c => {
          const lessonsArr = Array.isArray(c.lessons) ? c.lessons : [];
          const completedCount = lessonsArr.filter(l => done.includes(parseInt(l))).length;
          return Object.assign({}, c, {
            completedCount: completedCount,
            totalCount: lessonsArr.length,
            isComplete: completedCount === lessonsArr.length && lessonsArr.length > 0
          });
        });
        return res.json({ ok: true, challenges: enriched });
      }

      if (completed_lesson !== undefined) {
        await pool.query(
          `UPDATE users SET completed_lessons = array_append(COALESCE(completed_lessons,'{}'), $1::int)
           WHERE email=$2 AND NOT ($1::int = ANY(COALESCE(completed_lessons,'{}')))`,
          [completed_lesson, email]
        );
        // Энэ хичээл нь challenge-д багтаж байгаа эсэхийг шалгах
        try {
          const r = await pool.query('SELECT challenges, completed_lessons, first_name, last_name FROM users WHERE email=$1', [email]);
          if (r.rows.length) {
            let list = r.rows[0].challenges || [];
            if (typeof list === 'string') { try { list = JSON.parse(list); } catch(e) { list = []; } }
            const done = r.rows[0].completed_lessons || [];
            const studentName = ((r.rows[0].last_name || '') + ' ' + (r.rows[0].first_name || '')).trim();
            // Challenge бүрийг шалгах: одоо нэмсэн хичээл challenge-ийн нэг хэсэг үү?
            for (const c of list) {
              const lessons = Array.isArray(c.lessons) ? c.lessons.map(l => parseInt(l)) : [];
              if (!lessons.includes(parseInt(completed_lesson))) continue;
              // Бүх challenge хичээлийг хийж дуусгасан уу?
              const allDone = lessons.every(l => done.includes(l));
              const completedCount = lessons.filter(l => done.includes(l)).length;
              if (allDone) {
                // Challenge бүрэн дуусгасан — багш руу telegram
                const msg = `✅ <b>Сурагч challenge дуусгалаа!</b>\n\n👤 ${studentName || email}\n🎯 "${c.title}"\n📚 ${lessons.length}/${lessons.length} хичээл бүгд хийгдсэн`;
                sendTelegramNotification(msg).catch(()=>{});
              }
            }
          }
        } catch(e) { /* non-fatal */ }
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
        const u = await pool.query('SELECT first_name, last_name FROM users WHERE email=$1', [email]);
        if (u.rows.length) {
          const firstName = u.rows[0].first_name;
          const lastName = u.rows[0].last_name || '';
          if (plan === 'premium') {
            sendPremiumEmail(email, firstName).catch(()=>{});
            // Telegram мэдэгдэл
            const msg = `⭐ <b>Premium худалдаж авлаа!</b>\n\n👤 ${lastName} ${firstName}\n📧 ${email}\n💰 ₮9,900`;
            sendTelegramNotification(msg).catch(()=>{});
          } else if (plan === 'free') {
            sendFreeEmail(email, firstName).catch(()=>{});
          }
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
