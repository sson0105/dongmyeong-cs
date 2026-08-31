module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  try {
    const { prompt, systemInstruction } = req.body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    const data = await response.json();

    // Gemini API 응답에서 텍스트 직접 안전 추출
    const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!replyText) {
      console.error("Gemini API raw response error:", JSON.stringify(data));
      return res.status(500).json({ error: 'AI 응답 생성 실패', raw: data });
    }

    // 깔끔하게 text 속성으로 반환
    return res.status(200).json({ text: replyText });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
