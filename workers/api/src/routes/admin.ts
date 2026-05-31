import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAdminAccess } from '../lib/auth';
import { generateId, hashPassword } from '../lib/crypto';
import { paginationParams } from '../lib/pagination';
import { deleteSubmissionR2Files, r2KeyFromUrl } from '../lib/r2';

const admin = new Hono<{ Bindings: Env }>();

admin.get('/api/admin/teachers', async (c) => {
  const access = await requireAdminAccess(c);
  if (access) return access;
  const { limit, offset } = paginationParams(c);
  const totalRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM teachers',
  ).first<{ n: number }>();
  const total = totalRow?.n ?? 0;
  const result = await c.env.DB.prepare(
    'SELECT id, email, created_at FROM teachers ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).bind(limit, offset).all();
  return c.json({ data: result.results, total, limit, offset });
});

admin.post('/api/admin/teachers', async (c) => {
  const access = await requireAdminAccess(c);
  if (access) return access;
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: 'Email dan password wajib diisi' }, 400);
  if (password.length < 8) return c.json({ error: 'Password minimal 8 karakter' }, 400);
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await c.env.DB.prepare('SELECT id FROM teachers WHERE email = ?')
    .bind(normalizedEmail)
    .first();
  if (existing) return c.json({ error: 'Email sudah terdaftar' }, 400);
  const id = generateId();
  await c.env.DB.prepare('INSERT INTO teachers (id, email, password_hash) VALUES (?, ?, ?)')
    .bind(id, normalizedEmail, await hashPassword(password))
    .run();
  return c.json({ success: true, teacher: { id, email: normalizedEmail } }, 201);
});

admin.put('/api/admin/teachers/:id', async (c) => {
  const access = await requireAdminAccess(c);
  if (access) return access;
  const { id } = c.req.param();
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email && !password) return c.json({ error: 'Tidak ada data yang diubah' }, 400);
  if (password && password.length < 8) return c.json({ error: 'Password minimal 8 karakter' }, 400);
  const teacher = await c.env.DB.prepare('SELECT id, email FROM teachers WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string }>();
  if (!teacher) return c.json({ error: 'Akun guru tidak ditemukan' }, 404);
  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== teacher.email) {
      const conflict = await c.env.DB.prepare('SELECT id FROM teachers WHERE email = ? AND id != ?')
        .bind(normalizedEmail, id)
        .first();
      if (conflict) return c.json({ error: 'Email sudah digunakan oleh akun lain' }, 400);
    }
    await c.env.DB.prepare('UPDATE teachers SET email = ? WHERE id = ?')
      .bind(email.trim().toLowerCase(), id)
      .run();
  }
  if (password) {
    await c.env.DB.prepare('UPDATE teachers SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(password), id)
      .run();
  }
  return c.json({ success: true });
});

admin.delete('/api/admin/teachers/:id', async (c) => {
  const access = await requireAdminAccess(c);
  if (access) return access;
  const { id } = c.req.param();
  const teacher = await c.env.DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(id).first();
  if (!teacher) return c.json({ error: 'Akun guru tidak ditemukan' }, 404);
  const tasks = await c.env.DB.prepare('SELECT id, file_url FROM tasks WHERE teacher_id = ?')
    .bind(id)
    .all<{ id: string; file_url: string | null }>();
  for (const task of tasks.results ?? []) {
    const subs = await c.env.DB.prepare('SELECT file_url FROM submissions WHERE task_id = ?')
      .bind(task.id)
      .all<{ file_url: string }>();
    for (const sub of subs.results ?? []) {
      await deleteSubmissionR2Files(c.env.SUBMISSION_FILES, sub.file_url);
    }
    if (task.file_url) {
      try {
        await c.env.TASK_FILES.delete(r2KeyFromUrl(task.file_url));
      } catch {
        /* ignore */
      }
    }
    await c.env.DB.prepare('DELETE FROM task_classes WHERE task_id = ?').bind(task.id).run();
    await c.env.DB.prepare('DELETE FROM submissions WHERE task_id = ?').bind(task.id).run();
  }
  await c.env.DB.prepare(
    'DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE teacher_id = ?)',
  )
    .bind(id)
    .run();
  await c.env.DB.prepare(
    'DELETE FROM task_classes WHERE class_id IN (SELECT id FROM classes WHERE teacher_id = ?)',
  )
    .bind(id)
    .run();
  await c.env.DB.prepare('DELETE FROM classes WHERE teacher_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM tasks WHERE teacher_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM teachers WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default admin;
