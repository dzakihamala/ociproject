import type { Env } from '../env';
import { deleteSubmissionR2Files, r2KeyFromUrl } from './r2';

/**
 * Delete all R2 files and DB rows for a single task (submissions + task attachment).
 * Used by both task deletion and admin teacher deletion (in a loop).
 */
export async function cleanupTask(env: Env, taskId: string) {
  const subs = await env.DB.prepare('SELECT file_url FROM submissions WHERE task_id = ?')
    .bind(taskId)
    .all<{ file_url: string }>();

  for (const sub of subs.results ?? []) {
    await deleteSubmissionR2Files(env.SUBMISSION_FILES, sub.file_url);
  }

  const task = await env.DB.prepare('SELECT file_url FROM tasks WHERE id = ?')
    .bind(taskId)
    .first<{ file_url: string | null }>();

  if (task?.file_url) {
    try {
      await env.TASK_FILES.delete(r2KeyFromUrl(task.file_url));
    } catch {
      /* ignore missing */
    }
  }

  await env.DB.prepare('DELETE FROM task_classes WHERE task_id = ?').bind(taskId).run();
  await env.DB.prepare('DELETE FROM submissions WHERE task_id = ?').bind(taskId).run();
  await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
}
