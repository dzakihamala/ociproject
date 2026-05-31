import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clearToken } from '@/api/client';
import { clearAuthCache } from '@/lib/authCache';
import { buildAdminWhatsAppUrl } from '@/lib/contact';
import { fetchClasses, fetchDashboard, queryClient, queryKeys } from '@/lib/queryClient';

export function TeacherLayout() {
  useEffect(() => {
    queryClient.prefetchQuery({ queryKey: queryKeys.dashboard, queryFn: fetchDashboard });
    queryClient.prefetchQuery({ queryKey: queryKeys.classes, queryFn: fetchClasses });
  }, []);

  return (
    <div className="app-layout">
      <aside className="sidebar" id="teacherSidebar">
        <div className="sidebar-brand">🌿 Sistem Tugas</div>
        <nav className="sidebar-nav">
          <NavLink
            to="/dashboard"
            viewTransition
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            onMouseEnter={() => { queryClient.prefetchQuery({ queryKey: queryKeys.dashboard, queryFn: fetchDashboard }); }}
            onFocus={() => { queryClient.prefetchQuery({ queryKey: queryKeys.dashboard, queryFn: fetchDashboard }); }}
          >
            Daftar Tugas
          </NavLink>
          <NavLink
            to="/kelas"
            viewTransition
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            onMouseEnter={() => { queryClient.prefetchQuery({ queryKey: queryKeys.classes, queryFn: fetchClasses }); }}
            onFocus={() => { queryClient.prefetchQuery({ queryKey: queryKeys.classes, queryFn: fetchClasses }); }}
          >
            Kelas
          </NavLink>
          <a href={buildAdminWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="sidebar-link">
            Hubungi Admin
          </a>
          <button
            type="button"
            className="sidebar-link sidebar-logout"
            onClick={() => {
              clearToken();
              clearAuthCache();
              queryClient.clear();
              window.location.href = '/';
            }}
          >
            Keluar
          </button>
        </nav>
      </aside>
      <main className="main-content">
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
