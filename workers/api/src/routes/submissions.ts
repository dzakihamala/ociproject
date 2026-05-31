import { Hono } from 'hono';
import type { Env } from '../env';
import { processSubmission } from '../lib/submissionPipeline';

const submissions = new Hono<{ Bindings: Env }>();

submissions.post('/submissions', async (c) => {
  const result = await processSubmission({
    formData: await c.req.formData(),
    env: c.env,
    req: c.req,
  });

  if (!result.ok) {
    const headers: Record<string, string> = {};
    if (result.error.retryAfter) {
      headers['Retry-After'] = String(result.error.retryAfter);
    }
    return c.json({ error: result.error.error }, result.error.status as 400 | 403 | 404 | 429 | 500, headers);
  }

  return c.json({
    success: true,
    submission_id: result.value.submission_id,
    file_urls: result.value.file_urls,
    replaced: result.value.replaced,
  }, 201);
});

export default submissions;
