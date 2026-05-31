import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, JwtPayload } from './env';
import {
  generateId,
  generateUniqueFileName,
  hashPassword,
  signJWT,
  verifyJWT,
  verifyPassword,
} from './lib/crypto';
import { resolveTeacherFileAccess } from './lib/fileAccess';
import {
  acquireSubmitSlot,
  checkSubmissionRateLimits,
  clientIp,
} from './lib/submitThrottle';
import { checkAdminRateLimit } from './lib/adminThrottle';
import {
  deleteSubmissionR2Files,
  fileMatchesSubmissionType,
  objectBytes,
  r2KeyFromUrl,
} from './lib/r2';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  }),
);

async function requireAuth(c: { req: { header: (n: string) => string | undefined }; env: Env }) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return (await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET)) as JwtPayload;
  } catch {
    return null;
  }
}

function requireAdminKey(c: { req: { header: (n: string) => string | undefined }; env: Env }) {
  const key = c.req.header('X-Admin-Key');
  return !!(key && key === c.env.SETUP_KEY);
}

async function requireAdminAccess(
  c: { req: { header: (n: string) => string | undefined }; env: Env },
): Promise<Response | null> {
  if (!requireAdminKey(c)) {
    return new Response(JSON.stringify({ error: 'Akses ditolak' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const rate = await checkAdminRateLimit(c.env, clientIp(c.req));
  if (!rate.ok) {
    return new Response(JSON.stringify({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfterSec) },
    });
  }
  return null;
}

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

app.get('/api/health', (c) => c.text('OK'));

/** Proxy unduhan R2 — menghindari CORS bucket publik di browser */
app.get('/api/files/blob', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);

  const fileUrl = c.req.query('url');
  if (!fileUrl?.trim()) return c.json({ error: 'Parameter url wajib' }, 400);

  const access = await resolveTeacherFileAccess(c.env, payload.sub, fileUrl.trim());
  if (!access) return c.json({ error: 'File tidak ditemukan atau tidak diizinkan' }, 403);

  const obj = await access.bucket.get(access.key);
  if (!obj) return c.json({ error: 'File tidak ditemukan di penyimpanan' }, 404);

  const headers = new Headers();
  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'private, max-age=3600');

  return new Response(obj.body, { headers });
});

app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    if (!email || !password) return c.json({ error: 'Email dan password wajib diisi' }, 400);
    const teacher = await c.env.DB.prepare(
      'SELECT id, email, password_hash FROM teachers WHERE email = ?',
    )
      .bind(email.trim().toLowerCase())
      .first<{ id: string; email: string; password_hash: string }>();
    if (!teacher) return c.json({ error: 'Email atau password salah' }, 401);
    if (!(await verifyPassword(password, teacher.password_hash))) {
      return c.json({ error: 'Email atau password salah' }, 401);
    }
    if (!c.env.JWT_SECRET?.trim()) {
      console.error('JWT_SECRET tidak dikonfigurasi');
      return c.json({ error: 'Server autentikasi belum dikonfigurasi' }, 503);
    }
    const token = await signJWT(
      {
        sub: teacher.id,
        email: teacher.email,
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
      c.env.JWT_SECRET,
    );
    return c.json({ token, teacher_id: teacher.id });
  } catch (e) {
    console.error('login error', e);
    return c.json({ error: 'Login gagal' }, 500);
  }
});

app.get('/api/auth/check', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ valid: true, teacher_id: payload.sub });
});

app.post('/api/setup/create-teacher', async (c) => {
  try {
    const { email, password, setup_key } = await c.req.json<{
      email: string;
      password: string;
      setup_key: string;
    }>();
    if (!setup_key || setup_key !== c.env.SETUP_KEY) {
      return c.json({ error: 'Setup key tidak valid' }, 403);
    }
    if (!email || !password) return c.json({ error: 'Email dan password wajib diisi' }, 400);
    if (password.length < 8) return c.json({ error: 'Password minimal 8 karakter' }, 400);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await c.env.DB.prepare('SELECT id FROM teachers WHERE email = ?')
      .bind(normalizedEmail)
      .first();
    if (existing) return c.json({ error: 'Email sudah terdaftar' }, 400);
    const id = generateId();
    const password_hash = await hashPassword(password);
    await c.env.DB.prepare('INSERT INTO teachers (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(id, normalizedEmail, password_hash)
      .run();
    return c.json({ success: true, teacher_id: id }, 201);
  } catch {
    return c.json({ error: 'Gagal membuat akun' }, 500);
  }
});

app.get('/api/tasks', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  const result = await c.env.DB.prepare(
    'SELECT * FROM tasks WHERE teacher_id = ? ORDER BY created_at DESC',
  )
    .bind(payload.sub)
    .all();
  return c.json({ tasks: result.results });
});

