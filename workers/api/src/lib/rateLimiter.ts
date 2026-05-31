/**
 * Unified rate limiter — single implementation shared by admin throttling
 * and submission throttling. Both use the `submit_rate_buckets` table
 * but with different key prefixes and limits.
 */

let tablesReady: Promise<void> | null = null;

function nowMs() {
  return Date.now();
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

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export interface RateLimitConfig {
  /** Unique key prefix for this rate limit (e.g. "admin", "ip", "student"). */
  prefix: string;
  /** Maximum hits allowed within the window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** TTL for the bucket row in milliseconds. Should be >= windowMs. */
  ttlMs: number;
  /** How long to tell the client to wait (in seconds) when rate limited. */
  retryAfterSec: number;
}

/**
 * Check a rate limit bucket.
 *
 * Returns { ok: true } if the request is allowed, or { ok: false, retryAfterSec }
 * if the limit has been exceeded. Automatically ensures the backing tables exist
 * and purges expired rows on every call.
 */
export async function checkRateLimit(
  db: D1Database,
  bucketKey: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  await ensureTables(db);
  const now = nowMs();
  await purgeExpired(db, now);

  const expiresAt = now + config.ttlMs;
  const row = await db
    .prepare('SELECT hits FROM submit_rate_buckets WHERE bucket_key = ?')
    .bind(bucketKey)
    .first<{ hits: number }>();

  if (!row) {
    await db
      .prepare('INSERT INTO submit_rate_buckets (bucket_key, hits, expires_at) VALUES (?, 1, ?)')
      .bind(bucketKey, expiresAt)
      .run();
    return { ok: true };
  }

  if (row.hits >= config.limit) {
    return { ok: false, retryAfterSec: config.retryAfterSec };
  }

  await db
    .prepare('UPDATE submit_rate_buckets SET hits = hits + 1 WHERE bucket_key = ?')
    .bind(bucketKey)
    .run();
  return { ok: true };
}
