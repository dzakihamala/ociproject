import type { Env } from '../env';

/** Upload bersamaan per tugas (siswa lain menunggu / retry). */
const MAX_CONCURRENT_PER_TASK = 8;
/** Per IP + tugas per menit. */
const MAX_PER_IP_PER_TASK_PER_MIN = 12;
/** Per siswa (nama+kelas) + tugas per 5 menit. */
const MAX_PER_STUDENT_PER_TASK_PER_5MIN = 5;

const SLOT_TTL_MS = 3 * 60 * 1000;
const RATE_BUCKET_TTL_MS = 6 * 60 * 1000;

let tablesReady: Promise<void> | null = null;

function nowMs() {
  return Date.now();
}

function minuteBucket() {
  return Math.floor(nowMs() / 60_000);
}

function fiveMinBucket() {
  return Math.floor(nowMs() / (5 * 60_000));
}

export function clientIp(req: { header: (n: string) => string | undefined }) {
  return (
    req.header('CF-Connecting-IP') ||
    req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function studentBucketKey(taskId: string, studentName: string, studentClass: string) {
  const n = studentName.trim().toLowerCase();
  const c = studentClass.trim().toLowerCase();
  return `student:${taskId}:${n}|${c}:${fiveMinBucket()}`;
}

async function ensureTables(db: D1Database) {
  if (!tablesReady) {
    tablesReady = db
      .batch([
        db.prepare(
          `CREATE TABLE IF NOT EXISTS submit_slots (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL
          )`,
        ),
        db.prepare(
          `CREATE INDEX IF NOT EXISTS idx_submit_slots_task_expires
           ON submit_slots (task_id, expires_at)`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS submit_rate_buckets (
            bucket_key TEXT PRIMARY KEY,
            hits INTEGER NOT NULL DEFAULT 0,
            expires_at INTEGER NOT NULL
          )`,
        ),
        db.prepare(
          `CREATE INDEX IF NOT EXISTS idx_submit_rate_expires
           ON submit_rate_buckets (expires_at)`,
        ),
      ])
      .then(() => undefined);
  }
  await tablesReady;
}

async function purgeExpired(db: D1Database, now: number) {
  await db.batch([
    db.prepare('DELETE FROM submit_slots WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM submit_rate_buckets WHERE expires_at < ?').bind(now),
  ]);
}

async function bumpRateBucket(
  db: D1Database,
  bucketKey: string,
  limit: number,
  ttlMs: number,
  now: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const expiresAt = now + ttlMs;
  const row = await db
    .prepare('SELECT hits FROM submit_rate_buckets WHERE bucket_key = ?')
    .bind(bucketKey)
    .first<{ hits: number }>();

  if (!row) {
    await db
      .prepare(
        'INSERT INTO submit_rate_buckets (bucket_key, hits, expires_at) VALUES (?, 1, ?)',
      )
      .bind(bucketKey, expiresAt)
      .run();
    return { ok: true };
  }

  if (row.hits >= limit) {
    return { ok: false, retryAfterSec: 45 };
  }

  await db
    .prepare('UPDATE submit_rate_buckets SET hits = hits + 1 WHERE bucket_key = ?')
    .bind(bucketKey)
    .run();
  return { ok: true };
}

export async function checkSubmissionRateLimits(
  env: Env,
  opts: { taskId: string; ip: string; studentName: string; studentClass: string },
): Promise<{ ok: true } | { ok: false; retryAfterSec: number; message: string }> {
  await ensureTables(env.DB);
  const now = nowMs();
  await purgeExpired(env.DB, now);

  const ipKey = `ip:${opts.taskId}:${opts.ip}:${minuteBucket()}`;
  const ipCheck = await bumpRateBucket(
    env.DB,
    ipKey,
    MAX_PER_IP_PER_TASK_PER_MIN,
    90_000,
    now,
  );
  if (!ipCheck.ok) {
    return {
      ok: false,
      retryAfterSec: ipCheck.retryAfterSec,
      message:
        'Server sedang sibuk menerima tugas dari kelas ini. Tunggu sekitar 1 menit lalu kirim lagi.',
    };
  }

  const studentKey = studentBucketKey(opts.taskId, opts.studentName, opts.studentClass);
  const studentCheck = await bumpRateBucket(
    env.DB,
    studentKey,
    MAX_PER_STUDENT_PER_TASK_PER_5MIN,
    5 * 60_000,
    now,
  );
  if (!studentCheck.ok) {
    return {
      ok: false,
      retryAfterSec: studentCheck.retryAfterSec,
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
  await ensureTables(env.DB);
  const now = nowMs();
  await purgeExpired(env.DB, now);

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) as n FROM submit_slots WHERE task_id = ? AND expires_at >= ?',
  )
    .bind(taskId, now)
    .first<{ n: number }>();

  const active = countRow?.n ?? 0;
  if (active >= MAX_CONCURRENT_PER_TASK) {
    return {
      ok: false,
      retryAfterSec: 20,
      message:
        'Banyak siswa sedang mengirim tugas bersamaan. Mohon tunggu — aplikasi akan mencoba lagi otomatis.',
    };
  }

  const slotId = crypto.randomUUID();
  const expiresAt = now + SLOT_TTL_MS;
  await env.DB.prepare('INSERT INTO submit_slots (id, task_id, expires_at) VALUES (?, ?, ?)')
    .bind(slotId, taskId, expiresAt)
    .run();

  const release = async () => {
    await env.DB.prepare('DELETE FROM submit_slots WHERE id = ?').bind(slotId).run();
  };

  return { ok: true, slotId, release };
}
