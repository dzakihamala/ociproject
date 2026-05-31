const AUTH_KEY = 'tugas_auth_ok';

let authMemory: boolean | null = null;

export function setAuthCached(ok: boolean) {
  authMemory = ok;
  if (ok) sessionStorage.setItem(AUTH_KEY, '1');
  else sessionStorage.removeItem(AUTH_KEY);
}

export function isAuthCached(): boolean {
  return authMemory === true || sessionStorage.getItem(AUTH_KEY) === '1';
}

export function clearAuthCache() {
  authMemory = null;
  sessionStorage.removeItem(AUTH_KEY);
}
