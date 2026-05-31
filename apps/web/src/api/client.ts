import { clearTeacherLoginSession } from '@/lib/contact';
import { clearAuthCache } from '@/lib/authCache';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/** Tidak kirim Bearer & tidak reset sesi pada 401 (mis. password salah). */
const AUTH_PUBLIC_PREFIXES = ['/api/auth/login'];

function isAuthPublic(path: string): boolean {
  return AUTH_PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}?`));
}

export type ApiRequestOptions = RequestInit & {
  /** Jangan hapus token / redirect ke beranda (cek sesi di background). */
  skipSessionReset?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string) {
  localStorage.setItem('auth_token', token);
}

export function clearToken() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('teacher_id');
  clearTeacherLoginSession();
  clearAuthCache();
  import('../lib/queryClient').then(({ queryClient }) => queryClient.clear());
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { skipSessionReset, ...fetchOptions } = options;
  const tokenAtRequest = getToken();
  const headers = new Headers(fetchOptions.headers);

  if (tokenAtRequest && !isAuthPublic(path)) {
    headers.set('Authorization', `Bearer ${tokenAtRequest}`);
  }

  if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });

  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    if (!response.ok) throw new ApiError(`HTTP ${response.status}`, response.status);
    return {} as T;
  }

  const contentType = response.headers.get('Content-Type') || '';
  let data: { error?: string } & T;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      throw new ApiError(`Respons tidak valid (HTTP ${response.status})`, response.status);
    }
  } else {
    if (!response.ok) throw new ApiError(`HTTP ${response.status}`, response.status);
    return {} as T;
  }

  if (response.status === 401) {
    const message =
      data.error ||
      (isAuthPublic(path) ? 'Email atau password salah' : 'Sesi berakhir, silakan login kembali.');
    if (!skipSessionReset && !isAuthPublic(path)) {
      if (tokenAtRequest && getToken() === tokenAtRequest) {
        clearToken();
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
      }
    }
    throw new ApiError(message, 401);
  }

  if (!response.ok) {
    throw new ApiError(data.error || `HTTP ${response.status}`, response.status);
  }
  return data;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function apiForm<T = unknown>(
  path: string,
  formData: FormData,
  options?: { maxRetries?: number; onRetry?: (attempt: number, waitSec: number) => void },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(`${API_BASE}${path}`, { method: 'POST', body: formData });
    let data: { error?: string } & T;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(`Respons tidak valid (HTTP ${response.status})`, response.status);
    }

    if (response.status === 429 && attempt < maxRetries - 1) {
      const headerWait = Number.parseInt(response.headers.get('Retry-After') || '', 10);
      const waitSec = Number.isFinite(headerWait) && headerWait > 0 ? headerWait : 15 + attempt * 5;
      options?.onRetry?.(attempt + 1, waitSec);
      await sleep(waitSec * 1000);
      continue;
    }

    if (!response.ok) throw new ApiError(data.error || 'Request gagal', response.status);
    return data;
  }

  throw new ApiError('Server masih sibuk. Coba kirim lagi dalam beberapa menit.', 429);
}

export { API_BASE };
