import type { Env } from '../env';
import { clientIp } from './ip';
import { checkRateLimit } from './rateLimiter';

const MAX_ADMIN_PER_IP_PER_MIN = 10;

function minuteBucket() {
  return Math.floor(Date.now() / 60_000);
}

export async function checkAdminRateLimit(
  env: Env,
  ip: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  return checkRateLimit(env.DB, `admin:${ip}:${minuteBucket()}`, {
    prefix: 'admin',
    limit: MAX_ADMIN_PER_IP_PER_MIN,
    windowMs: 60_000,
    ttlMs: 2 * 60_000,
    retryAfterSec: 60,
  });
}
