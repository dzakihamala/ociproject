import { Hono } from 'hono';
import type { Env } from '../env';
import { generateId, generateUniqueFileName } from '../lib/crypto';
import { paginationParams } from '../lib/pagination';
import { cleanupTask } from '../lib/cascade';

const tasks = new Hono<{ Bindings: Env }>();

// ── Authenticated routes ──

tasks.get('/', async (c) => {
  const payload = c.get('teacher');
  const { limit, offset } = paginationParams(c);
  const totalRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM tasks WHERE teacher_id = ?',
  ).bind(payload.sub).first<{ n: number }>();
  const total = totalRow?.n ?? 0;
  const result = await c.env.DB.prepare(
    'SELECT * FROM tasks WHERE teacher_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).bind(payload.sub, limit, offset).all();
  return c.json({ data: result.results, total, limit, offset });
});

tasks.get('/:id', async (c) => {
  const payload = c.get('teacher');
  const { id } = c.req.param();
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND teacher_id = ?')
    .bind(id, payload.sub)
    .first();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const tc = await c.env.DB.prepare(
    'SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?',
  ).bind(id).all();
  return c.json({ task: { ...task, classes: tc.results || [] } });
});

tasks.get('/:id/submissions', async (c) => {
  const payload = c.get('teacher');
  const { id } = c.req.param();
  const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ? AND teacher_id = ?')
    .bind(id, payload.sub)
    .first();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const { limit, offset } = paginationParams(c);
  const totalRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM submissions WHERE task_id = ?',
  ).bind(id).first<{ n: number }>();
  const total = totalRow?.n ?? 0;
  const result = await c.env.DB.prepare(
    'SELECT * FROM submissions WHERE task_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).bind(id, limit, offset).all();
  return c.json({ data: result.results, total, limit, offset });
});

tasks.post('/', async (c) => {
  const payload = c.get('teacher');
  try {
    const formData = await c.req.formData();
    const title = formData.get('title');
    const subject = formData.get('subject');
    const deadline = formData.get('deadline');
    const description = (formData.get('description') as string) || null;
    const submission_type = (formData.get('submission_type') as string) || 'image';
    const file = formData.get('file');
    const allowed = new Set(['image', 'video', 'audio']);
    if (!allowed.has(submission_type)) return c.json({ error: 'Tipe pengumpulan tidak valid' }, 400);
    if (!title || !subject || !deadline) {
      return c.json({ error: 'Title, subject, dan deadline wajib diisi' }, 400);
    }
    let file_url: string | null = null;
    let file_bytes = 0;
    if (file && typeof file === 'object' && 'size' in file && (file as File).size > 0) {
      const f = file as File;
      file_bytes = f.size;
      const fileName = generateUniqueFileName(f.name || 'attachment');
      await c.env.TASK_FILES.put(fileName, await f.arrayBuffer(), {
        httpMetadata: { contentType: f.type || 'application/octet-stream' },
      });
      file_url = `${c.env.TASK_FILES_PUBLIC_URL}/${fileName}`;
    }
    const id = generateId();
    let task_code = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      task_code = String(Math.floor(1e5 + Math.random() * 9e5));
      try {
        await c.env.DB.prepare(
          `INSERT INTO tasks (id, teacher_id, title, description, subject, deadline, file_url, task_code, submission_type, byte_size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, payload.sub, title, description, subject, deadline, file_url, task_code, submission_type, file_bytes)
          .run();
        break;
      } catch {
        if (attempt === 49) return c.json({ error: 'Gagal membuat kode tugas unik. Silakan coba lagi.' }, 409);
      }
    }
    const classesVal = formData.get('classes');
    if (classesVal) {
      let classIds: string[];
      try {
        classIds = JSON.parse(classesVal as string);
      } catch {
        return c.json({ error: 'Format data kelas tidak valid' }, 400);
      }
      if (!Array.isArray(classIds)) return c.json({ error: 'Format data kelas tidak valid' }, 400);
      for (const cid of classIds) {
        const cls = await c.env.DB.prepare(
          'SELECT id FROM classes WHERE id = ? AND teacher_id = ?',
        ).bind(cid, payload.sub).first();
        if (!cls) return c.json({ error: 'Kelas tidak valid atau bukan milik Anda' }, 400);
        await c.env.DB.prepare('INSERT INTO task_classes (task_id, class_id) VALUES (?, ?)')
          .bind(id, cid).run();
      }
    }
    const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
    const tc = await c.env.DB.prepare(
      'SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?',
    ).bind(id).all();
    return c.json({ task: { ...task, classes: tc.results || [] } }, 201);
  } catch {
    return c.json({ error: 'Gagal membuat tugas' }, 500);
  }
});

tasks.delete('/:id', async (c) => {
  const payload = c.get('teacher');
  const { id } = c.req.param();
  const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ? AND teacher_id = ?')
    .bind(id, payload.sub)
    .first();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  await cleanupTask(c.env, id);
  return c.json({ success: true });
});

// ── Public routes ──

tasks.get('/code/:code/classes/:classId/students', async (c) => {
  const { code, classId } = c.req.param();
  const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE task_code = ?')
    .bind(code).first<{ id: string }>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const link = await c.env.DB.prepare(
    'SELECT 1 FROM task_classes WHERE task_id = ? AND class_id = ?',
  ).bind(task.id, classId).first();
  if (!link) return c.json({ error: 'Kelas tidak terkait dengan tugas ini' }, 403);
  const rows = await c.env.DB.prepare(
    'SELECT id, name FROM students WHERE class_id = ? ORDER BY name',
  ).bind(classId).all();
  return c.json({ students: rows.results });
});

tasks.get('/code/:code/classes', async (c) => {
  const { code } = c.req.param();
  const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE task_code = ?')
    .bind(code).first<{ id: string }>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.name FROM classes c
     JOIN task_classes tc ON c.id = tc.class_id
     WHERE tc.task_id = ? ORDER BY c.name`,
  ).bind(task.id).all();
  return c.json({ classes: rows.results });
});

tasks.get('/code/:code', async (c) => {
  const { code } = c.req.param();
  const task = await c.env.DB.prepare(
    `SELECT id, title, description, subject, deadline, file_url, task_code, submission_type, created_at
     FROM tasks WHERE task_code = ?`,
  ).bind(code).first();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const tc = await c.env.DB.prepare(
    'SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?',
  ).bind((task as { id: string }).id).all();
  return c.json({ task: { ...task, classes: tc.results || [] } });
});

export default tasks;
