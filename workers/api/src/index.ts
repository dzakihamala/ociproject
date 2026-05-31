import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';

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

app.route('/', auth);
app.route('/', tasks);
app.route('/', classes);
app.route('/', submissions);
app.route('/', admin);
app.route('/', files);
app.route('/', storage);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
