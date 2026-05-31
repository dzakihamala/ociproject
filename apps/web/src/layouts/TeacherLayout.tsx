import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clearToken } from '../api/client';
import { clearAuthCache, clearDataCache } from '../lib/dataCache';
import { buildAdminWhatsAppUrl } from '../lib/contact';
import { prefetchClasses, prefetchDashboard, prefetchTeacherShell } from '../lib/prefetch';

export function TeacherLayout() {
  useEffect(() => {
    prefetchTeacherShell();
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
            onMouseEnter={prefetchDashboard}
            onFocus={prefetchDashboard}
          >
            Daftar Tugas
          </NavLink>
          <NavLink
            to="/kelas"
            viewTransition
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            onMouseEnter={prefetchClasses}
            onFocus={prefetchClasses}
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
              clearDataCache();
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
