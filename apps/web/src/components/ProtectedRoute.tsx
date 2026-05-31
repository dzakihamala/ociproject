import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { apiRequest } from '@/api/client';
import { AuthSession } from '@/lib/authSession';

async function checkAuth() {
  const data = await apiRequest<{ valid: boolean }>('/api/auth/check', { skipSessionReset: true });
  if (!data.valid) throw new Error('Unauthorized');
  AuthSession.confirmAuth();
  return data;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = AuthSession.getToken();

  const { status } = useQuery({
    queryKey: ['auth'],
    queryFn: checkAuth,
    enabled: !!token && !AuthSession.isAuthenticated(),
    staleTime: 5 * 60_000,
  });

  if (!token) return <Navigate to="/" replace />;

  if (AuthSession.isAuthenticated()) {
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
    AuthSession.revokeAuth();
    return <Navigate to="/" replace />;
  }

  return children;
}
