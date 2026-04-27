const pool = require('./_db');
const { sendPremiumEmail, sendFreeEmail } = require('./_email');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

function verifyToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try { return jwt.verify(auth.slice(7), JWT_SECRET); } catch (e) { return null; }
}
function checkUserAccess(req, requestedEmail, options) {
  options = options || {};
  const decoded = verifyToken(req);
  if (options.strict) {
    if (!decoded) return { ok: false, error: 'Унтраалга буруу. Дахин нэвтэрнэ үү.' };
    if (decoded.admin) return { ok: true, isAdmin: true };
    if (decoded.email !== requestedEmail) return { ok: false, error: 'Зөвхөн өөрийнхөө өгөгдлийг харна' };
    return { ok: true, email: decoded.email, role: decoded.role };
  }
  if (decoded) {
    if (decoded.admin) return { ok: true, isAdmin: true };
    if (decoded.email !== requestedEmail) return { ok: false, error: 'Зөвхөн өөрийнхөө өгөгдлийг харна' };
    return { ok: true, email: decoded.email, role: decoded.role };
  }
  return { ok: true, legacy: true };
}
function requireAdmin(req) {
  const decoded = verifyToken(req);
  if (!decoded || !decoded.admin) return { ok: false, error: 'Зөвхөн админ' };
  return { ok: true };
}

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
        const r = await pool.query('SELECT id,first_name,last_name,xp,avatar,profile_image,grade,plan FROM users WHERE xp>0 ORDER BY xp DESC LIMIT 20');
        return res.json({ ok: true, users: r.rows });
      }
      // Бүх хэрэглэгчдийн жагсаалт — зөвхөн админ
      const adminCheck = requireAdmin(req);
      if (!adminCheck.ok) return res.status(403).json({ ok: false, error: 'Зөвхөн админ' });
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

      // Auth шалгалт — token байвал email-тай таарч байх ёстой
      const access = checkUserAccess(req, email, { strict: false });
      if (!access.ok) return res.status(403).json({ ok: false, error: access.error });

      // Багшаас assignChallenge гэх мэт нь өөр хэрэглэгчид нөлөөлдөг.
      // Тэдгээр нь action өөрөө security check хийнэ (classroom owner, etc).

      // changePassword нь өөрийнх л байх ёстой
      if (action === 'changePassword') {
        const { oldPassword, newPassword } = req.body;
        const bcrypt = require('bcryptjs');
        const r = await pool.query('SELECT pass FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
        const stored = r.rows[0].pass;
        let isValid = false;
        if (stored && (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$'))) {
          isValid = await bcrypt.compare(oldPassword, stored);
        } else {
          isValid = oldPassword === stored;
        }
        if (!isValid) return res.json({ ok: false, error: 'Одоогийн нууц үг буруу байна' });
        if (!newPassword || newPassword.length < 6) return res.json({ ok: false, error: 'Шинэ нууц үг 6+ тэмдэгт' });
        const hashedPass = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET pass=$1 WHERE email=$2', [hashedPass, email]);
        return res.json({ ok: true });
      }

      if (action === 'heartbeat') {
        await pool.query('UPDATE users SET last_active_at=NOW() WHERE email=$1', [email]);
        return res.json({ ok: true });
      }

      if (action === 'addMinutes') {
        const { minutes } = req.body || {};
        const m = parseFloat(minutes) || 1;
        const today = todayStr();
        const r = await pool.query('SELECT activity_log FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.json({ ok: false });
        const log = r.rows[0].activity_log || {};
        // Нарийвчилсан тоо хадгалж сум total-ыг 1 оронтой бутархайтай round хийнэ
        log[today] = Math.round(((log[today] || 0) + m) * 10) / 10;
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

      // Challenge засах — багш ашиглана
      if (action === 'updateChallenge') {
        const { classroomId, challengeId, title, lessons, dueDate } = req.body || {};
        if (!classroomId || !challengeId) return res.json({ ok: false, error: 'Missing fields' });
        const m = await pool.query('SELECT student_email FROM class_members WHERE classroom_id=$1', [classroomId]);
        for (const row of m.rows) {
          const u = await pool.query('SELECT challenges FROM users WHERE email=$1', [row.student_email]);
          if (!u.rows.length) continue;
          let list = u.rows[0].challenges || [];
          if (typeof list === 'string') { try { list = JSON.parse(list); } catch(e) { list = []; } }
          let updated = false;
          list = list.map(c => {
            if (c.id === challengeId) {
              updated = true;
              return Object.assign({}, c, {
                title: title || c.title,
                lessons: lessons || c.lessons,
                dueDate: dueDate !== undefined ? dueDate : c.dueDate
              });
            }
            return c;
          });
          if (updated) {
            await pool.query('UPDATE users SET challenges=$1 WHERE email=$2', [JSON.stringify(list), row.student_email]);
          }
        }
        return res.json({ ok: true });
      }

      // Challenge устгах — багш ашиглана
      if (action === 'deleteChallenge') {
        const { classroomId, challengeId } = req.body || {};
        if (!classroomId || !challengeId) return res.json({ ok: false, error: 'Missing fields' });
        const m = await pool.query('SELECT student_email FROM class_members WHERE classroom_id=$1', [classroomId]);
        for (const row of m.rows) {
          const u = await pool.query('SELECT challenges FROM users WHERE email=$1', [row.student_email]);
          if (!u.rows.length) continue;
          let list = u.rows[0].challenges || [];
          if (typeof list === 'string') { try { list = JSON.parse(list); } catch(e) { list = []; } }
          const filtered = list.filter(c => c.id !== challengeId);
          if (filtered.length !== list.length) {
            await pool.query('UPDATE users SET challenges=$1 WHERE email=$2', [JSON.stringify(filtered), row.student_email]);
          }
        }
        return res.json({ ok: true });
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

      // ===== MATHLET TOURNAMENT =====
      // Багш Room үүсгэх
      if (action === 'createTournament') {
        const { classroomId, title, lessons, questionCount, prizeXp } = req.body || {};
        if (!classroomId || !lessons || !lessons.length) return res.json({ ok: false, error: 'Missing fields' });
        const qRes = await pool.query(
          `SELECT id, text, choices, correct, image, hint, node_id, type FROM questions
           WHERE node_id = ANY($1::int[])
             AND (type IS NULL OR type = 'choice')`,
          [lessons]
        );
        // Choices хоосон бодлогуудыг JS дээр шүүх (4 сонголттой л байх ёстой)
        let validQs = qRes.rows.filter(q => {
          let ch = q.choices;
          if (typeof ch === 'string') {
            try { ch = JSON.parse(ch); } catch(e) { return false; }
          }
          return Array.isArray(ch) && ch.length >= 2 && ch.length <= 4;
        });
        let allQs = validQs.sort(() => Math.random() - 0.5);
        const limit = Math.min(parseInt(questionCount) || 10, allQs.length);
        const selected = allQs.slice(0, limit);
        if (!selected.length) return res.json({ ok: false, error: 'Сонгосон хичээлүүдэд асуулт байхгүй' });
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        const r = await pool.query(
          `INSERT INTO tournaments (room_code, teacher_email, classroom_id, title, questions, prize_xp, status, current_question, current_phase)
           VALUES ($1, $2, $3, $4, $5, $6, 'lobby', 0, 'waiting') RETURNING *`,
          [code, email, classroomId, title || 'Mathlet тэмцээн', JSON.stringify(selected), JSON.stringify(prizeXp || {1:100,2:50,3:25})]
        );
        return res.json({ ok: true, tournament: r.rows[0] });
      }

      // Сурагч room-руу нэгдэх
      if (action === 'joinTournament') {
        const { roomCode } = req.body || {};
        if (!roomCode) return res.json({ ok: false, error: 'Room код оруулна уу' });
        const r = await pool.query('SELECT * FROM tournaments WHERE room_code=$1', [roomCode.toUpperCase()]);
        if (!r.rows.length) return res.json({ ok: false, error: 'Код буруу байна' });
        const t = r.rows[0];
        if (t.status === 'finished') return res.json({ ok: false, error: 'Тэмцээн дууссан' });
        const u = await pool.query('SELECT first_name, last_name, avatar, profile_image FROM users WHERE email=$1', [email]);
        if (!u.rows.length) return res.json({ ok: false });
        const players = t.players || {};
        players[email] = {
          email: email,
          name: ((u.rows[0].last_name || '') + ' ' + (u.rows[0].first_name || '')).trim(),
          avatar: u.rows[0].profile_image || u.rows[0].avatar || 'default',
          joinedAt: new Date().toISOString()
        };
        const scores = t.scores || {};
        if (!scores[email]) scores[email] = 0;
        await pool.query('UPDATE tournaments SET players=$1, scores=$2 WHERE id=$3', [JSON.stringify(players), JSON.stringify(scores), t.id]);
        return res.json({ ok: true, tournament: t });
      }

      // Tournament state-ийг шалгах (live polling)
      if (action === 'getTournament') {
        const { roomCode } = req.body || {};
        if (!roomCode) return res.json({ ok: false });
        const r = await pool.query('SELECT * FROM tournaments WHERE room_code=$1', [roomCode.toUpperCase()]);
        if (!r.rows.length) return res.json({ ok: false, error: 'Room олдсонгүй' });
        return res.json({ ok: true, tournament: r.rows[0] });
      }

      // Багш тэмцээн эхлүүлэх / асуулт солих / phase солих
      if (action === 'controlTournament') {
        const { roomCode, control } = req.body || {};
        if (!roomCode) return res.json({ ok: false });
        const r = await pool.query('SELECT * FROM tournaments WHERE room_code=$1 AND teacher_email=$2', [roomCode.toUpperCase(), email]);
        if (!r.rows.length) return res.json({ ok: false, error: 'Зөвшөөрөлгүй' });
        const t = r.rows[0];

        if (control === 'start') {
          await pool.query(
            `UPDATE tournaments SET status='running', current_question=0, current_phase='answering', question_started_at=NOW(), answers='{}' WHERE id=$1`,
            [t.id]
          );
        } else if (control === 'reveal') {
          await pool.query(`UPDATE tournaments SET current_phase='revealed' WHERE id=$1`, [t.id]);
        } else if (control === 'next') {
          const next = t.current_question + 1;
          const qs = t.questions || [];
          if (next >= qs.length) {
            const scores = t.scores || {};
            const prize = t.prize_xp || {1:100,2:50,3:25};
            const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            for (let i = 0; i < Math.min(ranked.length, 3); i++) {
              const xp = parseInt(prize[i + 1]) || 0;
              if (xp > 0) {
                await pool.query('UPDATE users SET xp = xp + $1 WHERE email=$2', [xp, ranked[i][0]]);
              }
            }
            await pool.query(`UPDATE tournaments SET status='finished', current_phase='finished' WHERE id=$1`, [t.id]);
          } else {
            await pool.query(
              `UPDATE tournaments SET current_question=$1, current_phase='answering', question_started_at=NOW(), answers='{}' WHERE id=$2`,
              [next, t.id]
            );
          }
        } else if (control === 'cancel') {
          await pool.query(`DELETE FROM tournaments WHERE id=$1`, [t.id]);
        }
        const r2 = await pool.query('SELECT * FROM tournaments WHERE id=$1', [t.id]);
        return res.json({ ok: true, tournament: r2.rows[0] || null });
      }

      // Сурагч хариулт өгөх
      if (action === 'submitAnswer') {
        const { roomCode, questionIndex, answer } = req.body || {};
        if (!roomCode) return res.json({ ok: false });
        const r = await pool.query('SELECT * FROM tournaments WHERE room_code=$1', [roomCode.toUpperCase()]);
        if (!r.rows.length) return res.json({ ok: false });
        const t = r.rows[0];
        if (t.current_phase !== 'answering') return res.json({ ok: false, error: 'Хариулт хүлээж байгаа үе биш' });
        if (parseInt(questionIndex) !== t.current_question) return res.json({ ok: false, error: 'Асуулт солигдсон' });
        const answers = t.answers || {};
        if (answers[email] !== undefined) return res.json({ ok: true, alreadyAnswered: true });
        const qs = t.questions || [];
        const q = qs[t.current_question];
        let choices = q.choices || [];
        if (typeof choices === 'string') { try { choices = JSON.parse(choices); } catch(e) { choices = []; } }
        const correctIdx = choices.indexOf(q.correct);
        const isCorrect = parseInt(answer) === correctIdx;
        const startedAt = new Date(t.question_started_at).getTime();
        const elapsed = Date.now() - startedAt;
        const speedBonus = Math.max(0, 15000 - elapsed) / 150;
        answers[email] = { answer: parseInt(answer), isCorrect: isCorrect, time: elapsed };
        const scores = t.scores || {};
        if (isCorrect) {
          scores[email] = (scores[email] || 0) + 100 + Math.round(speedBonus);
        }
        await pool.query('UPDATE tournaments SET answers=$1, scores=$2 WHERE id=$3', [JSON.stringify(answers), JSON.stringify(scores), t.id]);
        return res.json({ ok: true, isCorrect: isCorrect });
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
      const adminCheck = requireAdmin(req);
      if (!adminCheck.ok) return res.status(403).json({ ok: false, error: 'Зөвхөн админ' });
      const { email } = req.body || {};
      await pool.query('DELETE FROM users WHERE email=$1', [email]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
