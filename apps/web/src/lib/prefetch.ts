import { apiRequest } from '../api/client';
import type { ClassRow, Submission, Task } from '../types';
import { getCache, prefetch, setCache } from './dataCache';

export type DashboardData = {
  tasks: Task[];
  classes: ClassRow[];
  storage: { used_bytes: number };
};

export type TaskDetailData = {
  task: Task;
  submissions: Submission[];
};

export const CACHE_KEYS = {
  dashboard: 'dashboard',
  classes: 'classes',
  task: (id: string) => `task:${id}`,
} as const;

export async function fetchDashboard(): Promise<DashboardData> {
  const [t, c, s] = await Promise.all([
    apiRequest<{ tasks: Task[] }>('/api/tasks'),
    apiRequest<{ classes: ClassRow[] }>('/api/classes'),
    apiRequest<{ used_bytes: number }>('/api/storage/usage'),
  ]);
  return {
    tasks: t.tasks || [],
    classes: c.classes || [],
    storage: s,
  };
}

export async function fetchClasses(): Promise<ClassRow[]> {
  const data = await apiRequest<{ classes: ClassRow[] }>('/api/classes');
  return data.classes || [];
}

export async function fetchTaskDetail(id: string): Promise<TaskDetailData> {
  const [t, s] = await Promise.all([
    apiRequest<{ task: Task }>(`/api/tasks/${id}`),
    apiRequest<{ submissions: Submission[] }>(`/api/tasks/${id}/submissions`),
  ]);
  if (!t.task) throw new Error('Tugas tidak ditemukan');
  return { task: t.task, submissions: s.submissions || [] };
}

/** Hapus satu tugas dari cache dashboard (setelah delete, tanpa refresh penuh). */
export function removeTaskFromDashboardCache(taskId: string) {
  const cached = getCache<DashboardData>(CACHE_KEYS.dashboard);
  if (!cached) return;
  setCache(CACHE_KEYS.dashboard, {
    ...cached,
    tasks: cached.tasks.filter((t) => t.id !== taskId),
  });
}

export function prefetchDashboard() {
  prefetch(CACHE_KEYS.dashboard, fetchDashboard);
}

export function prefetchClasses() {
  prefetch(CACHE_KEYS.classes, fetchClasses);
}

export function prefetchTaskDetail(id: string) {
  if (!id) return;
  prefetch(CACHE_KEYS.task(id), () => fetchTaskDetail(id));
}

export function prefetchTeacherShell() {
  prefetchDashboard();
  prefetchClasses();
}
