export const config = {
  api: {
    bodyParser: { sizeLimit: '20mb' },
    maxDuration: 60
  }
};

function cleanText(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => {
      const words = line.split(' ');
      const allShortKorean = words.length > 2 && words.every(w => w.length <= 2 && /^[가-힣]+$/.test(w));
      if (allShortKorean) return words.join('');
      let result = line;
      result = result.replace(/([가-힣]) ([가-힣]) ([가-힣]) ([가-힣])/g, '$1$2$3$4');
      result = result.replace(/([가-힣]) ([가-힣]) ([가-힣])/g, '$1$2$3');
      result = result.replace(/([가-힣]) ([가-힣])/g, (m, a, b) => a + b);
      return result;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const { apiKey, prompt, rawText } = body;

    if (rawText !== undefined) {
      return res.status(200).json({ cleaned: cleanText(rawText) });
    }

    if (!apiKey) return res.status(400).json({ error: { message: 'API key가 없습니다.' } });
    if (!prompt) return res.status(400).json({ error: { message: 'prompt가 없습니다.' } });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "You are a JSON API. Respond with valid JSON only. No markdown, no code blocks, no explanation. Pure JSON only." }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json"
        }
      })
    });

    const rawResponse = await response.text();

    let data;
    try {
      data = JSON.parse(rawResponse);
    } catch (e) {
      return res.status(500).json({ error: { message: 'Gemini 응답 파싱 실패: ' + rawResponse.slice(0, 300) } });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: { message: data.error?.message || 'Gemini API 오류 (HTTP ' + response.status + ')' }
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      const reason = data.candidates?.[0]?.finishReason || 'unknown';
      return res.status(500).json({ error: { message: 'Gemini 응답 없음. 종료 이유: ' + reason } });
    }

    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
