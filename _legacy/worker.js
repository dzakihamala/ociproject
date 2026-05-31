var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/itty-router/index.mjs
var t = /* @__PURE__ */ __name(({ base: e = "", routes: t2 = [], ...o2 } = {}) => ({ __proto__: new Proxy({}, { get: /* @__PURE__ */ __name((o3, r2, a, s) => (o4, ...n) => t2.push([r2.toUpperCase?.(), RegExp(`^${(s = (e + o4).replace(/\/+(\/|$)/g, "$1")).replace(/(\/?\.?):(\w+)\+/g, "($1(?<$2>*))").replace(/(\/?\.?):(\w+)/g, "($1(?<$2>[^$1/]+?))").replace(/\./g, "\\.").replace(/(\/?)\*/g, "($1.*)?")}/*$`), n, s]) && a, "get") }), routes: t2, ...o2, async fetch(e2, ...r2) {
  let a, s, n = new URL(e2.url), c = e2.query = { __proto__: null };
  for (let [e3, t3] of n.searchParams) c[e3] = c[e3] ? [].concat(c[e3], t3) : t3;
  e: try {
    for (let t3 of o2.before || []) if (null != (a = await t3(e2.proxy ?? e2, ...r2))) break e;
    t: for (let [o3, c2, l, i] of t2) if ((o3 == e2.method || "ALL" == o3) && (s = n.pathname.match(c2))) {
      e2.params = s.groups || {}, e2.route = i;
      for (let t3 of l) if (null != (a = await t3(e2.proxy ?? e2, ...r2))) break t;
    }
  } catch (t3) {
    if (!o2.catch) throw t3;
    a = await o2.catch(t3, e2.proxy ?? e2, ...r2);
  }
  try {
    for (let t3 of o2.finally || []) a = await t3(a, e2.proxy ?? e2, ...r2) ?? a;
  } catch (t3) {
    if (!o2.catch) throw t3;
    a = await o2.catch(t3, e2.proxy ?? e2, ...r2);
  }
  return a;
} }), "t");
var o = /* @__PURE__ */ __name((e = "text/plain; charset=utf-8", t2) => (o2, r2 = {}) => {
  if (void 0 === o2 || o2 instanceof Response) return o2;
  const a = new Response(t2?.(o2) ?? o2, r2.url ? void 0 : r2);
  return a.headers.set("content-type", e), a;
}, "o");
var r = o("application/json; charset=utf-8", JSON.stringify);
var p = o("text/plain; charset=utf-8", String);
var f = o("text/html");
var u = o("image/jpeg");
var h = o("image/png");
var g = o("image/webp");

