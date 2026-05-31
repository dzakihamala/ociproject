import type { Env } from '../env';
import { r2KeyFromUrl } from './r2';

function parseSubmissionUrls(fileUrlField: string): string[] {
  try {
    const parsed = JSON.parse(fileUrlField);
    return Array.isArray(parsed) ? parsed : [fileUrlField];
  } catch {
    return fileUrlField ? [fileUrlField] : [];
  }
}

function urlKeyMatch(storedUrl: string, requestedUrl: string): boolean {
  if (storedUrl === requestedUrl) return true;
  try {
    return r2KeyFromUrl(storedUrl) === r2KeyFromUrl(requestedUrl);
  } catch {
    return false;
  }
}

/** Guru boleh mengunduh file kiriman siswa milik tugasnya. */
export async function resolveSubmissionFileAccess(
  env: Env,
  teacherId: string,
  fileUrl: string,
): Promise<{ key: string } | null> {
  const key = r2KeyFromUrl(fileUrl);
  if (!key) return null;

  const rows = await env.DB.prepare(
    `SELECT s.file_url FROM submissions s
     INNER JOIN tasks t ON s.task_id = t.id
     WHERE t.teacher_id = ?`,
  )
    .bind(teacherId)
    .all<{ file_url: string }>();

  for (const row of rows.results ?? []) {
    for (const stored of parseSubmissionUrls(row.file_url)) {
      if (urlKeyMatch(stored, fileUrl)) return { key };
    }
  }
  return null;
}

/** Guru boleh mengunduh lampiran soal tugas miliknya. */
export async function resolveTaskFileAccess(
  env: Env,
  teacherId: string,
  fileUrl: string,
): Promise<{ key: string } | null> {
  const key = r2KeyFromUrl(fileUrl);
  if (!key) return null;

  const row = await env.DB.prepare(
    'SELECT file_url FROM tasks WHERE teacher_id = ? AND file_url IS NOT NULL',
  )
    .bind(teacherId)
    .all<{ file_url: string | null }>();

  for (const task of row.results ?? []) {
    if (task.file_url && urlKeyMatch(task.file_url, fileUrl)) return { key };
  }
  return null;
}

export async function resolveTeacherFileAccess(
  env: Env,
  teacherId: string,
  fileUrl: string,
): Promise<{ bucket: R2Bucket; key: string } | null> {
  const sub = await resolveSubmissionFileAccess(env, teacherId, fileUrl);
  if (sub) return { bucket: env.SUBMISSION_FILES, key: sub.key };

  const task = await resolveTaskFileAccess(env, teacherId, fileUrl);
  if (task) return { bucket: env.TASK_FILES, key: task.key };

  return null;
}
