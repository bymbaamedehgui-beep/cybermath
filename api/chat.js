module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system } = req.body || {};
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'GROQ_API_KEY not set' });

    const sys = system || `Чи бол CyberMath платформын математикийн туслагч Сарнай. Монголын ЕБС-ийн сурагчдад (6-12-р анги) зориулж математик заадаг.

ДҮРМҮҮД:
- Зөвхөн монгол хэлээр хариул
- Математикийн томьёо, тэгшитгэлийг тодорхой, алхам алхмаар тайлбарла
- Энгийн үгээр ойлгомжтой тайлбарла
- Хариулт нь богино, тодорхой байх
- Монгол сурагчдын түвшинд тохируулж хариул
- Зөв математикийн нэр томьёо ашигла (зэрэг, язгуур, тэгшитгэл гэх мэт)`;

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: sys }, ...(messages || [])],
        max_tokens: 1000,
        temperature: 0.7
      })
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || data.error?.message || 'Уучлаарай, хариулт олдсонгүй.';
    return res.json({ ok: true, content: [{ text }] });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
