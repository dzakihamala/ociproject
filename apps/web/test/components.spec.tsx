import { describe, expect, it } from 'vitest';

describe('Component exports', () => {
  it('ProtectedRoute is importable', async () => {
    const mod = await import('@/components/ProtectedRoute');
    expect(mod.ProtectedRoute).toBeDefined();
  });

  it('ConfirmModal is importable', async () => {
    const mod = await import('@/components/ConfirmModal');
    expect(mod.ConfirmModal).toBeDefined();
  });

  it('StorageWarning is importable', async () => {
    const mod = await import('@/components/StorageWarning');
    expect(mod.StorageWarning).toBeDefined();
  });

  it('ErrorBoundary is importable', async () => {
    const mod = await import('@/components/ErrorBoundary');
    expect(mod.ErrorBoundary).toBeDefined();
  });

  it('ClassTargetPicker is importable', async () => {
    const mod = await import('@/components/ClassTargetPicker');
    expect(mod.ClassTargetPicker).toBeDefined();
  });

  it('QrModal is importable', async () => {
    const mod = await import('@/components/QrModal');
    expect(mod.QrModal).toBeDefined();
  });

  it('MediaViewer is importable', async () => {
    const mod = await import('@/components/MediaViewer');
    expect(mod.MediaViewer).toBeDefined();
  });

  it('ProcessingOverlay is importable', async () => {
    const mod = await import('@/components/ProcessingOverlay');
    expect(mod.ProcessingOverlay).toBeDefined();
  });

  it('UI components barrel export', async () => {
    const mod = await import('@/components/ui');
    expect(mod.Button).toBeDefined();
    expect(mod.Card).toBeDefined();
    expect(mod.Input).toBeDefined();
    expect(mod.Textarea).toBeDefined();
    expect(mod.Select).toBeDefined();
    expect(mod.Modal).toBeDefined();
    expect(mod.Badge).toBeDefined();
    expect(mod.Loader).toBeDefined();
    expect(mod.EmptyState).toBeDefined();
  });

  it('TeacherLayout is importable', async () => {
    const mod = await import('@/layouts/TeacherLayout');
    expect(mod.TeacherLayout).toBeDefined();
  });
});

describe('Page exports', () => {
  it('HomePage is importable', async () => {
    const mod = await import('@/pages/HomePage');
    expect(mod.HomePage).toBeDefined();
  });

  it('DashboardPage is importable', async () => {
    const mod = await import('@/pages/DashboardPage');
    expect(mod.DashboardPage).toBeDefined();
  });

  it('ClassesPage is importable', async () => {
    const mod = await import('@/pages/ClassesPage');
    expect(mod.ClassesPage).toBeDefined();
  });

  it('SubmitPage is importable', async () => {
    const mod = await import('@/pages/SubmitPage');
    expect(mod.SubmitPage).toBeDefined();
  });

  it('TaskDetailPage is importable', async () => {
    const mod = await import('@/pages/TaskDetailPage');
    expect(mod.TaskDetailPage).toBeDefined();
  });

  it('AdminPage is importable', async () => {
    const mod = await import('@/pages/AdminPage');
    expect(mod.AdminPage).toBeDefined();
  });
});

describe('Lib modules', () => {
  it('queryClient exports', async () => {
    const mod = await import('@/lib/queryClient');
    expect(mod.queryClient).toBeDefined();
    expect(mod.queryKeys).toBeDefined();
    expect(mod.fetchDashboard).toBeDefined();
    expect(mod.fetchClasses).toBeDefined();
    expect(mod.fetchTaskDetail).toBeDefined();
  });

  it('authCache exports', async () => {
    const mod = await import('@/lib/authCache');
    expect(mod.setAuthCached).toBeDefined();
    expect(mod.isAuthCached).toBeDefined();
    expect(mod.clearAuthCache).toBeDefined();
  });

  it('contact exports', async () => {
    const mod = await import('@/lib/contact');
    expect(mod.saveTeacherLoginSession).toBeDefined();
    expect(mod.clearTeacherLoginSession).toBeDefined();
    expect(mod.getTeacherLoginEmail).toBeDefined();
    expect(mod.buildAdminWhatsAppMessage).toBeDefined();
    expect(mod.buildAdminWhatsAppUrl).toBeDefined();
  });

  it('types exports', async () => {
    const mod = await import('@/types');
    expect(mod.formatDate).toBeDefined();
    expect(mod.safeExternalUrl).toBeDefined();
    expect(mod.parseFileUrls).toBeDefined();
  });
});
