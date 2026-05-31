import type { Env } from '../env';

const MAX_ADMIN_PER_IP_PER_MIN = 10;
const ADMIN_BUCKET_TTL_MS = 2 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function minuteBucket() {
  return Math.floor(nowMs() / 60_000);
}

function adminBucketKey(ip: string) {
  return `admin:${ip}:${minuteBucket()}`;
}

export async function checkAdminRateLimit(
  env: Env,
  ip: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = nowMs();
  const bucketKey = adminBucketKey(ip);
  const expiresAt = now + ADMIN_BUCKET_TTL_MS;

  const row = await env.DB
    .prepare('SELECT hits FROM submit_rate_buckets WHERE bucket_key = ?')
    .bind(bucketKey)
    .first<{ hits: number }>();

  if (!row) {
    await env.DB
      .prepare('INSERT INTO submit_rate_buckets (bucket_key, hits, expires_at) VALUES (?, 1, ?)')
      .bind(bucketKey, expiresAt)
      .run();
    return { ok: true };
  }

  if (row.hits >= MAX_ADMIN_PER_IP_PER_MIN) {
    return { ok: false, retryAfterSec: 60 };
  }

  await env.DB
    .prepare('UPDATE submit_rate_buckets SET hits = hits + 1 WHERE bucket_key = ?')
    .bind(bucketKey)
    .run();
  return { ok: true };
}
