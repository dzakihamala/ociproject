/** Extract client IP from request headers (Cloudflare Workers compatible). */
export function clientIp(req: { header: (n: string) => string | undefined }): string {
  return (
    req.header('CF-Connecting-IP') ||
    req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
