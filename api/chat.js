module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBjl13EuEnsBMAL1K5_txX-qW2cuG-jPJA';

    const contents = (messages || []).map(function(m) {
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    });

    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system || '' }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 1000 }
      })
    });
    const data = await r.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text || 'Уучлаарай, хариулт олдсонгүй.';
    return res.json({ ok: true, content: [{ text }] });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
