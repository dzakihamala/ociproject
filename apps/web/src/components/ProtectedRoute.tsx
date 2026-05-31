import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { apiRequest, clearToken, getToken } from '../api/client';
import { isAuthCached, setAuthCached } from '../lib/dataCache';
import { prefetchTeacherShell } from '../lib/prefetch';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = getToken();
  const [status, setStatus] = useState<'loading' | 'ok' | 'fail'>(() => {
    if (!token) return 'fail';
    if (isAuthCached()) return 'ok';
    return 'loading';
  });

  useEffect(() => {
    if (!token) {
      setStatus('fail');
      return;
    }
    if (isAuthCached()) {
      setStatus('ok');
      prefetchTeacherShell();
      apiRequest('/api/auth/check', { skipSessionReset: true })
        .then(() => setAuthCached(true))
        .catch(() => {
          clearToken();
          setAuthCached(false);
          setStatus('fail');
        });
      return;
    }
    apiRequest('/api/auth/check', { skipSessionReset: true })
      .then(() => {
        setAuthCached(true);
        setStatus('ok');
        prefetchTeacherShell();
      })
      .catch(() => {
        clearToken();
        setAuthCached(false);
        setStatus('fail');
      });
  }, [token]);

  if (status === 'fail') return <Navigate to="/" replace />;
  if (status === 'loading') {
    return (
      <div className="container" style={{ marginTop: 48 }}>
        <div className="loader" />
      </div>
    );
  }
  return children;
}
