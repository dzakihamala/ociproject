import type { Env, JwtPayload } from '../env';
import { verifyJWT } from './crypto';
import { checkAdminRateLimit } from './adminThrottle';
import { clientIp } from './submitThrottle';

export async function requireAuth(c: { req: { header: (n: string) => string | undefined }; env: Env }) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return (await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET)) as JwtPayload;
  } catch {
    return null;
  }
}

export function requireAdminKey(c: { req: { header: (n: string) => string | undefined }; env: Env }) {
  const key = c.req.header('X-Admin-Key');
  return !!(key && key === c.env.SETUP_KEY);
}

export async function requireAdminAccess(
  c: { req: { header: (n: string) => string | undefined }; env: Env },
): Promise<Response | null> {
  if (!requireAdminKey(c)) {
    return new Response(JSON.stringify({ error: 'Akses ditolak' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const rate = await checkAdminRateLimit(c.env, clientIp(c.req));
  if (!rate.ok) {
    return new Response(JSON.stringify({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfterSec) },
    });
  }
  return null;
}
