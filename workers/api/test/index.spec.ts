import { describe, expect, it } from 'vitest';
import app from '../src/index';

describe('App structure', () => {
  it('exports a Hono app', () => {
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe('function');
  });

  it('responds to health check', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await app.fetch(req, {
      DB: {} as D1Database,
      TASK_FILES: {} as R2Bucket,
      SUBMISSION_FILES: {} as R2Bucket,
      JWT_SECRET: 'test',
      SETUP_KEY: 'test',
      TASK_FILES_PUBLIC_URL: 'https://test.r2.dev',
      SUBMISSION_FILES_PUBLIC_URL: 'https://test.r2.dev',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  it('returns 404 for unknown route', async () => {
    const env = { DB: {} as D1Database, TASK_FILES: {} as R2Bucket, SUBMISSION_FILES: {} as R2Bucket, JWT_SECRET: 'test', SETUP_KEY: 'test', TASK_FILES_PUBLIC_URL: '', SUBMISSION_FILES_PUBLIC_URL: '' };
    const req = new Request('http://localhost/api/nonexistent');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it('handles CORS preflight', async () => {
    const env = { DB: {} as D1Database, TASK_FILES: {} as R2Bucket, SUBMISSION_FILES: {} as R2Bucket, JWT_SECRET: 'test', SETUP_KEY: 'test', TASK_FILES_PUBLIC_URL: '', SUBMISSION_FILES_PUBLIC_URL: '' };
    const req = new Request('http://localhost/api/health', { method: 'OPTIONS' });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(204);
  });

  it('returns 401 for unauthenticated tasks access', async () => {
    const env = { DB: {} as D1Database, TASK_FILES: {} as R2Bucket, SUBMISSION_FILES: {} as R2Bucket, JWT_SECRET: 'test', SETUP_KEY: 'test', TASK_FILES_PUBLIC_URL: '', SUBMISSION_FILES_PUBLIC_URL: '' };
    const req = new Request('http://localhost/api/tasks');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 401 for unauthenticated classes access', async () => {
    const env = { DB: {} as D1Database, TASK_FILES: {} as R2Bucket, SUBMISSION_FILES: {} as R2Bucket, JWT_SECRET: 'test', SETUP_KEY: 'test', TASK_FILES_PUBLIC_URL: '', SUBMISSION_FILES_PUBLIC_URL: '' };
    const req = new Request('http://localhost/api/classes');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 403 for admin access without key', async () => {
    const env = { DB: {} as D1Database, TASK_FILES: {} as R2Bucket, SUBMISSION_FILES: {} as R2Bucket, JWT_SECRET: 'test', SETUP_KEY: 'test', TASK_FILES_PUBLIC_URL: '', SUBMISSION_FILES_PUBLIC_URL: '' };
    const req = new Request('http://localhost/api/admin/teachers');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(403);
  });

  it('returns 401 for unauthenticated storage access', async () => {
    const env = { DB: {} as D1Database, TASK_FILES: {} as R2Bucket, SUBMISSION_FILES: {} as R2Bucket, JWT_SECRET: 'test', SETUP_KEY: 'test', TASK_FILES_PUBLIC_URL: '', SUBMISSION_FILES_PUBLIC_URL: '' };
    const req = new Request('http://localhost/api/storage/usage');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(401);
  });
});

describe('Route modules', () => {
  it('all route modules are importable', async () => {
    const auth = await import('../src/routes/auth');
    const tasks = await import('../src/routes/tasks');
    const classes = await import('../src/routes/classes');
    const submissions = await import('../src/routes/submissions');
    const admin = await import('../src/routes/admin');
    const files = await import('../src/routes/files');
    const storage = await import('../src/routes/storage');
    expect(auth.default).toBeDefined();
    expect(tasks.default).toBeDefined();
    expect(classes.default).toBeDefined();
    expect(submissions.default).toBeDefined();
    expect(admin.default).toBeDefined();
    expect(files.default).toBeDefined();
    expect(storage.default).toBeDefined();
  });
});

describe('Lib modules', () => {
  it('crypto helpers work', async () => {
    const { hashPassword, verifyPassword, generateId, signJWT, verifyJWT } = await import('../src/lib/crypto');
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');

    const hash = await hashPassword('test123');
    expect(hash).toBeTruthy();
    expect(await verifyPassword('test123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('pagination params helper', async () => {
    const { paginationParams } = await import('../src/lib/pagination');
    const c = { req: { query: () => undefined } };
    expect(paginationParams(c as never)).toEqual({ limit: 20, offset: 0 });

    const c2 = { req: { query: (k: string) => k === 'limit' ? '5' : '10' } };
    expect(paginationParams(c2 as never)).toEqual({ limit: 5, offset: 10 });

    const c3 = { req: { query: (k: string) => k === 'limit' ? '999' : '0' } };
    expect(paginationParams(c3 as never)).toEqual({ limit: 100, offset: 0 });
  });

  it('R2 helpers work', async () => {
    const { r2KeyFromUrl, fileMatchesSubmissionType } = await import('../src/lib/r2');
    expect(r2KeyFromUrl('https://pub.r2.dev/myfile.jpg')).toBe('myfile.jpg');
    expect(r2KeyFromUrl('https://pub.r2.dev/path/to/file.pdf')).toBe('path/to/file.pdf');
    expect(fileMatchesSubmissionType('image/jpeg', 'image')).toBe(true);
    expect(fileMatchesSubmissionType('video/mp4', 'video')).toBe(true);
    expect(fileMatchesSubmissionType('audio/mpeg', 'audio')).toBe(true);
    expect(fileMatchesSubmissionType('application/pdf', 'image')).toBe(false);
  });
});
