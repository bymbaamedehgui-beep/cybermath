module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    const sys = system || 'Чи бол математикийн туслагч Сарнай. Монгол хэлээр хариул.';
    
    // Build contents with system as first user turn
    const contents = [
      { role: 'user', parts: [{ text: sys }] },
      { role: 'model', parts: [{ text: 'Ойлголоо, бэлэн байна!' }] },
      ...(messages || []).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
    ];

    const r = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1000 } })
    });
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      || data.error?.message
      || 'Уучлаарай, хариулт олдсонгүй.';
    return res.json({ ok: true, content: [{ text }] });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
