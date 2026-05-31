import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TeacherLayout } from './layouts/TeacherLayout';
import { AdminPage } from './pages/AdminPage';
import { HomePage } from './pages/HomePage';

const SubmitPage = lazy(() => import('./pages/SubmitPage').then((m) => ({ default: m.SubmitPage })));

function PageFallback() {
  return null;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/kumpul"
        element={
          <Suspense fallback={<PageFallback />}>
            <SubmitPage />
          </Suspense>
        }
      />
      <Route path="/admin" element={<AdminPage />} />
      <Route
        element={
          <ProtectedRoute>
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={null} />
        <Route path="/kelas" element={null} />
        <Route path="/detail/:id" element={null} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
