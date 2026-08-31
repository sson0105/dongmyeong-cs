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
    console.error("GEMINI_API_KEY 환경변수가 누락되었습니다.");
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  try {
    const { prompt, systemInstruction } = req.body;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    // 가장 널리 지원되는 표준 모델 호출
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Google API 에러 응답:", JSON.stringify(data));
      return res.status(response.status).json({
        error: data.error?.message || 'Google API 호출 오류',
        details: data
      });
    }

    const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!replyText) {
      console.error("Gemini 텍스트 없음:", JSON.stringify(data));
      return res.status(500).json({ error: '생성된 텍스트가 없습니다.', details: data });
    }

    return res.status(200).json({ text: replyText });
  } catch (error) {
    console.error("서버 내부 예외:", error);
    return res.status(500).json({ error: error.message });
  }
};
