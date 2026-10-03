const { redisConfig, redis, readHash, passwordMatches } = require('./_store');

// 근무표 변경 일정: 해시 키 하나에 날짜별로 저장
// field = 'YYYY-MM-DD', value = { staffId: { shift, memo, hourly? } }
const HASH_KEY = 'dm:work:overrides';
const VALID_SHIFTS = ['open', 'close', 'leave', 'off'];
const VALID_STAFF = ['eunji', 'b', 'c', 'wonchang'];

function isValidEntry(entry) {
  if (!entry || !VALID_SHIFTS.includes(entry.shift)) return false;
  if (entry.memo !== undefined && (typeof entry.memo !== 'string' || entry.memo.length > 100)) return false;
  if (entry.hourly) {
    const time = /^\d{2}:\d{2}$/;
    if (!time.test(entry.hourly.from) || !time.test(entry.hourly.to) || entry.hourly.from >= entry.hourly.to) return false;
  }
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const config = redisConfig();
  if (!config) {
    return res.status(500).json({ error: '근무표 저장소가 연결되지 않았습니다.' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ overrides: await readHash(config, HASH_KEY) });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { password, action, date, staffId, entry } = req.body || {};
    if (!passwordMatches(password)) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
    if (action === 'verify') {
      return res.status(200).json({ ok: true });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !VALID_STAFF.includes(staffId)) {
      return res.status(400).json({ error: '날짜 또는 직원 정보가 올바르지 않습니다.' });
    }
    if (entry !== null && !isValidEntry(entry)) {
      return res.status(400).json({ error: '근무 정보가 올바르지 않습니다.' });
    }

    // entry가 null이면 해당 직원의 변경 일정을 지우고 기본 근무로 되돌림
    const raw = await redis(config, ['HGET', HASH_KEY, date]);
    const day = raw ? JSON.parse(raw) : {};
    if (entry === null) delete day[staffId];
    else day[staffId] = entry;

    if (Object.keys(day).length) await redis(config, ['HSET', HASH_KEY, date, JSON.stringify(day)]);
    else await redis(config, ['HDEL', HASH_KEY, date]);

    return res.status(200).json({ date, day });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