app.get('/api/tasks/code/:code/classes/:classId/students', async (c) => {
  const { code, classId } = c.req.param();
  const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE task_code = ?')
    .bind(code)
    .first<{ id: string }>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const link = await c.env.DB.prepare(
    'SELECT 1 FROM task_classes WHERE task_id = ? AND class_id = ?',
  )
    .bind(task.id, classId)
    .first();
  if (!link) return c.json({ error: 'Kelas tidak terkait dengan tugas ini' }, 403);
  const rows = await c.env.DB.prepare(
    'SELECT id, name FROM students WHERE class_id = ? ORDER BY name',
  )
    .bind(classId)
    .all();
  return c.json({ students: rows.results });
});

app.get('/api/tasks/code/:code/classes', async (c) => {
  const { code } = c.req.param();
  const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE task_code = ?')
    .bind(code)
    .first<{ id: string }>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.name FROM classes c
     JOIN task_classes tc ON c.id = tc.class_id
     WHERE tc.task_id = ? ORDER BY c.name`,
  )
    .bind(task.id)
    .all();
  return c.json({ classes: rows.results });
});

app.get('/api/tasks/code/:code', async (c) => {
  const { code } = c.req.param();
  const task = await c.env.DB.prepare(
    `SELECT id, title, description, subject, deadline, file_url, task_code, submission_type, created_at
     FROM tasks WHERE task_code = ?`,
  )
    .bind(code)
    .first();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const tc = await c.env.DB.prepare(
    'SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?',
  )
    .bind((task as { id: string }).id)
    .all();
  return c.json({ task: { ...task, classes: tc.results || [] } });
});

app.get('/api/tasks/:id/submissions', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const task = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ? AND teacher_id = ?')
    .bind(id, payload.sub)
    .first();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const result = await c.env.DB.prepare(
    'SELECT * FROM submissions WHERE task_id = ? ORDER BY created_at DESC',
  )
    .bind(id)
    .all();
  return c.json({ submissions: result.results });
});

app.get('/api/tasks/:id', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND teacher_id = ?')
    .bind(id, payload.sub)
    .first();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const tc = await c.env.DB.prepare(
    'SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?',
  )
    .bind(id)
    .all();
  return c.json({ task: { ...task, classes: tc.results || [] } });
});

app.post('/api/tasks', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const formData = await c.req.formData();
    const title = formData.get('title');
    const subject = formData.get('subject');
    const deadline = formData.get('deadline');
    const description = (formData.get('description') as string) || null;
    const submission_type = (formData.get('submission_type') as string) || 'image';
    const file = formData.get('file');
    const allowed = new Set(['image', 'video', 'audio']);
    if (!allowed.has(submission_type)) return c.json({ error: 'Tipe pengumpulan tidak valid' }, 400);
    if (!title || !subject || !deadline) {
      return c.json({ error: 'Title, subject, dan deadline wajib diisi' }, 400);
    }
    let file_url: string | null = null;
    if (file && typeof file === 'object' && 'size' in file && (file as File).size > 0) {
      const f = file as File;
      const fileName = generateUniqueFileName(f.name || 'attachment');
      await c.env.TASK_FILES.put(fileName, await f.arrayBuffer(), {
        httpMetadata: { contentType: f.type || 'application/octet-stream' },
      });
      file_url = `${c.env.TASK_FILES_PUBLIC_URL}/${fileName}`;
    }
    const id = generateId();
    let task_code = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      task_code = String(Math.floor(1e5 + Math.random() * 9e5));
      try {
        await c.env.DB.prepare(
          `INSERT INTO tasks (id, teacher_id, title, description, subject, deadline, file_url, task_code, submission_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, payload.sub, title, description, subject, deadline, file_url, task_code, submission_type)
          .run();
        break;
      } catch {
        if (attempt === 49) return c.json({ error: 'Gagal membuat kode tugas unik. Silakan coba lagi.' }, 409);
      }
    }
    const classesVal = formData.get('classes');
    if (classesVal) {
      let classIds: string[];
      try {
        classIds = JSON.parse(classesVal as string);
      } catch {
        return c.json({ error: 'Format data kelas tidak valid' }, 400);
      }
      if (!Array.isArray(classIds)) return c.json({ error: 'Format data kelas tidak valid' }, 400);
      for (const cid of classIds) {
        const cls = await c.env.DB.prepare(
          'SELECT id FROM classes WHERE id = ? AND teacher_id = ?',
        )
          .bind(cid, payload.sub)
          .first();
        if (!cls) return c.json({ error: 'Kelas tidak valid atau bukan milik Anda' }, 400);
        await c.env.DB.prepare('INSERT INTO task_classes (task_id, class_id) VALUES (?, ?)')
          .bind(id, cid)
          .run();
      }
    }
    const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
    const tc = await c.env.DB.prepare(
      'SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?',
    )
      .bind(id)
      .all();
    return c.json({ task: { ...task, classes: tc.results || [] } }, 201);
  } catch {
    return c.json({ error: 'Gagal membuat tugas' }, 500);
  }
});

