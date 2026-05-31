export function r2KeyFromUrl(url: string): string {
  try {
    return new URL(url).pathname.slice(1);
  } catch {
    return url.split('/').pop()?.split('?')[0] ?? url;
  }
}

export async function deleteSubmissionR2Files(bucket: R2Bucket, fileUrlField: string) {
  let urls: string[] = [];
  try {
    urls = JSON.parse(fileUrlField);
  } catch {
    urls = fileUrlField ? [fileUrlField] : [];
  }
  for (const url of urls) {
    try {
      await bucket.delete(r2KeyFromUrl(url));
    } catch {
      /* ignore missing */
    }
  }
}

export async function objectBytes(bucket: R2Bucket, url: string | null): Promise<number> {
  if (!url) return 0;
  try {
    const obj = await bucket.head(r2KeyFromUrl(url));
    return obj?.size ?? 0;
  } catch {
    return 0;
  }
}

export function fileMatchesSubmissionType(mime: string, submissionType: string): boolean {
  const m = (mime || '').toLowerCase();
  if (!m) return true;
  if (submissionType === 'image') return m.startsWith('image/');
  if (submissionType === 'video') return m.startsWith('video/');
  if (submissionType === 'audio') {
    return m === 'audio/mpeg' || m === 'audio/mp3' || m.startsWith('audio/');
  }
  return false;
}
