// 추첨 결과 생성기: 추첨 신청 현황 캡처 이미지를 Gemini로 읽어 시간대별 1순위 팀만 돌려준다.
// 요청: POST { image: <base64, data: 접두어 없이>, mimeType: 'image/png' | 'image/jpeg' }
// 응답: { confirmedAt: 'YYYY-MM-DD HH:MM' | '', rows: [{ date, start, end, team, status }] }

const PROMPT = `이 이미지는 축구장 추첨 신청 현황 화면(날짜/시간대별 신청현황 표)을 캡처한 것이다.
표의 각 줄에는 신청일자(예: 2026-11-07 (토)), 시간대(예: 08:00~10:00), 신청 팀 수, 그리고 '1순위 팀명 (상태)', '2순위 팀명 (상태)' … 순서의 팀 목록이 있다.

할 일:
- 표의 모든 줄에 대해 '1순위'로 표시된 팀 하나만 뽑는다. 2순위 이하 팀은 모두 무시한다.
- '11순위', '12순위', '21순위'처럼 숫자가 더 붙은 것은 1순위가 아니다.
- 팀명은 이미지에 보이는 그대로(띄어쓰기·영문 대소문자·숫자 포함) 옮긴다. 괄호 안의 상태는 팀명에 넣지 않는다.
- status에는 1순위 팀 뒤 괄호 안의 글자를 그대로 넣는다(예: 결제완료, 당첨·결제차례). 없으면 빈 문자열.
- date는 YYYY-MM-DD, start/end는 HH:MM(24시간, 두 자리) 형식으로 쓴다.
- 화면 위쪽에 '당첨 확정됨 (YYYY-MM-DD HH:MM)' 문구가 있으면 confirmedAt에 'YYYY-MM-DD HH:MM'으로 넣고, 없으면 빈 문자열.
- 표에 없는 내용을 지어내지 않는다. 읽기 어려운 글자가 있어도 가장 가깝게 읽은 그대로 쓴다.

아래 JSON 형식으로만 답한다:
{"confirmedAt": "", "rows": [{"date": "", "start": "", "end": "", "team": "", "status": ""}]}`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되어 있지 않아요.' });

  try {
    const { image, mimeType } = req.body || {};
    if (!image || typeof image !== 'string') return res.status(400).json({ error: '이미지가 없어요.' });
    const mime = /^image\/(png|jpeg|webp)$/.test(mimeType || '') ? mimeType : 'image/png';

    const payload = {
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: mime, data: image } },
          { text: PROMPT },
        ],
      }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Google API 호출 오류' });
    }

    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch (e) {
      return res.status(502).json({ error: '이미지에서 표를 읽지 못했어요.', raw: text.slice(0, 500) });
    }

    const clean = (v) => String(v == null ? '' : v).trim();
    const rows = (Array.isArray(parsed?.rows) ? parsed.rows : [])
      .map(r => ({ date: clean(r.date), start: clean(r.start), end: clean(r.end), team: clean(r.team), status: clean(r.status) }))
      .filter(r => /^\d{4}-\d{1,2}-\d{1,2}$/.test(r.date) && /^\d{1,2}:\d{2}$/.test(r.start) && r.team);

    return res.status(200).json({ confirmedAt: clean(parsed?.confirmedAt), rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
