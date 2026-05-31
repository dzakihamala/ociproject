export function paginationParams(c: { req: { query: (name: string) => string | undefined } }) {
  const limit = Math.min(Math.max(Number.parseInt(c.req.query('limit') || '20', 10) || 20, 1), 100);
  const offset = Math.max(Number.parseInt(c.req.query('offset') || '0', 10) || 0, 0);
  return { limit, offset };
}
