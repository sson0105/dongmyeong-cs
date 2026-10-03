const crypto = require('crypto');

// 근무표·운영 일지가 함께 쓰는 저장소 연결 (Upstash Redis, Vercel Storage 연결 시 환경변수 자동 등록)
// 파일 이름이 _로 시작하면 Vercel이 API 주소로 노출하지 않음

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(config, command) {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Redis 요청 실패');
  return data.result;
}

// HGETALL 결과([field, value, field, value, ...])를 { field: JSON값 } 객체로
async function readHash(config, key) {
  const flat = (await redis(config, ['HGETALL', key])) || [];
  const result = {};
  for (let i = 0; i < flat.length; i += 2) result[flat[i]] = JSON.parse(flat[i + 1]);
  return result;
}

// 수정 비밀번호 (Vercel 환경변수 WORK_EDIT_PASSWORD)
function passwordMatches(input) {
  const expected = process.env.WORK_EDIT_PASSWORD;
  if (!expected || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { redisConfig, redis, readHash, passwordMatches };
