import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { clearToken } from '../api/client';
import { clearAuthCache, clearDataCache } from '../lib/dataCache';
import { ClassesPage } from '../pages/ClassesPage';
import { DashboardPage } from '../pages/DashboardPage';
import { TaskDetailPage } from '../pages/TaskDetailPage';
import { buildAdminWhatsAppUrl } from '../lib/contact';
import { prefetchClasses, prefetchDashboard, prefetchTeacherShell } from '../lib/prefetch';

export function TeacherLayout() {
  const { pathname } = useLocation();
  const isDashboard = pathname === '/dashboard';
  const isClasses = pathname === '/kelas';
  const isDetail = pathname.startsWith('/detail/');
  const detailTaskId = isDetail ? pathname.split('/')[2] : '';

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
          <div className="teacher-page-stack">
            <div className="teacher-page-layer" hidden={!isDashboard} aria-hidden={!isDashboard}>
              <DashboardPage />
            </div>
            <div className="teacher-page-layer" hidden={!isClasses} aria-hidden={!isClasses}>
              <ClassesPage />
            </div>
            {isDetail && detailTaskId && (
              <div className="teacher-page-layer teacher-page-layer-detail">
                <TaskDetailPage key={detailTaskId} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
