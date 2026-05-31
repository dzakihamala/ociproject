import type { Env } from '../env';
import { generateId, generateUniqueFileName } from './crypto';
import { deleteSubmissionR2Files, fileMatchesSubmissionType } from './r2';
import { checkSubmissionRateLimits, acquireSubmitSlot } from './submitThrottle';
import { clientIp } from './ip';

// ── Pipeline result types ──

export type SubmissionSuccess = {
  submission_id: string;
  file_urls: string[];
  replaced: boolean;
};

export type SubmissionError = {
  error: string;
  status: number;
  retryAfter?: number;
};

export type SubmissionResult =
  | { ok: true; value: SubmissionSuccess }
  | { ok: false; error: SubmissionError };

// ── Pipeline input ──

export interface SubmissionRequest {
  formData: FormData;
  env: Env;
  req: { header: (n: string) => string | undefined };
}

// ── Private helpers ──

async function removeOtherStudentSubmissions(
  env: Env,
  taskId: string,
  studentName: string,
  studentClass: string,
  keepId: string,
): Promise<number> {
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

// ── Pipeline ──

export async function processSubmission(req: SubmissionRequest): Promise<SubmissionResult> {
  let releaseSlot: (() => Promise<void>) | null = null;

  try {
    // 1. Parse & validate fields
    const formData = req.formData;
    const task_code = formData.get('task_code');
    const task_id_form = formData.get('task_id');
    const student_name = formData.get('student_name');
    const student_class = formData.get('student_class');
    const student_note = (formData.get('student_note') as string) || null;

    if (!task_code || !student_name || !student_class) {
      return { ok: false, error: { error: 'task_code, student_name, dan student_class wajib diisi', status: 400 } };
    }

    const trimmedCode = String(task_code).trim();
    const trimmedName = String(student_name).trim();
    const trimmedClass = String(student_class).trim();

    if (!trimmedCode || !trimmedName || !trimmedClass) {
      return { ok: false, error: { error: 'Kode tugas, nama, dan kelas wajib diisi', status: 400 } };
    }

    // 2. Resolve task
    const task = await req.env.DB.prepare(
      'SELECT id, submission_type FROM tasks WHERE task_code = ?',
    )
      .bind(trimmedCode)
      .first<{ id: string; submission_type: string }>();

    if (!task) {
      return { ok: false, error: { error: 'Tugas tidak ditemukan', status: 404 } };
    }

    if (task_id_form && task_id_form !== task.id) {
      return { ok: false, error: { error: 'Data tugas tidak valid', status: 403 } };
    }

    // 3. Rate limits
    const ip = clientIp(req.req);
    const rate = await checkSubmissionRateLimits(req.env, {
      taskId: task.id,
      ip,
      studentName: trimmedName,
      studentClass: trimmedClass,
    });
    if (!rate.ok) {
      return { ok: false, error: { error: rate.message, status: 429, retryAfter: rate.retryAfterSec } };
    }

    // 4. Acquire slot
    const slot = await acquireSubmitSlot(req.env, task.id);
    if (!slot.ok) {
      return { ok: false, error: { error: slot.message, status: 429, retryAfter: slot.retryAfterSec } };
    }
    releaseSlot = slot.release;

    // 5. Validate roster
    const hasTargetClasses = await req.env.DB.prepare(
      'SELECT 1 FROM task_classes WHERE task_id = ? LIMIT 1',
    )
      .bind(task.id)
      .first();

    if (hasTargetClasses) {
      const rosterMatch = await req.env.DB.prepare(
        `SELECT 1 FROM students s
         JOIN classes c ON s.class_id = c.id
         JOIN task_classes tc ON tc.class_id = c.id AND tc.task_id = ?
         WHERE LOWER(c.name) = LOWER(?) AND LOWER(s.name) = LOWER(?)`,
      )
        .bind(task.id, trimmedClass, trimmedName)
        .first();

      if (!rosterMatch) {
        return { ok: false, error: { error: 'Nama tidak terdaftar di daftar siswa kelas tugas ini', status: 403 } };
      }
    }

    // 6. Validate & upload files
    const maxFiles = 20;
    const maxFileBytes = 100 * 1024 * 1024;
    const uploadFiles: File[] = [];
    formData.forEach((value, key) => {
      if (key.startsWith('file_') && value instanceof File && value.size > 0) {
        uploadFiles.push(value);
      }
    });

    if (uploadFiles.length === 0) {
      return { ok: false, error: { error: 'Minimal 1 file harus diunggah', status: 400 } };
    }
    if (uploadFiles.length > maxFiles) {
      return { ok: false, error: { error: 'Maksimal 20 file per pengumpulan', status: 400 } };
    }

    const submissionType = task.submission_type || 'image';
    const fileUrls: string[] = [];

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      if (file.size > maxFileBytes) {
        return { ok: false, error: { error: 'File terlalu besar (maks 100MB per file)', status: 400 } };
      }
      if (!fileMatchesSubmissionType(file.type, submissionType)) {
        return { ok: false, error: { error: 'Tipe file tidak sesuai tugas', status: 400 } };
      }
      const safeStudentName = trimmedName.replace(/[^a-zA-Z0-9]/g, '_');
      const baseLabel =
        submissionType === 'audio'
          ? `${safeStudentName}_${i + 1}.mp3`
          : `${safeStudentName}_${i + 1}_${file.name || 'file'}`;
      const fileName = generateUniqueFileName(baseLabel);
      const contentType =
        submissionType === 'audio' ? 'audio/mpeg' : file.type || 'application/octet-stream';
      await req.env.SUBMISSION_FILES.put(fileName, file.stream(), {
        httpMetadata: { contentType },
      });
      fileUrls.push(`${req.env.SUBMISSION_FILES_PUBLIC_URL}/${fileName}`);
    }

    // 7. Commit to database
    const id = generateId();
    const totalBytes = uploadFiles.reduce((sum, f) => sum + f.size, 0);
    await req.env.DB.prepare(
      `INSERT INTO submissions (id, task_id, student_name, student_class, file_url, student_note, byte_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, task.id, trimmedName, trimmedClass, JSON.stringify(fileUrls), student_note, totalBytes)
      .run();

    // 8. Deduplicate
    const replacedCount = await removeOtherStudentSubmissions(
      req.env,
      task.id,
      trimmedName,
      trimmedClass,
      id,
    );

    return {
      ok: true,
      value: {
        submission_id: id,
        file_urls: fileUrls,
        replaced: replacedCount > 0,
      },
    };
  } catch (e) {
    console.error('submission error', e);
    return { ok: false, error: { error: 'Gagal mengirim tugas', status: 500 } };
  } finally {
    if (releaseSlot) {
      try {
        await releaseSlot();
      } catch {
        /* slot will expire via TTL */
      }
    }
  }
}