app.delete('/api/tasks/:id', async (c) => {
  const payload = await requireAuth(c);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const task = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND teacher_id = ?')
    .bind(id, payload.sub)
    .first<{ file_url: string | null }>();
  if (!task) return c.json({ error: 'Tugas tidak ditemukan' }, 404);
  const subs = await c.env.DB.prepare('SELECT file_url FROM submissions WHERE task_id = ?')
    .bind(id)
    .all<{ file_url: string }>();
  for (const sub of subs.results ?? []) {
    await deleteSubmissionR2Files(c.env.SUBMISSION_FILES, sub.file_url);
  }
  if (task.file_url) {
    try {
      await c.env.TASK_FILES.delete(r2KeyFromUrl(task.file_url));
    } catch {
      /* ignore */
    }
  }
  await c.env.DB.prepare('DELETE FROM task_classes WHERE task_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM submissions WHERE task_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ? AND teacher_id = ?').bind(id, payload.sub).run();
  return c.json({ success: true });
});

app.post('/api/submissions', async (c) => {
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

app.get('/api/storage/usage', async (c) => {
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

app.get('/api/admin/teachers', async (c) => {
  const access = await requireAdminAccess(c);
  if (access) return access;
  const result = await c.env.DB.prepare(
    'SELECT id, email, created_at FROM teachers ORDER BY created_at DESC',
  ).all();
  return c.json({ teachers: result.results });
});

app.post('/api/admin/teachers', async (c) => {
  const access = await requireAdminAccess(c);
  if (access) return access;
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: 'Email dan password wajib diisi' }, 400);
  if (password.length < 8) return c.json({ error: 'Password minimal 8 karakter' }, 400);
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await c.env.DB.prepare('SELECT id FROM teachers WHERE email = ?')
    .bind(normalizedEmail)
    .first();
  if (existing) return c.json({ error: 'Email sudah terdaftar' }, 400);
  const id = generateId();
  await c.env.DB.prepare('INSERT INTO teachers (id, email, password_hash) VALUES (?, ?, ?)')
    .bind(id, normalizedEmail, await hashPassword(password))
    .run();
  return c.json({ success: true, teacher: { id, email: normalizedEmail } }, 201);
});

app.put('/api/admin/teachers/:id', async (c) => {
  const access = await requireAdminAccess(c);
  if (access) return access;
  const { id } = c.req.param();
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email && !password) return c.json({ error: 'Tidak ada data yang diubah' }, 400);
  if (password && password.length < 8) return c.json({ error: 'Password minimal 8 karakter' }, 400);
  const teacher = await c.env.DB.prepare('SELECT id, email FROM teachers WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string }>();
  if (!teacher) return c.json({ error: 'Akun guru tidak ditemukan' }, 404);
  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== teacher.email) {
      const conflict = await c.env.DB.prepare('SELECT id FROM teachers WHERE email = ? AND id != ?')
        .bind(normalizedEmail, id)
        .first();
      if (conflict) return c.json({ error: 'Email sudah digunakan oleh akun lain' }, 400);
    }
    await c.env.DB.prepare('UPDATE teachers SET email = ? WHERE id = ?')
      .bind(email.trim().toLowerCase(), id)
      .run();
  }
  if (password) {
    await c.env.DB.prepare('UPDATE teachers SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(password), id)
      .run();
  }
  return c.json({ success: true });
});

app.delete('/api/admin/teachers/:id', async (c) => {
  const access = await requireAdminAccess(c);
  if (access) return access;
  const { id } = c.req.param();
  const teacher = await c.env.DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(id).first();
  if (!teacher) return c.json({ error: 'Akun guru tidak ditemukan' }, 404);
  const tasks = await c.env.DB.prepare('SELECT id, file_url FROM tasks WHERE teacher_id = ?')
    .bind(id)
    .all<{ id: string; file_url: string | null }>();
  for (const task of tasks.results ?? []) {
    const subs = await c.env.DB.prepare('SELECT file_url FROM submissions WHERE task_id = ?')
      .bind(task.id)
      .all<{ file_url: string }>();
    for (const sub of subs.results ?? []) {
      await deleteSubmissionR2Files(c.env.SUBMISSION_FILES, sub.file_url);
    }
    if (task.file_url) {
      try {
        await c.env.TASK_FILES.delete(r2KeyFromUrl(task.file_url));
      } catch {
        /* ignore */
      }
    }
    await c.env.DB.prepare('DELETE FROM task_classes WHERE task_id = ?').bind(task.id).run();
    await c.env.DB.prepare('DELETE FROM submissions WHERE task_id = ?').bind(task.id).run();
  }
  await c.env.DB.prepare(
    'DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE teacher_id = ?)',
  )
    .bind(id)
    .run();
  await c.env.DB.prepare(
    'DELETE FROM task_classes WHERE class_id IN (SELECT id FROM classes WHERE teacher_id = ?)',
  )
    .bind(id)
    .run();
  await c.env.DB.prepare('DELETE FROM classes WHERE teacher_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM tasks WHERE teacher_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM teachers WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

app.get('/api/classes', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.created_at, COUNT(s.id) as student_count
     FROM classes c LEFT JOIN students s ON s.class_id = c.id
     WHERE c.teacher_id = ? GROUP BY c.id ORDER BY c.name`,
  )
    .bind(teacher.sub)
    .all();
  return c.json({ classes: rows.results });
});

app.post('/api/classes', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Nama kelas wajib diisi' }, 400);
  const id = generateId();
  await c.env.DB.prepare('INSERT INTO classes (id, teacher_id, name) VALUES (?, ?, ?)')
    .bind(id, teacher.sub, name.trim())
    .run();
  return c.json({ id, name: name.trim() }, 201);
});

app.get('/api/classes/:id/students', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?')
    .bind(id, teacher.sub)
    .first();
  if (!cls) return c.json({ error: 'Kelas tidak ditemukan' }, 404);
  const rows = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM students WHERE class_id = ? ORDER BY name',
  )
    .bind(id)
    .all();
  return c.json({ students: rows.results });
});

app.post('/api/classes/:id/students', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?')
    .bind(id, teacher.sub)
    .first();
  if (!cls) return c.json({ error: 'Kelas tidak ditemukan' }, 404);
  const { names } = await c.req.json<{ names: string[] }>();
  if (!Array.isArray(names) || names.length === 0) {
    return c.json({ error: 'Daftar nama wajib diisi' }, 400);
  }
  const inserted: { id: string; name: string }[] = [];
  for (const n of names) {
    const trimmed = n?.trim();
    if (!trimmed) continue;
    const sid = generateId();
    await c.env.DB.prepare('INSERT INTO students (id, class_id, name) VALUES (?, ?, ?)')
      .bind(sid, id, trimmed)
      .run();
    inserted.push({ id: sid, name: trimmed });
  }
  if (inserted.length === 0) return c.json({ error: 'Daftar nama wajib diisi' }, 400);
  return c.json({ students: inserted }, 201);
});

app.put('/api/classes/:id', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?')
    .bind(id, teacher.sub)
    .first();
  if (!cls) return c.json({ error: 'Kelas tidak ditemukan' }, 404);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Nama kelas wajib diisi' }, 400);
  await c.env.DB.prepare('UPDATE classes SET name = ? WHERE id = ?').bind(name.trim(), id).run();
  return c.json({ success: true });
});

app.delete('/api/classes/:id', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?')
    .bind(id, teacher.sub)
    .first();
  if (!cls) return c.json({ error: 'Kelas tidak ditemukan' }, 404);
  await c.env.DB.prepare('DELETE FROM task_classes WHERE class_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM students WHERE class_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

app.put('/api/students/:id', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const student = await c.env.DB.prepare(
    `SELECT s.id FROM students s JOIN classes c ON s.class_id = c.id
     WHERE s.id = ? AND c.teacher_id = ?`,
  )
    .bind(id, teacher.sub)
    .first();
  if (!student) return c.json({ error: 'Siswa tidak ditemukan' }, 404);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Nama siswa wajib diisi' }, 400);
  await c.env.DB.prepare('UPDATE students SET name = ? WHERE id = ?').bind(name.trim(), id).run();
  return c.json({ success: true });
});

app.delete('/api/students/:id', async (c) => {
  const teacher = await requireAuth(c);
  if (!teacher) return c.json({ error: 'Unauthorized' }, 401);
  const { id } = c.req.param();
  const student = await c.env.DB.prepare(
    `SELECT s.id FROM students s JOIN classes c ON s.class_id = c.id
     WHERE s.id = ? AND c.teacher_id = ?`,
  )
    .bind(id, teacher.sub)
    .first();
  if (!student) return c.json({ error: 'Siswa tidak ditemukan' }, 404);
  await c.env.DB.prepare('DELETE FROM students WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
