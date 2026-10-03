const crypto = require('crypto');
const { redisConfig, redis, readHash, passwordMatches } = require('./_store');

// 운영 일지: 해시 키 하나에 기록별로 저장
// field = 기록 id, value = { id, date, time, category, author, status, content, createdAt, updatedAt }
const HASH_KEY = 'dm:log:entries';
const VALID_CATEGORIES = ['facility', 'complaint', 'safety', 'booking', 'etc'];
const VALID_STATUS = ['open', 'done'];
const MAX_CONTENT = 2000;

function cleanEntry(input) {
  if (!input || typeof input !== 'object') return null;
  const { date, time, category, author, status, content } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  if (!/^\d{2}:\d{2}$/.test(time || '')) return null;
  if (!VALID_CATEGORIES.includes(category) || !VALID_STATUS.includes(status)) return null;
  if (typeof author !== 'string' || !author.trim() || author.length > 20) return null;
  if (typeof content !== 'string' || !content.trim() || content.length > MAX_CONTENT) return null;
  return { date, time, category, author: author.trim(), status, content: content.trim() };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const config = redisConfig();
  if (!config) {
    return res.status(500).json({ error: '저장소가 연결되지 않았습니다.' });
  }

  try {
    if (req.method === 'GET') {
      const entries = Object.values(await readHash(config, HASH_KEY));
      return res.status(200).json({ entries });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { password, action, id, entry } = req.body || {};
    if (!passwordMatches(password)) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    if (action === 'delete') {
      if (typeof id !== 'string' || !id) return res.status(400).json({ error: '삭제할 기록이 없습니다.' });
      await redis(config, ['HDEL', HASH_KEY, id]);
      return res.status(200).json({ id, deleted: true });
    }

    if (action === 'save') {
      const clean = cleanEntry(entry);
      if (!clean) return res.status(400).json({ error: '기록 내용이 올바르지 않습니다.' });
      const now = new Date().toISOString();
      let saved;
      if (id) {
        const raw = await redis(config, ['HGET', HASH_KEY, id]);
        if (!raw) return res.status(404).json({ error: '수정할 기록을 찾지 못했습니다.' });
        saved = { ...JSON.parse(raw), ...clean, updatedAt: now };
      } else {
        saved = { id: crypto.randomUUID(), ...clean, createdAt: now, updatedAt: now };
      }
      await redis(config, ['HSET', HASH_KEY, saved.id, JSON.stringify(saved)]);
      return res.status(200).json({ entry: saved });
    }

    return res.status(400).json({ error: '알 수 없는 요청입니다.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
