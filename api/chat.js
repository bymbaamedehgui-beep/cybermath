const { Pool } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system, userEmail } = req.body || {};
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not set' });

    // Хязгаар шалгах
    if (userEmail && process.env.DATABASE_URL) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS chat_usage (email TEXT, date TEXT, count INT DEFAULT 0, PRIMARY KEY (email, date))`);
        const userRes = await pool.query('SELECT plan FROM users WHERE email=$1', [userEmail]);
        const isPremium = userRes.rows[0]?.plan === 'premium';
        const dailyLimit = isPremium ? 30 : 5;
        const today = new Date().toISOString().split('T')[0];
        const usage = await pool.query('SELECT count FROM chat_usage WHERE email=$1 AND date=$2', [userEmail, today]);
        const count = usage.rows[0]?.count || 0;
        if (count >= dailyLimit) {
          await pool.end();
          return res.json({ ok: true, limitReached: true, content: [{ text: isPremium
            ? `Өнөөдрийн хязгаар (${dailyLimit} асуулт) дууссан. Маргааш дахин ашиглаарай.`
            : `Үнэгүй хэрэглэгчид өдөрт ${dailyLimit} асуулт боломжтой. Premium авбал 30 болно! 👑` }] });
        }
        await pool.query(`INSERT INTO chat_usage (email, date, count) VALUES ($1, $2, 1) ON CONFLICT (email, date) DO UPDATE SET count = chat_usage.count + 1`, [userEmail, today]);
      } finally {
        await pool.end();
      }
    }

    const sys = system || 'Чи бол CyberMath платформын математикийн туслагч Сарнай. Монгол ЕБС-ийн сурагчдад зориулж математикийн бодлого, теорем, томьёог алхам алхмаар тайлбарла. Монгол хэлээр хариул.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: sys,
        messages: (messages || []).map(m => ({ role: m.role, content: m.content }))
      })
    });

    const data = await r.json();
    console.log('Claude response:', JSON.stringify(data).substring(0, 200));
    const text = data.content?.[0]?.text || data.error?.message || 'Уучлаарай, хариулт олдсонгүй.';
    return res.json({ ok: true, content: [{ text }] });
  } catch(e) {
    console.error('Chat error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
