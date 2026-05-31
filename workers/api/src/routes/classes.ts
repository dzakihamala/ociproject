import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/auth';
import { generateId } from '../lib/crypto';
import { paginationParams } from '../lib/pagination';

const classes = new Hono<{ Bindings: Env }>();

classes.get('/api/classes', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { limit, offset } = paginationParams(c);
  const totalRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM classes WHERE teacher_id = ?',
  ).bind(teacher.sub).first<{ n: number }>();
  const total = totalRow?.n ?? 0;
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.created_at, COUNT(s.id) as student_count
     FROM classes c LEFT JOIN students s ON s.class_id = c.id
     WHERE c.teacher_id = ? GROUP BY c.id ORDER BY c.name LIMIT ? OFFSET ?`,
  )
    .bind(teacher.sub, limit, offset)
    .all();
  return c.json({ data: rows.results, total, limit, offset });
});

classes.post('/api/classes', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Nama kelas wajib diisi' }, 400);
  const id = generateId();
  await c.env.DB.prepare('INSERT INTO classes (id, teacher_id, name) VALUES (?, ?, ?)')
    .bind(id, teacher.sub, name.trim())
    .run();
  return c.json({ id, name: name.trim() }, 201);
});

classes.get('/api/classes/:id/students', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?')
    .bind(id, teacher.sub)
    .first();
  if (!cls) return c.json({ error: 'Kelas tidak ditemukan' }, 404);
  const { limit, offset } = paginationParams(c);
  const totalRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM students WHERE class_id = ?',
  ).bind(id).first<{ n: number }>();
  const total = totalRow?.n ?? 0;
  const rows = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM students WHERE class_id = ? ORDER BY name LIMIT ? OFFSET ?',
  )
    .bind(id, limit, offset)
    .all();
  return c.json({ data: rows.results, total, limit, offset });
});

classes.post('/api/classes/:id/students', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?')
    .bind(id, teacher.sub)
    .first();
  if (!cls) return c.json({ error: 'Kelas tidak ditemukan' }, 404);
  const { names } = await c.req.json<{ names: string[] }>();
  if (!Array.isArray(names) || names.length === 0) {
    return c.json({ error: 'Daftar nama wajib diisi' }, 400);
  }
  const inserted: { id: string; name: string }[] = [];
  for (const n of names) {
    const trimmed = n?.trim();
    if (!trimmed) continue;
    const sid = generateId();
    await c.env.DB.prepare('INSERT INTO students (id, class_id, name) VALUES (?, ?, ?)')
      .bind(sid, id, trimmed)
      .run();
    inserted.push({ id: sid, name: trimmed });
  }
  if (inserted.length === 0) return c.json({ error: 'Daftar nama wajib diisi' }, 400);
  return c.json({ students: inserted }, 201);
});

classes.put('/api/classes/:id', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?')
    .bind(id, teacher.sub)
    .first();
  if (!cls) return c.json({ error: 'Kelas tidak ditemukan' }, 404);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Nama kelas wajib diisi' }, 400);
  await c.env.DB.prepare('UPDATE classes SET name = ? WHERE id = ?').bind(name.trim(), id).run();
  return c.json({ success: true });
});

classes.delete('/api/classes/:id', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?')
    .bind(id, teacher.sub)
    .first();
  if (!cls) return c.json({ error: 'Kelas tidak ditemukan' }, 404);
  await c.env.DB.prepare('DELETE FROM task_classes WHERE class_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM students WHERE class_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

classes.put('/api/students/:id', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const student = await c.env.DB.prepare(
    `SELECT s.id FROM students s JOIN classes c ON s.class_id = c.id
     WHERE s.id = ? AND c.teacher_id = ?`,
  )
    .bind(id, teacher.sub)
    .first();
  if (!student) return c.json({ error: 'Siswa tidak ditemukan' }, 404);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Nama siswa wajib diisi' }, 400);
  await c.env.DB.prepare('UPDATE students SET name = ? WHERE id = ?').bind(name.trim(), id).run();
  return c.json({ success: true });
});

classes.delete('/api/students/:id', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const student = await c.env.DB.prepare(
    `SELECT s.id FROM students s JOIN classes c ON s.class_id = c.id
     WHERE s.id = ? AND c.teacher_id = ?`,
  )
    .bind(id, teacher.sub)
    .first();
  if (!student) return c.json({ error: 'Siswa tidak ditemukan' }, 404);
  await c.env.DB.prepare('DELETE FROM students WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default classes;
