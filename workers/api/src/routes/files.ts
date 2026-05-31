import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/auth';
import { resolveTeacherFileAccess } from '../lib/fileAccess';

const files = new Hono<{ Bindings: Env }>();

files.get('/api/files/blob', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);

  const fileUrl = c.req.query('url');
  if (!fileUrl?.trim()) return c.json({ error: 'Parameter url wajib' }, 400);

  const access = await resolveTeacherFileAccess(c.env, payload.sub, fileUrl.trim());
  if (!access) return c.json({ error: 'File tidak ditemukan atau tidak diizinkan' }, 403);

  const obj = await access.bucket.get(access.key);
  if (!obj) return c.json({ error: 'File tidak ditemukan di penyimpanan' }, 404);

  const headers = new Headers();
  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(obj.body, { headers });
});

export default files;
