import { Hono } from 'hono';
import type { Env } from '../env';

const storage = new Hono<{ Bindings: Env }>();

storage.get('/usage', async (c) => {
  const payload = c.get('teacher');
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);

  const taskByteResult = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(byte_size), 0) AS total FROM tasks WHERE teacher_id = ?',
  )
    .bind(payload.sub)
    .first<{ total: number }>();
  const taskFilesBytes = taskByteResult?.total ?? 0;

  const subByteResult = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(s.byte_size), 0) AS total FROM submissions s
     JOIN tasks t ON s.task_id = t.id WHERE t.teacher_id = ?`,
  )
    .bind(payload.sub)
    .first<{ total: number }>();
  const submissionFilesBytes = subByteResult?.total ?? 0;

  return c.json({
    used_bytes: taskFilesBytes + submissionFilesBytes,
    task_files_bytes: taskFilesBytes,
    submission_files_bytes: submissionFilesBytes,
  });
});

export default storage;
