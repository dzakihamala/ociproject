import type { Context } from 'hono';
import type { Env, JwtPayload } from '../env';
import { verifyJWT } from './crypto';
import { checkAdminRateLimit } from './adminThrottle';
import { clientIp } from './ip';

export type AuthContext = Context<{ Bindings: Env; Variables: { teacher: JwtPayload } }>;

/** Hono middleware — extracts and verifies Bearer JWT, stores payload in c.var.teacher. */
export async function teacherAuth(c: AuthContext, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET);
      c.set('teacher', payload as JwtPayload);
    } catch {
      // token invalid — leave teacher unset
    }
  }
  await next();
}

/** Hono middleware — returns 401 if c.var.teacher is not set. */
export async function requireTeacher(c: AuthContext, next: () => Promise<void>) {
  if (!c.get('teacher')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
}

/** Hono middleware — validates X-Admin-Key header + rate limits. Returns 403/429 on failure. */
export async function requireAdmin(c: AuthContext, next: () => Promise<void>) {
  const key = c.req.header('X-Admin-Key');
  if (!key || key !== c.env.SETUP_KEY) {
    return c.json({ error: 'Akses ditolak' }, 403);
  }
  const rate = await checkAdminRateLimit(c.env, clientIp(c.req));
  if (!rate.ok) {
    return c.json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, 429, {
      'Retry-After': String(rate.retryAfterSec),
    });
  }
  await next();
}

// Re-export for backward compatibility with routes that haven't migrated to middleware
export { verifyJWT } from './crypto';
