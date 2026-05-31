export type Task = {
  id: string;
  title: string;
  subject: string;
  deadline: string;
  description?: string | null;
  file_url?: string | null;
  task_code: string;
  submission_type: 'image' | 'video' | 'audio';
  created_at: string;
  classes?: { id: string; name: string }[];
};

export type Submission = {
  id: string;
  task_id: string;
  student_name: string;
  student_class: string;
  file_url: string;
  student_note?: string | null;
  created_at: string;
};

export type ClassRow = {
  id: string;
  name: string;
  created_at: string;
  student_count: number;
};

export type Student = { id: string; name: string; created_at?: string };

export function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {
    return null;
  }
  return null;
}

export function parseFileUrls(fileUrl: string): string[] {
  try {
    const parsed = JSON.parse(fileUrl);
    return Array.isArray(parsed) ? parsed : [fileUrl];
  } catch {
    return fileUrl ? [fileUrl] : [];
  }
}

export function filterSafeUrls(urls: string[]): string[] {
  return urls.map((u) => safeExternalUrl(u)).filter((u): u is string => !!u);
}
