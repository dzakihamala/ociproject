import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAuth } from '../lib/auth';
import { objectBytes } from '../lib/r2';

const storage = new Hono<{ Bindings: Env }>();

storage.get('/api/storage/usage', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  const teacherTasks = await c.env.DB.prepare('SELECT file_url FROM tasks WHERE teacher_id = ?')
    .bind(payload.sub)
    .all<{ file_url: string | null }>();
  let taskFilesBytes = 0;
  for (const row of teacherTasks.results ?? []) {
    taskFilesBytes += await objectBytes(c.env.TASK_FILES, row.file_url);
  }
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
