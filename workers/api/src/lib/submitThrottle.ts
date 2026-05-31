import type { Env } from '../env';
import { clientIp } from './ip';
import { checkRateLimit, type RateLimitConfig } from './rateLimiter';

/** Upload bersamaan per tugas (siswa lain menunggu / retry). */
const MAX_CONCURRENT_PER_TASK = 8;
const SLOT_TTL_MS = 3 * 60 * 1000;

/** Per IP + tugas per menit. */
const MAX_PER_IP_PER_TASK_PER_MIN = 12;
/** Per siswa (nama+kelas) + tugas per 5 menit. */
const MAX_PER_STUDENT_PER_TASK_PER_5MIN = 5;

function nowMs() {
  return Date.now();
}

export { clientIp } from './ip';

export function studentBucketKey(taskId: string, studentName: string, studentClass: string) {
  const n = studentName.trim().toLowerCase();
  const c = studentClass.trim().toLowerCase();
  const fiveMin = Math.floor(nowMs() / (5 * 60_000));
  return `student:${taskId}:${n}|${c}:${fiveMin}`;
}

export async function checkSubmissionRateLimits(
  env: Env,
  opts: { taskId: string; ip: string; studentName: string; studentClass: string },
): Promise<{ ok: true } | { ok: false; retryAfterSec: number; message: string }> {
  const minute = Math.floor(nowMs() / 60_000);

  const ipResult = await checkRateLimit(env.DB, `ip:${opts.taskId}:${opts.ip}:${minute}`, {
    prefix: 'ip',
    limit: MAX_PER_IP_PER_TASK_PER_MIN,
    windowMs: 60_000,
    ttlMs: 90_000,
    retryAfterSec: 45,
  });
  if (!ipResult.ok) {
    return {
      ok: false,
      retryAfterSec: ipResult.retryAfterSec,
      message: 'Server sedang sibuk menerima tugas dari kelas ini. Tunggu sekitar 1 menit lalu kirim lagi.',
    };
  }

  const studentKey = studentBucketKey(opts.taskId, opts.studentName, opts.studentClass);
  const studentResult = await checkRateLimit(env.DB, studentKey, {
    prefix: 'student',
    limit: MAX_PER_STUDENT_PER_TASK_PER_5MIN,
    windowMs: 5 * 60_000,
    ttlMs: 5 * 60_000,
    retryAfterSec: 45,
  });
  if (!studentResult.ok) {
    return {
      ok: false,
      retryAfterSec: studentResult.retryAfterSec,
      message: 'Anda sudah mengirim beberapa kali. Tunggu sebentar sebelum mengirim lagi.',
    };
  }

  return { ok: true };
}

export async function acquireSubmitSlot(
  env: Env,
  taskId: string,
): Promise<
  | { ok: true; slotId: string; release: () => Promise<void> }
  | { ok: false; retryAfterSec: number; message: string }
> {
  const now = nowMs();
  const slotId = crypto.randomUUID();
  const expiresAt = now + SLOT_TTL_MS;

  const result = await env.DB.prepare(
    `INSERT INTO submit_slots (id, task_id, expires_at)
     SELECT ?, ?, ?
     WHERE (SELECT COUNT(*) FROM submit_slots WHERE task_id = ? AND expires_at >= ?) < ?`,
  )
    .bind(slotId, taskId, expiresAt, taskId, now, MAX_CONCURRENT_PER_TASK)
    .run();

  if (result.meta.changes === 0) {
    return {
      ok: false,
      retryAfterSec: 20,
      message:
        'Banyak siswa sedang mengirim tugas bersamaan. Mohon tunggu — aplikasi akan mencoba lagi otomatis.',
    };
  }

  const release = async () => {
    await env.DB.prepare('DELETE FROM submit_slots WHERE id = ?').bind(slotId).run();
  };

  return { ok: true, slotId, release };
}
