import { AuthSession } from './authSession';

const ADMIN_WHATSAPP_PHONE = '6281364254694';

export function saveTeacherLoginSession(email: string) {
  sessionStorage.setItem('teacher_login_email', email.trim());
}

export function getTeacherLoginEmail(): string {
  return AuthSession.getEmail();
}

export function buildAdminWhatsAppMessage(email?: string): string {
  const e = email ?? getTeacherLoginEmail();
  return `email: ${e}\npesan:\n`;
}

export function buildAdminWhatsAppUrl(email?: string): string {
  const text = buildAdminWhatsAppMessage(email);
  return `https://wa.me/${ADMIN_WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
}
