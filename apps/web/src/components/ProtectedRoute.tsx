import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { apiRequest, clearToken, getToken } from '@/api/client';
import { isAuthCached, setAuthCached } from '@/lib/authCache';

async function checkAuth() {
  const data = await apiRequest<{ valid: boolean }>('/api/auth/check', { skipSessionReset: true });
  if (!data.valid) throw new Error('Unauthorized');
  setAuthCached(true);
  return data;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = getToken();

  const { status } = useQuery({
    queryKey: ['auth'],
    queryFn: checkAuth,
    enabled: !!token && !isAuthCached(),
    staleTime: 5 * 60_000,
  });

  if (!token) return <Navigate to="/" replace />;

  if (isAuthCached()) {
    return children;
  }

  if (status === 'pending') {
    return (
      <div className="container" style={{ marginTop: 48 }}>
        <div className="loader" />
      </div>
    );
  }

  if (status === 'error') {
    clearToken();
    setAuthCached(false);
    return <Navigate to="/" replace />;
  }

  return children;
}
