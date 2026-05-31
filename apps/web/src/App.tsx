import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TeacherLayout } from './layouts/TeacherLayout';
import { HomePage } from './pages/HomePage';

const SubmitPage = lazy(() => import('./pages/SubmitPage').then((m) => ({ default: m.SubmitPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ClassesPage = lazy(() => import('./pages/ClassesPage').then((m) => ({ default: m.ClassesPage })));
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage').then((m) => ({ default: m.TaskDetailPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-3 py-4">
      <div className="h-5 bg-border rounded w-1/3" />
      <div className="h-12 bg-border rounded" />
      <div className="h-12 bg-border rounded" />
      <div className="h-12 bg-border rounded" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/kumpul"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <SubmitPage />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <AdminPage />
            </Suspense>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <TeacherLayout />
            </ProtectedRoute>
          }
        >
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="/kelas"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <ClassesPage />
              </Suspense>
            }
          />
          <Route
            path="/detail/:id"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <TaskDetailPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
