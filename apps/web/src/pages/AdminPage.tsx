import { useEffect, useState } from 'react';
import { apiRequest } from '@/api/client';
import { useToast } from '@/context/ToastContext';
import { ConfirmModal } from '@/components/ConfirmModal';

type Teacher = { id: string; email: string; created_at: string };

function adminHeaders(): Record<string, string> {
  return { 'X-Admin-Key': sessionStorage.getItem('admin_key') || '' };
}

export function AdminPage() {
  const { showToast } = useToast();
  const [key, setKey] = useState(sessionStorage.getItem('admin_key') || '');
  const [authed, setAuthed] = useState(!!sessionStorage.getItem('admin_key'));
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);

  useEffect(() => {
    if (authed) loadTeachers();
  }, [authed]);

  async function enter() {
    sessionStorage.setItem('admin_key', key);
    try {
      await apiRequest<{ data: Teacher[] }>('/api/admin/teachers', { headers: adminHeaders() });
      setAuthed(true);
      showToast('Masuk berhasil.', 'success');
    } catch {
      sessionStorage.removeItem('admin_key');
      showToast('Setup key salah.', 'error');
    }
  }

  async function loadTeachers() {
    try {
      const data = await apiRequest<{ data: Teacher[] }>('/api/admin/teachers', { headers: adminHeaders() });
      setTeachers(data.data || []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal memuat', 'error');
    }
  }

  async function addTeacher(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/teachers', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setEmail('');
      setPassword('');
      await loadTeachers();
      showToast('Guru ditambahkan.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal', 'error');
    }
  }

  function askRemoveTeacher(id: string, label: string) {
    setConfirm({
      title: 'Hapus Akun',
      message: `Hapus akun ${label}? Semua data guru ini akan terhapus permanen.`,
      action: async () => {
        try {
          await apiRequest(`/api/admin/teachers/${id}`, {
            method: 'DELETE',
            headers: adminHeaders(),
          });
          await loadTeachers();
          showToast('Akun dihapus.', 'success');
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Gagal', 'error');
        }
      },
    });
  }

  if (!authed) {
    return (
      <div className="container" style={{ maxWidth: 400, marginTop: 48 }}>
        <div className="card">
          <h1>Admin Guru</h1>
          <p className="hint">Masukkan Setup Key dari wrangler.toml</p>
          <div className="form-group">
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Setup key" />
          </div>
          <button type="button" className="btn" onClick={enter}>
            Masuk
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ marginTop: 32 }}>
      <div className="header">
        <h1>Manajemen Guru</h1>
        <button
          type="button"
          className="btn btn-outline btn-inline"
          onClick={() => {
            sessionStorage.removeItem('admin_key');
            setAuthed(false);
          }}
        >
          Keluar
        </button>
      </div>

      <div className="card">
        <h2>Tambah Guru</h2>
        <form onSubmit={addTeacher}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password (min 8)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <button type="submit" className="btn btn-accent">
            Simpan
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Daftar Guru ({teachers.length})</h2>
        {teachers.length === 0 ? (
          <p className="empty-state">Belum ada akun.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Dibuat</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.email}</td>
                    <td>{new Date(t.created_at).toLocaleDateString('id-ID')}</td>
                    <td>
                      <button type="button" className="btn btn-outline btn-inline btn-sm" style={{ color: 'var(--error)' }} onClick={() => askRemoveTeacher(t.id, t.email)}>
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.action;
          setConfirm(null);
          action?.();
        }}
      />
    </div>
  );
}
