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

    // Gemini requires at least one user message
    if (!contents.length) {
      return res.json({ ok: true, content: [{ text: 'Юу асуух гэж байна вэ?' }] });
    }

    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system || 'Чи бол математикийн туслагч Сарнай. Монгол хэлээр хариул.' }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
      })
    });
    const data = await r.json();
    console.log('Gemini response:', JSON.stringify(data).substring(0, 200));
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                 data.error?.message || 
                 'Уучлаарай, хариулт олдсонгүй.';
    return res.json({ ok: true, content: [{ text }] });
  } catch(e) {
    console.error('Chat error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
