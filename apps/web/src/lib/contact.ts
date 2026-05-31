const ADMIN_WHATSAPP_PHONE = '6281364254694';
const SESSION_EMAIL = 'teacher_login_email';
const SESSION_PASSWORD = 'teacher_login_password';

function readAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

function emailFromJwt(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { email?: string };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/** Simpan kredensial sesi untuk template WA (sessionStorage, hilang saat tab ditutup / logout). */
export function saveTeacherLoginSession(email: string, password: string) {
  sessionStorage.setItem(SESSION_EMAIL, email.trim());
  sessionStorage.setItem(SESSION_PASSWORD, password);
}

export function clearTeacherLoginSession() {
  sessionStorage.removeItem(SESSION_EMAIL);
  sessionStorage.removeItem(SESSION_PASSWORD);
}

export function getTeacherLoginEmail(): string {
  return sessionStorage.getItem(SESSION_EMAIL) || emailFromJwt(readAuthToken()) || '';
}

export function getTeacherLoginPassword(): string {
  return sessionStorage.getItem(SESSION_PASSWORD) || '';
}

export function buildAdminWhatsAppMessage(email?: string, password?: string): string {
  const e = email ?? getTeacherLoginEmail();
  const p = password ?? getTeacherLoginPassword();
  return `email: ${e}\npassword: ${p}\npesan:\n`;
}

export function buildAdminWhatsAppUrl(email?: string, password?: string): string {
  const text = buildAdminWhatsAppMessage(email, password);
  return `https://wa.me/${ADMIN_WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
}
