module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body || {};

    // Try multiple free models in order
    const freeModels = [
      'google/gemma-3-27b-it:free',
      'mistralai/mistral-7b-instruct:free',
      'meta-llama/llama-3.2-3b-instruct:free',
      'qwen/qwen-2-7b-instruct:free',
    ];

    const sys = system || 'Чи бол математикийн туслагч Сарнай. Монгол хэлээр хариул.';
    const allMessages = [{ role: 'system', content: sys }, ...(messages || [])];

    let lastError = '';
    for (const model of freeModels) {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer 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',
          'HTTP-Referer': 'https://cybermath.vercel.app',
          'X-Title': 'CyberMath'
        },
        body: JSON.stringify({ model, messages: allMessages, max_tokens: 1000 })
      });
      const data = await r.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return res.json({ ok: true, content: [{ text }] });
      lastError = data.error?.message || 'empty';
    }

    return res.json({ ok: true, content: [{ text: 'Түр завсарлаж байна, дахин оролдоно уу.' }] });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
