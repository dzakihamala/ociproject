import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@/api/client';
import { useToast } from '@/context/ToastContext';
import { AuthSession } from '@/lib/authSession';
import { fetchDashboard, fetchClasses, fetchTaskByCode, queryClient, queryKeys } from '@/lib/queryClient';

export function HomePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const token = AuthSession.getToken();
    if (!token) return;
    apiRequest('/api/auth/check', { skipSessionReset: true })
      .then(() => AuthSession.confirmAuth())
      .catch(() => AuthSession.revokeAuth());
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (payload: { email: string; password: string }) => {
      return apiRequest<{ token: string; teacher_id: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data) => {
      AuthSession.login(data.token, data.teacher_id, email.trim());
      queryClient.prefetchQuery({ queryKey: queryKeys.dashboard, queryFn: fetchDashboard });
      queryClient.prefetchQuery({ queryKey: queryKeys.classes, queryFn: fetchClasses });
      navigate('/dashboard');
    },
    onError: (e) => {
      showToast(e instanceof Error ? e.message : 'Login gagal', 'error');
    },
  });

  async function goToTask() {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      showToast('Masukkan kode 6 digit yang valid.', 'error');
      return;
    }
    try {
      await fetchTaskByCode(trimmed);
      navigate(`/kumpul?code=${trimmed}`);
    } catch {
      showToast('Kode tugas tidak ditemukan.', 'error');
    }
  }

  return (
    <div className="container" style={{ maxWidth: 380, marginTop: 48 }}>
      <div className="text-center" style={{ marginBottom: 24 }}>
        <div className="brand-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22c-4-4-8-7.5-8-12a8 8 0 0 1 16 0c0 4.5-4 8-8 12z" />
            <path d="M12 10v5" />
            <path d="M9.5 12.5L12 10l2.5 2.5" />
          </svg>
        </div>
        <h1>Sistem Tugas</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Kumpulkan tugas dengan mudah 🌱</p>
      </div>

      <div className="card">
        <h2>Kumpulkan Tugas</h2>
        <p style={{ marginBottom: 12 }}>Masukkan kode 6 digit dari guru Anda.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            goToTask();
          }}
        >
          <div className="form-group">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="Contoh: 482017"
              maxLength={6}
              pattern="[0-9]{6}"
              inputMode="numeric"
              style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 20, letterSpacing: '0.2em', padding: 14 }}
            />
          </div>
          <button type="submit" className="btn" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Mencari...' : '🔍 Cari Tugas'}
          </button>
        </form>
      </div>

      <div className="leaf-divider">🌿</div>

      <div className="card">
        <h2>Login Guru</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim() || !password) {
              showToast('Email dan password wajib diisi.', 'error');
              return;
            }
            loginMutation.mutate({ email: email.trim(), password });
          }}
        >
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="email@contoh.com" />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Masukkan password" />
          </div>
          <button type="submit" className="btn mt-1" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
        <p style={{ marginTop: 14, fontSize: 13, color: 'var(--text-3)' }}>
          Belum memiliki akun?{' '}
          <a
            href="https://wa.me/6281364254694?text=Halo%20admin%2C%20saya%20ingin%20membuat%20akun."
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', fontWeight: 500 }}
          >
            Hubungi admin
          </a>
        </p>
      </div>
    </div>
  );
}
