import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { teacherAuth, requireTeacher } from './lib/auth';
import { requireAdmin } from './lib/auth';

import auth from './routes/auth';
import tasks from './routes/tasks';
import classes from './routes/classes';
import submissions from './routes/submissions';
import admin from './routes/admin';
import files from './routes/files';
import storage from './routes/storage';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  }),
);

app.get('/api/health', (c) => c.text('OK'));

// ── Public routes ──
app.route('/api/auth', auth);
app.route('/api', submissions);

// ── Teacher-authenticated routes (JWT required) ──
app.use('/api/auth/check', teacherAuth);
app.use('/api/tasks/*', teacherAuth, requireTeacher);
app.use('/api/classes/*', teacherAuth, requireTeacher);
app.use('/api/files/*', teacherAuth, requireTeacher);
app.use('/api/storage/*', teacherAuth, requireTeacher);

app.route('/api/tasks', tasks);
app.route('/api/classes', classes);
app.route('/api/files', files);
app.route('/api/storage', storage);

// ── Admin-authenticated routes (X-Admin-Key required) ──
app.use('/api/admin/*', requireAdmin);
app.route('/api/admin', admin);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
