import { Hono } from 'hono';
import type { Env } from '../env';
import { generateId, generateUniqueFileName } from '../lib/crypto';
import { deleteSubmissionR2Files, fileMatchesSubmissionType } from '../lib/r2';
import { acquireSubmitSlot, checkSubmissionRateLimits, clientIp } from '../lib/submitThrottle';

const submissions = new Hono<{ Bindings: Env }>();

async function removeOtherStudentSubmissions(
  env: Env,
  taskId: string,
  studentName: string,
  studentClass: string,
  keepId: string,
) {
  const existing = await env.DB.prepare(
    'SELECT id, file_url FROM submissions WHERE task_id = ? AND student_name = ? AND student_class = ? AND id != ?',
  )
    .bind(taskId, studentName, studentClass, keepId)
    .all<{ id: string; file_url: string }>();
  const rows = existing.results ?? [];
  for (const row of rows) {
    await deleteSubmissionR2Files(env.SUBMISSION_FILES, row.file_url);
    await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(row.id).run();
  }
  return rows.length;
}

submissions.post('/api/submissions', async (c) => {
  let releaseSlot: (() => Promise<void>) | null = null;
  try {
    const formData = await c.req.formData();
    const task_code = formData.get('task_code');
    const task_id_form = formData.get('task_id');
    const student_name = formData.get('student_name');
    const student_class = formData.get('student_class');
    const student_note = (formData.get('student_note') as string) || null;
    if (!task_code || !student_name || !student_class) {
      return c.json({ error: 'task_code, student_name, dan student_class wajib diisi' }, 400);
    }
    const trimmedCode = String(task_code).trim();
    const trimmedName = String(student_name).trim();
    const trimmedClass = String(student_class).trim();
    if (!trimmedCode || !trimmedName || !trimmedClass) {
      return c.json({ error: 'Kode tugas, nama, dan kelas wajib diisi' }, 400);
    }
    const task = await c.env.DB.prepare(
      'SELECT id, submission_type FROM tasks WHERE task_code = ?',
    )
      .bind(trimmedCode)
      .first<{ id: string; submission_type: string }>();
    if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
    const task_id = task.id;
    if (task_id_form && task_id_form !== task_id) {
      return c.json({ error: 'Data tugas tidak valid' }, 403);
    }

    const ip = clientIp(c.req);
    const rate = await checkSubmissionRateLimits(c.env, {
      taskId: task_id,
      ip,
      studentName: trimmedName,
      studentClass: trimmedClass,
    });
    if (!rate.ok) {
      return c.json({ error: rate.message }, 429, { 'Retry-After': String(rate.retryAfterSec) });
    }

    const slot = await acquireSubmitSlot(c.env, task_id);
    if (!slot.ok) {
      return c.json({ error: slot.message }, 429, { 'Retry-After': String(slot.retryAfterSec) });
    }
    releaseSlot = slot.release;

    const hasTargetClasses = await c.env.DB.prepare(
      'SELECT 1 FROM task_classes WHERE task_id = ? LIMIT 1',
    )
      .bind(task_id)
      .first();
    if (hasTargetClasses) {
      const rosterMatch = await c.env.DB.prepare(
        `SELECT 1 FROM students s
         JOIN classes c ON s.class_id = c.id
         JOIN task_classes tc ON tc.class_id = c.id AND tc.task_id = ?
         WHERE LOWER(c.name) = LOWER(?) AND LOWER(s.name) = LOWER(?)`,
      )
        .bind(task_id, trimmedClass, trimmedName)
        .first();
      if (!rosterMatch) {
        return c.json({ error: 'Nama tidak terdaftar di daftar siswa kelas tugas ini' }, 403);
      }
    }
    const maxFiles = 20;
    const maxFileBytes = 100 * 1024 * 1024;
    const uploadFiles: File[] = [];
    formData.forEach((value, key) => {
      if (key.startsWith('file_') && value instanceof File && value.size > 0) {
        uploadFiles.push(value);
      }
    });
    if (uploadFiles.length === 0) return c.json({ error: 'Minimal 1 file harus diunggah' }, 400);
    if (uploadFiles.length > maxFiles) return c.json({ error: 'Maksimal 20 file per pengumpulan' }, 400);
    const submissionType = task.submission_type || 'image';
    const fileUrls: string[] = [];
    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      if (file.size > maxFileBytes) {
        return c.json({ error: `File terlalu besar (maks 100MB per file)` }, 400);
      }
      if (!fileMatchesSubmissionType(file.type, submissionType)) {
        return c.json({ error: 'Tipe file tidak sesuai tugas' }, 400);
      }
      const safeStudentName = trimmedName.replace(/[^a-zA-Z0-9]/g, '_');
      const baseLabel =
        submissionType === 'audio'
          ? `${safeStudentName}_${i + 1}.mp3`
          : `${safeStudentName}_${i + 1}_${file.name || 'file'}`;
      const fileName = generateUniqueFileName(baseLabel);
      const contentType =
        submissionType === 'audio' ? 'audio/mpeg' : file.type || 'application/octet-stream';
      await c.env.SUBMISSION_FILES.put(fileName, file.stream(), {
        httpMetadata: { contentType },
      });
      fileUrls.push(`${c.env.SUBMISSION_FILES_PUBLIC_URL}/${fileName}`);
    }
    const id = generateId();
    const totalBytes = uploadFiles.reduce((sum, f) => sum + f.size, 0);
    await c.env.DB.prepare(
      `INSERT INTO submissions (id, task_id, student_name, student_class, file_url, student_note, byte_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, task_id, trimmedName, trimmedClass, JSON.stringify(fileUrls), student_note, totalBytes)
      .run();
    const replacedCount = await removeOtherStudentSubmissions(
      c.env,
      task_id,
      trimmedName,
      trimmedClass,
      id,
    );
    return c.json({
      success: true,
      submission_id: id,
      file_urls: fileUrls,
      replaced: replacedCount > 0,
    }, 201);
  } catch (e) {
    console.error('submission error', e);
    return c.json({ error: 'Gagal mengirim tugas' }, 500);
  } finally {
    if (releaseSlot) {
      try {
        await releaseSlot();
      } catch {
        /* slot will expire via TTL */
      }
    }
  }
});

export default submissions;
