/**
 * AuthSession — single authority for all auth state.
 *
 * Replaces the scattered pattern where token/email/auth cache were
 * managed across api/client.ts, authCache.ts, and contact.ts independently.
 */
import { queryClient } from './queryClient';

const TOKEN_KEY = 'auth_token';
const TEACHER_ID_KEY = 'teacher_id';
const EMAIL_KEY = 'teacher_login_email';
const AUTH_FLAG_KEY = 'tugas_auth_ok';

let authMemory: boolean | null = null;

export const AuthSession = {
  /** Store all auth data after successful login. */
  login(token: string, teacherId: string, email: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TEACHER_ID_KEY, teacherId);
    sessionStorage.setItem(EMAIL_KEY, email.trim());
    sessionStorage.setItem(AUTH_FLAG_KEY, '1');
    authMemory = true;
  },

  /** Clear all auth data atomically. */
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TEACHER_ID_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
    sessionStorage.removeItem(AUTH_FLAG_KEY);
    authMemory = false;
    queryClient.clear();
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getTeacherId(): string | null {
    return localStorage.getItem(TEACHER_ID_KEY);
  },

  getEmail(): string {
    return sessionStorage.getItem(EMAIL_KEY) || '';
  },

  isAuthenticated(): boolean {
    if (authMemory === true) return true;
    if (sessionStorage.getItem(AUTH_FLAG_KEY) === '1') {
      authMemory = true;
      return true;
    }
    return false;
  },

  /** Call when server confirms token is still valid. */
  confirmAuth() {
    authMemory = true;
    sessionStorage.setItem(AUTH_FLAG_KEY, '1');
  },

  /** Call when server says token is invalid. */
  revokeAuth() {
    this.logout();
  },
};
