import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/auth';
import { generateId, hashPassword, signJWT, verifyPassword } from '../lib/crypto';

const auth = new Hono<{ Bindings: Env }>();

auth.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    if (!email || !password) return c.json({ error: 'Email dan password wajib diisi' }, 400);
    const teacher = await c.env.DB.prepare(
      'SELECT id, email, password_hash FROM teachers WHERE email = ?',
    )
      .bind(email.trim().toLowerCase())
      .first<{ id: string; email: string; password_hash: string }>();
    if (!teacher) return c.json({ error: 'Email atau password salah' }, 401);
    if (!(await verifyPassword(password, teacher.password_hash))) {
      return c.json({ error: 'Email atau password salah' }, 401);
    }
    if (!c.env.JWT_SECRET?.trim()) {
      console.error('JWT_SECRET tidak dikonfigurasi');
      return c.json({ error: 'Server autentikasi belum dikonfigurasi' }, 503);
    }
    const token = await signJWT(
      {
        sub: teacher.id,
        email: teacher.email,
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
      c.env.JWT_SECRET,
    );
    return c.json({ token, teacher_id: teacher.id });
  } catch (e) {
    console.error('login error', e);
    return c.json({ error: 'Login gagal' }, 500);
  }
});

auth.get('/api/auth/check', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ valid: true, teacher_id: payload.sub });
});

auth.post('/api/setup/create-teacher', async (c) => {
  try {
    const { email, password, setup_key } = await c.req.json<{
      email: string;
      password: string;
      setup_key: string;
    }>();
    if (!setup_key || setup_key !== c.env.SETUP_KEY) {
      return c.json({ error: 'Setup key tidak valid' }, 403);
    }
    if (!email || !password) return c.json({ error: 'Email dan password wajib diisi' }, 400);
    if (password.length < 8) return c.json({ error: 'Password minimal 8 karakter' }, 400);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await c.env.DB.prepare('SELECT id FROM teachers WHERE email = ?')
      .bind(normalizedEmail)
      .first();
    if (existing) return c.json({ error: 'Email sudah terdaftar' }, 400);
    const id = generateId();
    const password_hash = await hashPassword(password);
    await c.env.DB.prepare('INSERT INTO teachers (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(id, normalizedEmail, password_hash)
      .run();
    return c.json({ success: true, teacher_id: id }, 201);
  } catch {
    return c.json({ error: 'Gagal membuat akun' }, 500);
  }
});

export default auth;