// src/index.js
var router = t();
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key"
};
router.options("*", () => new Response(null, { status: 204, headers: corsHeaders }));
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}
__name(json, "json");
function err(message, status = 400) {
  return json({ error: message }, status);
}
__name(err, "err");
function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(base64urlEncode, "base64urlEncode");
function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
__name(base64urlDecode, "base64urlDecode");
async function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = new TextEncoder();
  const encodedHeader = base64urlEncode(enc.encode(JSON.stringify(header)));
  const encodedPayload = base64urlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${base64urlEncode(signature)}`;
}
__name(signJWT, "signJWT");
async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Format token tidak valid");
  const enc = new TextEncoder();
  const signingInput = `${parts[0]}.${parts[1]}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlDecode(parts[2]),
    enc.encode(signingInput)
  );
  if (!valid) throw new Error("Signature token tidak valid");
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) {
    throw new Error("Token sudah kadaluarsa");
  }
  return payload;
}
__name(verifyJWT, "verifyJWT");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 1e5;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  return `pbkdf2:${iterations}:${saltB64}:${hashB64}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1]);
  const salt = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const expectedHash = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const actualHash = new Uint8Array(hashBuffer);
  if (actualHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}
__name(verifyPassword, "verifyPassword");
function generateId() {
  return crypto.randomUUID();
}
__name(generateId, "generateId");
function generateUniqueFileName(originalName) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const cleanName = originalName.replace(/[^a-zA-Z0-9.]/g, "_");
  return `${timestamp}_${randomStr}_${cleanName}`;
}
__name(generateUniqueFileName, "generateUniqueFileName");
function r2KeyFromUrl(url) {
  try {
    return new URL(url).pathname.slice(1);
  } catch {
    return url.split("/").pop().split("?")[0];
  }
}
__name(r2KeyFromUrl, "r2KeyFromUrl");
async function deleteSubmissionR2Files(env, fileUrlField) {
  let urls = [];
  try {
    urls = JSON.parse(fileUrlField);
  } catch {
    urls = fileUrlField ? [fileUrlField] : [];
  }
  for (const url of urls) {
    try {
      await env.SUBMISSION_FILES.delete(r2KeyFromUrl(url));
    } catch {
    }
  }
}
__name(deleteSubmissionR2Files, "deleteSubmissionR2Files");
async function removeOtherStudentSubmissions(env, taskId, studentName, studentClass, keepId) {
  const existing = await env.DB.prepare(
    "SELECT id, file_url FROM submissions WHERE task_id = ? AND student_name = ? AND student_class = ? AND id != ?"
  ).bind(taskId, studentName, studentClass, keepId).all();
  const rows = existing.results ?? [];
  for (const row of rows) {
    await deleteSubmissionR2Files(env, row.file_url);
    await env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(row.id).run();
  }
  return rows.length;
}
__name(removeOtherStudentSubmissions, "removeOtherStudentSubmissions");
function fileMatchesSubmissionType(mime, submissionType) {
  const m = (mime || "").toLowerCase();
  if (!m) return true;
  if (submissionType === "image") return m.startsWith("image/");
  if (submissionType === "video") return m.startsWith("video/");
  if (submissionType === "audio") return m.startsWith("audio/");
  return false;
}
__name(fileMatchesSubmissionType, "fileMatchesSubmissionType");
async function requireAuth(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    return await verifyJWT(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}
__name(requireAuth, "requireAuth");
router.get("/api/health", () => new Response("OK", { headers: corsHeaders }));
router.post("/api/auth/login", async (request, env) => {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) return err("Email dan password wajib diisi");
    const teacher = await env.DB.prepare("SELECT id, email, password_hash FROM teachers WHERE email = ?").bind(email.trim().toLowerCase()).first();
    if (!teacher) return err("Email atau password salah", 401);
    const valid = await verifyPassword(password, teacher.password_hash);
    if (!valid) return err("Email atau password salah", 401);
    const token = await signJWT(
      {
        sub: teacher.id,
        email: teacher.email,
        exp: Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60
        // 7 days
      },
      env.JWT_SECRET
    );
    return json({ token, teacher_id: teacher.id });
  } catch (e) {
    return err("Login gagal: " + e.message, 500);
  }
});
router.get("/api/auth/check", async (request, env) => {
  const payload = await requireAuth(request, env);
  if (!payload) return err("Unauthorized", 401);
  return json({ valid: true, teacher_id: payload.sub });
});
router.post("/api/setup/create-teacher", async (request, env) => {
  try {
    const body = await request.json();
    const { email, password, setup_key } = body;
    if (!setup_key || setup_key !== env.SETUP_KEY) {
      return err("Setup key tidak valid", 403);
    }
    if (!email || !password) return err("Email dan password wajib diisi");
    if (password.length < 8) return err("Password minimal 8 karakter");
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await env.DB.prepare("SELECT id FROM teachers WHERE email = ?").bind(normalizedEmail).first();
    if (existing) return err("Email sudah terdaftar");
    const password_hash = await hashPassword(password);
    const id = generateId();
    await env.DB.prepare("INSERT INTO teachers (id, email, password_hash) VALUES (?, ?, ?)").bind(id, normalizedEmail, password_hash).run();
    return json({ success: true, teacher_id: id }, 201);
  } catch (e) {
    return err("Gagal membuat akun: " + e.message, 500);
  }
});
router.get("/api/tasks", async (request, env) => {
  const payload = await requireAuth(request, env);
  if (!payload) return err("Unauthorized", 401);
  try {
    const result = await env.DB.prepare("SELECT * FROM tasks WHERE teacher_id = ? ORDER BY created_at DESC").bind(payload.sub).all();
    return json({ tasks: result.results });
  } catch (e) {
    return err("Gagal memuat tugas: " + e.message, 500);
  }
});
// Public routes — must be registered BEFORE /api/tasks/code/:code (itty-router matches trailing paths)
router.get('/api/tasks/code/:code/classes/:classId/students', async (request, env) => {
  const { code, classId } = request.params;
  try {
    const task = await env.DB.prepare('SELECT id FROM tasks WHERE task_code = ?').bind(code).first();
    if (!task) return err('Tugas tidak ditemukan', 404);
    const link = await env.DB.prepare(
      'SELECT 1 FROM task_classes WHERE task_id = ? AND class_id = ?'
    ).bind(task.id, classId).first();
    if (!link) return err('Kelas tidak terkait dengan tugas ini', 403);
    const rows = await env.DB.prepare(
      'SELECT id, name FROM students WHERE class_id = ? ORDER BY name'
    ).bind(classId).all();
    return json({ students: rows.results });
  } catch (e) {
    return err('Gagal memuat siswa: ' + e.message, 500);
  }
});
router.get('/api/tasks/code/:code/classes', async (request, env) => {
  const { code } = request.params;
  try {
    const task = await env.DB.prepare('SELECT id FROM tasks WHERE task_code = ?').bind(code).first();
    if (!task) return err('Tugas tidak ditemukan', 404);
    const rows = await env.DB.prepare(
      `SELECT c.id, c.name FROM classes c
       JOIN task_classes tc ON c.id = tc.class_id
       WHERE tc.task_id = ? ORDER BY c.name`
    ).bind(task.id).all();
    return json({ classes: rows.results });
  } catch (e) {
    return err('Gagal memuat kelas: ' + e.message, 500);
  }
});
router.get("/api/tasks/code/:code", async (request, env) => {
  const { code } = request.params;
  try {
    const task = await env.DB.prepare(
      `SELECT id, title, description, subject, deadline, file_url, task_code, submission_type, created_at
       FROM tasks WHERE task_code = ?`
    ).bind(code).first();
    if (!task) return err("Tugas tidak ditemukan", 404);
    const tc = await env.DB.prepare(
      "SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?"
    ).bind(task.id).all();
    task.classes = tc.results || [];
    return json({ task });
  } catch (e) {
    return err("Gagal memuat tugas: " + e.message, 500);
  }
});
router.get("/api/tasks/:id/submissions", async (request, env) => {
  const payload = await requireAuth(request, env);
  if (!payload) return err("Unauthorized", 401);
  const { id } = request.params;
  try {
    const task = await env.DB.prepare("SELECT id FROM tasks WHERE id = ? AND teacher_id = ?").bind(id, payload.sub).first();
    if (!task) return err("Tugas tidak ditemukan", 404);
    const result = await env.DB.prepare("SELECT * FROM submissions WHERE task_id = ? ORDER BY created_at DESC").bind(id).all();
    return json({ submissions: result.results });
  } catch (e) {
    return err("Gagal memuat pengumpulan: " + e.message, 500);
  }
});
router.get("/api/tasks/:id", async (request, env) => {
  const payload = await requireAuth(request, env);
  if (!payload) return err("Unauthorized", 401);
  const { id } = request.params;
  try {
    const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND teacher_id = ?").bind(id, payload.sub).first();
    if (!task) return err("Tugas tidak ditemukan", 404);
    const tc = await env.DB.prepare(
      "SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?"
    ).bind(task.id).all();
    task.classes = tc.results || [];
    return json({ task });
  } catch (e) {
    return err("Gagal memuat tugas: " + e.message, 500);
  }
});
router.post("/api/tasks", async (request, env) => {
  const payload = await requireAuth(request, env);
  if (!payload) return err("Unauthorized", 401);
  try {
    const formData = await request.formData();
    const title = formData.get("title");
    const subject = formData.get("subject");
    const deadline = formData.get("deadline");
    const description = formData.get("description") || null;
    const submission_type = formData.get("submission_type") || "image";
    const file = formData.get("file");
    const allowedSubmissionTypes = /* @__PURE__ */ new Set(["image", "video", "audio"]);
    if (!allowedSubmissionTypes.has(submission_type)) {
      return err("Tipe pengumpulan tidak valid", 400);
    }
    if (!title || !subject || !deadline) {
      return err("Title, subject, dan deadline wajib diisi");
    }
    let file_url = null;
    if (file && typeof file === "object" && file.size > 0) {
      const fileName = generateUniqueFileName(file.name || "attachment");
      const arrayBuffer = await file.arrayBuffer();
      await env.TASK_FILES.put(fileName, arrayBuffer, {
        httpMetadata: { contentType: file.type || "application/octet-stream" }
      });
      file_url = `${env.TASK_FILES_PUBLIC_URL}/${fileName}`;
    }
    let task_code;
    let codeExists = true;
    let codeAttempts = 0;
    while (codeExists) {
      if (++codeAttempts > 50) return err("Gagal membuat kode tugas unik", 500);
      task_code = String(Math.floor(1e5 + Math.random() * 9e5));
      const existing = await env.DB.prepare("SELECT id FROM tasks WHERE task_code = ?").bind(task_code).first();
      codeExists = !!existing;
    }
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO tasks (id, teacher_id, title, description, subject, deadline, file_url, task_code, submission_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, payload.sub, title, description, subject, deadline, file_url, task_code, submission_type).run();
    const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first();
    // Insert task-class links if provided
    const classesVal = formData.get("classes");
    if (classesVal) {
      let classIds;
      try {
        classIds = JSON.parse(classesVal);
      } catch {
        return err("Format data kelas tidak valid", 400);
      }
      if (!Array.isArray(classIds)) return err("Format data kelas tidak valid", 400);
      for (const cid of classIds) {
        const cls = await env.DB.prepare(
          "SELECT id FROM classes WHERE id = ? AND teacher_id = ?"
        ).bind(cid, payload.sub).first();
        if (!cls) return err("Kelas tidak valid atau bukan milik Anda", 400);
        await env.DB.prepare(
          "INSERT INTO task_classes (task_id, class_id) VALUES (?, ?)"
        ).bind(id, cid).run();
      }
    }
    // Append classes to response
    const tc = await env.DB.prepare(
      "SELECT c.id, c.name FROM classes c JOIN task_classes tc ON c.id = tc.class_id WHERE tc.task_id = ?"
    ).bind(id).all();
    task.classes = tc.results || [];
    return json({ task }, 201);
  } catch (e) {
    return err("Gagal membuat tugas: " + e.message, 500);
  }
});
router.delete("/api/tasks/:id", async (request, env) => {
  const payload = await requireAuth(request, env);
  if (!payload) return err("Unauthorized", 401);
  const { id } = request.params;
  try {
    const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND teacher_id = ?").bind(id, payload.sub).first();
    if (!task) return err("Tugas tidak ditemukan", 404);
    const subs = await env.DB.prepare("SELECT file_url FROM submissions WHERE task_id = ?").bind(id).all();
    for (const sub of subs.results ?? []) {
      await deleteSubmissionR2Files(env, sub.file_url);
    }
    if (task.file_url) {
      try {
        await env.TASK_FILES.delete(r2KeyFromUrl(task.file_url));
      } catch {
      }
    }
    await env.DB.prepare("DELETE FROM task_classes WHERE task_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM submissions WHERE task_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM tasks WHERE id = ? AND teacher_id = ?").bind(id, payload.sub).run();
    return json({ success: true });
  } catch (e) {
    return err("Gagal menghapus tugas: " + e.message, 500);
  }
});
router.post("/api/submissions", async (request, env) => {
  try {
    const formData = await request.formData();
    const task_code = formData.get("task_code");
    const task_id_form = formData.get("task_id");
    const student_name = formData.get("student_name");
    const student_class = formData.get("student_class");
    const student_note = formData.get("student_note") || null;
    if (!task_code || !student_name || !student_class) {
      return err("task_code, student_name, dan student_class wajib diisi");
    }
    const trimmedCode = String(task_code).trim();
    const trimmedName = String(student_name).trim();
    const trimmedClass = String(student_class).trim();
    if (!trimmedCode || !trimmedName || !trimmedClass) {
      return err("Kode tugas, nama, dan kelas wajib diisi", 400);
    }
    const task = await env.DB.prepare(
      "SELECT id, submission_type FROM tasks WHERE task_code = ?"
    ).bind(trimmedCode).first();
    if (!task) return err("Tugas tidak ditemukan", 404);
    const task_id = task.id;
    if (task_id_form && task_id_form !== task_id) {
      return err("Data tugas tidak valid", 403);
    }
    const hasTargetClasses = await env.DB.prepare(
      "SELECT 1 FROM task_classes WHERE task_id = ? LIMIT 1"
    ).bind(task_id).first();
    if (hasTargetClasses) {
      const rosterMatch = await env.DB.prepare(
        `SELECT 1 FROM students s
         JOIN classes c ON s.class_id = c.id
         JOIN task_classes tc ON tc.class_id = c.id AND tc.task_id = ?
         WHERE LOWER(c.name) = LOWER(?) AND LOWER(s.name) = LOWER(?)`
      ).bind(task_id, trimmedClass, trimmedName).first();
      if (!rosterMatch) {
        return err("Nama tidak terdaftar di daftar siswa kelas tugas ini", 403);
      }
    }
    const maxFiles = 20;
    const maxFileBytes = 100 * 1024 * 1024;
    const uploadFiles = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("file_") || typeof value !== "object" || value.size === 0) continue;
      uploadFiles.push(value);
    }
    if (uploadFiles.length === 0) return err("Minimal 1 file harus diunggah");
    if (uploadFiles.length > maxFiles) return err("Maksimal 20 file per pengumpulan", 400);
    const fileUrls = [];
    const submissionType = task.submission_type || "image";
    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      if (file.size > maxFileBytes) {
        return err(`File "${file.name || i + 1}" terlalu besar (maks 100MB per file)`, 400);
      }
      if (!fileMatchesSubmissionType(file.type, submissionType)) {
        return err(`File harus berupa ${submissionType === "image" ? "gambar" : submissionType === "video" ? "video" : "audio"}`, 400);
      }
      const safeStudentName = trimmedName.replace(/[^a-zA-Z0-9]/g, "_");
      const fileName = generateUniqueFileName(`${safeStudentName}_${i + 1}_${file.name || "file"}`);
      const arrayBuffer = await file.arrayBuffer();
      await env.SUBMISSION_FILES.put(fileName, arrayBuffer, {
        httpMetadata: { contentType: file.type || "application/octet-stream" }
      });
      fileUrls.push(`${env.SUBMISSION_FILES_PUBLIC_URL}/${fileName}`);
    }
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO submissions (id, task_id, student_name, student_class, file_url, student_note)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, task_id, trimmedName, trimmedClass, JSON.stringify(fileUrls), student_note).run();
    const replacedCount = await removeOtherStudentSubmissions(env, task_id, trimmedName, trimmedClass, id);
    return json({
      success: true,
      submission_id: id,
      file_urls: fileUrls,
      replaced: replacedCount > 0
    }, 201);
  } catch (e) {
    return err("Gagal mengirim tugas: " + e.message, 500);
  }
});
router.get("/api/storage/usage", async (request, env) => {
  const payload = await requireAuth(request, env);
  if (!payload) return err("Unauthorized", 401);
  try {
    async function objectBytes(bucket, url) {
      if (!url) return 0;
      try {
        const obj = await bucket.head(r2KeyFromUrl(url));
        return obj?.size || 0;
      } catch {
        return 0;
      }
    }
    __name(objectBytes, "objectBytes");
    const teacherTasks = await env.DB.prepare(
      "SELECT file_url FROM tasks WHERE teacher_id = ?"
    ).bind(payload.sub).all();
    let taskFilesBytes = 0;
    for (const row of teacherTasks.results ?? []) {
      taskFilesBytes += await objectBytes(env.TASK_FILES, row.file_url);
    }
    const teacherSubs = await env.DB.prepare(
      `SELECT s.file_url FROM submissions s
       JOIN tasks t ON s.task_id = t.id
       WHERE t.teacher_id = ?`
    ).bind(payload.sub).all();
    let submissionFilesBytes = 0;
    for (const row of teacherSubs.results ?? []) {
      let urls = [];
      try {
        urls = JSON.parse(row.file_url);
      } catch {
        urls = row.file_url ? [row.file_url] : [];
      }
      for (const url of urls) {
        submissionFilesBytes += await objectBytes(env.SUBMISSION_FILES, url);
      }
    }
    return json({
      used_bytes: taskFilesBytes + submissionFilesBytes,
      task_files_bytes: taskFilesBytes,
      submission_files_bytes: submissionFilesBytes
    });
  } catch (e) {
    return err("Gagal memuat penyimpanan: " + e.message, 500);
  }
});
// ==========================================
// ADMIN ROUTES — Manajemen Akun Guru
// ==========================================
//
// CARA PAKAI:
// Salin semua kode di bawah ini ke dalam file worker/src/index.js
// Letakkan SEBELUM baris:  router.all('*', () => err('Not found', 404));
//
// Autentikasi: semua route admin membutuhkan header
//   X-Admin-Key: <nilai SETUP_KEY di wrangler.toml>
//
// Endpoint yang ditambahkan:
//   GET    /api/admin/teachers         — daftar semua guru
//   POST   /api/admin/teachers         — buat akun guru baru
//   PUT    /api/admin/teachers/:id     — edit email / password guru
//   DELETE /api/admin/teachers/:id     — hapus akun guru
// ==========================================

// Helper: validasi admin key dari header X-Admin-Key
function requireAdminKey(request, env) {
  const key = request.headers.get('X-Admin-Key');
  if (!key || key !== env.SETUP_KEY) return false;
  return true;
}

// GET /api/admin/teachers — list semua akun guru
router.get('/api/admin/teachers', async (request, env) => {
  if (!requireAdminKey(request, env)) return err('Akses ditolak', 403);

  try {
    const result = await env.DB
      .prepare('SELECT id, email, created_at FROM teachers ORDER BY created_at DESC')
      .all();
    return json({ teachers: result.results });
  } catch (e) {
    return err('Gagal memuat daftar guru: ' + e.message, 500);
  }
});

// POST /api/admin/teachers — buat akun guru baru
// Body: { email, password }
router.post('/api/admin/teachers', async (request, env) => {
  if (!requireAdminKey(request, env)) return err('Akses ditolak', 403);

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) return err('Email dan password wajib diisi');
    if (password.length < 8) return err('Password minimal 8 karakter');

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await env.DB
      .prepare('SELECT id FROM teachers WHERE email = ?')
      .bind(normalizedEmail)
      .first();
    if (existing) return err('Email sudah terdaftar');

    const password_hash = await hashPassword(password);
    const id = generateId();

    await env.DB
      .prepare('INSERT INTO teachers (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(id, normalizedEmail, password_hash)
      .run();

    return json({ success: true, teacher: { id, email: normalizedEmail } }, 201);
  } catch (e) {
    return err('Gagal membuat akun: ' + e.message, 500);
  }
});

// PUT /api/admin/teachers/:id — edit email dan/atau password guru
// Body: { email?, password? }
router.put('/api/admin/teachers/:id', async (request, env) => {
  if (!requireAdminKey(request, env)) return err('Akses ditolak', 403);

  const { id } = request.params;

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email && !password) return err('Tidak ada data yang diubah');
    if (password && password.length < 8) return err('Password minimal 8 karakter');

    // Cek teacher ada
    const teacher = await env.DB
      .prepare('SELECT id, email FROM teachers WHERE id = ?')
      .bind(id)
      .first();
    if (!teacher) return err('Akun guru tidak ditemukan', 404);

    // Jika email diubah, cek tidak bentrok dengan akun lain
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail !== teacher.email) {
        const conflict = await env.DB
          .prepare('SELECT id FROM teachers WHERE email = ? AND id != ?')
          .bind(normalizedEmail, id)
          .first();
        if (conflict) return err('Email sudah digunakan oleh akun lain');
      }
    }

    // Update email jika ada
    if (email) {
      await env.DB
        .prepare('UPDATE teachers SET email = ? WHERE id = ?')
        .bind(email.trim().toLowerCase(), id)
        .run();
    }

    // Update password jika ada
    if (password) {
      const password_hash = await hashPassword(password);
      await env.DB
        .prepare('UPDATE teachers SET password_hash = ? WHERE id = ?')
        .bind(password_hash, id)
        .run();
    }

    return json({ success: true });
  } catch (e) {
    return err('Gagal memperbarui akun: ' + e.message, 500);
  }
});

// DELETE /api/admin/teachers/:id — hapus akun guru beserta semua tugasnya
router.delete('/api/admin/teachers/:id', async (request, env) => {
  if (!requireAdminKey(request, env)) return err('Akses ditolak', 403);

  const { id } = request.params;

  try {
    // Cek teacher ada
    const teacher = await env.DB
      .prepare('SELECT id FROM teachers WHERE id = ?')
      .bind(id)
      .first();
    if (!teacher) return err('Akun guru tidak ditemukan', 404);

    // Ambil semua tugas milik guru ini
    const tasks = await env.DB
      .prepare('SELECT id, file_url FROM tasks WHERE teacher_id = ?')
      .bind(id)
      .all();

    for (const task of tasks.results ?? []) {
      // Hapus semua file submission dari R2
      const subs = await env.DB
        .prepare('SELECT file_url FROM submissions WHERE task_id = ?')
        .bind(task.id)
        .all();

      for (const sub of subs.results ?? []) {
        await deleteSubmissionR2Files(env, sub.file_url);
      }

      // Hapus lampiran tugas dari R2
      if (task.file_url) {
        try { await env.TASK_FILES.delete(r2KeyFromUrl(task.file_url)); } catch { /* ignore */ }
      }

      // Hapus submission dari DB
      await env.DB.prepare('DELETE FROM task_classes WHERE task_id = ?').bind(task.id).run();
      await env.DB.prepare('DELETE FROM submissions WHERE task_id = ?').bind(task.id).run();
    }

    // Hapus siswa & kelas guru
    await env.DB.prepare(
      'DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE teacher_id = ?)'
    ).bind(id).run();
    await env.DB.prepare('DELETE FROM task_classes WHERE class_id IN (SELECT id FROM classes WHERE teacher_id = ?)').bind(id).run();
    await env.DB.prepare('DELETE FROM classes WHERE teacher_id = ?').bind(id).run();

    // Hapus semua tugas guru
    await env.DB.prepare('DELETE FROM tasks WHERE teacher_id = ?').bind(id).run();

    // Hapus akun guru
    await env.DB.prepare('DELETE FROM teachers WHERE id = ?').bind(id).run();

    return json({ success: true });
  } catch (e) {
    return err('Gagal menghapus akun: ' + e.message, 500);
  }
});
// ============================
// CRUD KELAS (Teacher Auth)
// ============================

// GET /api/classes — list kelas guru + jumlah siswa
router.get('/api/classes', async (request, env) => {
  const teacher = await requireAuth(request, env);
  if (!teacher) return err('Unauthorized', 401);
  try {
    const rows = await env.DB.prepare(
      `SELECT c.id, c.name, c.created_at, COUNT(s.id) as student_count
       FROM classes c LEFT JOIN students s ON s.class_id = c.id
       WHERE c.teacher_id = ? GROUP BY c.id ORDER BY c.name`
    ).bind(teacher.sub).all();
    return json({ classes: rows.results });
  } catch (e) {
    return err('Gagal memuat kelas: ' + e.message, 500);
  }
});

// POST /api/classes — buat kelas baru
router.post('/api/classes', async (request, env) => {
  const teacher = await requireAuth(request, env);
  if (!teacher) return err('Unauthorized', 401);
  try {
    const { name } = await request.json();
    if (!name || !name.trim()) return err('Nama kelas wajib diisi');
    const id = generateId();
    await env.DB.prepare(
      'INSERT INTO classes (id, teacher_id, name) VALUES (?, ?, ?)'
    ).bind(id, teacher.sub, name.trim()).run();
    return json({ id, name: name.trim() }, 201);
  } catch (e) {
    return err('Gagal membuat kelas: ' + e.message, 500);
  }
});

// GET/POST /api/classes/:id/students — before /api/classes/:id (PUT/DELETE)
router.get('/api/classes/:id/students', async (request, env) => {
  const teacher = await requireAuth(request, env);
  if (!teacher) return err('Unauthorized', 401);
  const { id } = request.params;
  try {
    const cls = await env.DB.prepare(
      'SELECT id FROM classes WHERE id = ? AND teacher_id = ?'
    ).bind(id, teacher.sub).first();
    if (!cls) return err('Kelas tidak ditemukan', 404);
    const rows = await env.DB.prepare(
      'SELECT id, name, created_at FROM students WHERE class_id = ? ORDER BY name'
    ).bind(id).all();
    return json({ students: rows.results });
  } catch (e) {
    return err('Gagal memuat siswa: ' + e.message, 500);
  }
});

router.post('/api/classes/:id/students', async (request, env) => {
  const teacher = await requireAuth(request, env);
  if (!teacher) return err('Unauthorized', 401);
  const { id } = request.params;
  try {
    const cls = await env.DB.prepare(
      'SELECT id FROM classes WHERE id = ? AND teacher_id = ?'
    ).bind(id, teacher.sub).first();
    if (!cls) return err('Kelas tidak ditemukan', 404);
    const { names } = await request.json();
    if (!Array.isArray(names) || names.length === 0) return err('Daftar nama wajib diisi');
    const inserted = [];
    for (const n of names) {
      const trimmed = n?.trim();
      if (!trimmed) continue;
      const sid = generateId();
      await env.DB.prepare(
        'INSERT INTO students (id, class_id, name) VALUES (?, ?, ?)'
      ).bind(sid, id, trimmed).run();
      inserted.push({ id: sid, name: trimmed });
    }
    if (inserted.length === 0) return err('Daftar nama wajib diisi', 400);
    return json({ students: inserted }, 201);
  } catch (e) {
    return err('Gagal menambah siswa: ' + e.message, 500);
  }
});

// PUT /api/classes/:id — rename kelas
router.put('/api/classes/:id', async (request, env) => {
  const teacher = await requireAuth(request, env);
  if (!teacher) return err('Unauthorized', 401);
  const { id } = request.params;
  try {
    const cls = await env.DB.prepare(
      'SELECT id FROM classes WHERE id = ? AND teacher_id = ?'
    ).bind(id, teacher.sub).first();
    if (!cls) return err('Kelas tidak ditemukan', 404);
    const { name } = await request.json();
    if (!name || !name.trim()) return err('Nama kelas wajib diisi');
    await env.DB.prepare('UPDATE classes SET name = ? WHERE id = ?').bind(name.trim(), id).run();
    return json({ success: true });
  } catch (e) {
    return err('Gagal mengubah kelas: ' + e.message, 500);
  }
});

// DELETE /api/classes/:id — hapus kelas (cascade via FK)
router.delete('/api/classes/:id', async (request, env) => {
  const teacher = await requireAuth(request, env);
  if (!teacher) return err('Unauthorized', 401);
  const { id } = request.params;
  try {
    const cls = await env.DB.prepare(
      'SELECT id FROM classes WHERE id = ? AND teacher_id = ?'
    ).bind(id, teacher.sub).first();
    if (!cls) return err('Kelas tidak ditemukan', 404);
    await env.DB.prepare('DELETE FROM task_classes WHERE class_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM students WHERE class_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(id).run();
    return json({ success: true });
  } catch (e) {
    return err('Gagal menghapus kelas: ' + e.message, 500);
  }
});

// PUT /api/students/:id — edit nama siswa
router.put('/api/students/:id', async (request, env) => {
  const teacher = await requireAuth(request, env);
  if (!teacher) return err('Unauthorized', 401);
  const { id } = request.params;
  try {
    // Verify student belongs to teacher's class
    const student = await env.DB.prepare(
      `SELECT s.id FROM students s JOIN classes c ON s.class_id = c.id
       WHERE s.id = ? AND c.teacher_id = ?`
    ).bind(id, teacher.sub).first();
    if (!student) return err('Siswa tidak ditemukan', 404);
    const { name } = await request.json();
    if (!name || !name.trim()) return err('Nama siswa wajib diisi');
    await env.DB.prepare('UPDATE students SET name = ? WHERE id = ?').bind(name.trim(), id).run();
    return json({ success: true });
  } catch (e) {
    return err('Gagal mengubah siswa: ' + e.message, 500);
  }
});

// DELETE /api/students/:id — hapus siswa
router.delete('/api/students/:id', async (request, env) => {
  const teacher = await requireAuth(request, env);
  if (!teacher) return err('Unauthorized', 401);
  const { id } = request.params;
  try {
    const student = await env.DB.prepare(
      `SELECT s.id FROM students s JOIN classes c ON s.class_id = c.id
       WHERE s.id = ? AND c.teacher_id = ?`
    ).bind(id, teacher.sub).first();
    if (!student) return err('Siswa tidak ditemukan', 404);
    await env.DB.prepare('DELETE FROM students WHERE id = ?').bind(id).run();
    return json({ success: true });
  } catch (e) {
    return err('Gagal menghapus siswa: ' + e.message, 500);
  }
});

router.all("*", () => err("Not found", 404));
var index_default = {
  fetch: /* @__PURE__ */ __name((request, env, ctx) => router.fetch(request, env, ctx), "fetch")
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map