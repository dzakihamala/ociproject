const ADMIN_WHATSAPP_PHONE = '6281364254694';
const SESSION_EMAIL = 'teacher_login_email';

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

export function saveTeacherLoginSession(email: string) {
  sessionStorage.setItem(SESSION_EMAIL, email.trim());
}

export function clearTeacherLoginSession() {
  sessionStorage.removeItem(SESSION_EMAIL);
}

export function getTeacherLoginEmail(): string {
  return sessionStorage.getItem(SESSION_EMAIL) || emailFromJwt(readAuthToken()) || '';
}

export function buildAdminWhatsAppMessage(email?: string): string {
  const e = email ?? getTeacherLoginEmail();
  return `email: ${e}\npesan:\n`;
}

export function buildAdminWhatsAppUrl(email?: string): string {
  const text = buildAdminWhatsAppMessage(email);
  return `https://wa.me/${ADMIN_WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
}
