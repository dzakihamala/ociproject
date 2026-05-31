import { QueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/api/client';
import type { ClassRow, Submission, Task } from '@/types';

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  classes: ['classes'] as const,
  tasksAll: ['task'] as const,
  task: (id: string) => ['task', id] as const,
  taskByCode: (code: string) => ['task', 'code', code] as const,
} as const;

export type DashboardData = {
  tasks: Task[];
  classes: ClassRow[];
  storage: { used_bytes: number };
};

export type TaskDetailData = {
  task: Task;
  submissions: Submission[];
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
    },
  },
});

export async function fetchDashboard(): Promise<DashboardData> {
  const [t, c, s] = await Promise.all([
    apiRequest<{ data: Task[] }>('/api/tasks'),
    apiRequest<{ data: ClassRow[] }>('/api/classes'),
    apiRequest<{ used_bytes: number }>('/api/storage/usage'),
  ]);
  return {
    tasks: t.data || [],
    classes: c.data || [],
    storage: s,
  };
}

export async function fetchClasses(): Promise<ClassRow[]> {
  const data = await apiRequest<{ data: ClassRow[] }>('/api/classes');
  return data.data || [];
}

export async function fetchTaskDetail(id: string): Promise<TaskDetailData> {
  const [t, s] = await Promise.all([
    apiRequest<{ task: Task }>(`/api/tasks/${id}`),
    apiRequest<{ data: Submission[] }>(`/api/tasks/${id}/submissions`),
  ]);
  if (!t.task) throw new Error('Tugas tidak ditemukan');
  return { task: t.task, submissions: s.data || [] };
}

export async function fetchTaskByCode(code: string): Promise<Task> {
  const data = await apiRequest<{ task: Task }>(`/api/tasks/code/${code}`);
  if (!data.task) throw new Error('Tugas tidak ditemukan');
  return data.task;
}

export function removeTaskFromDashboardCache(taskId: string) {
  queryClient.setQueryData<DashboardData>(queryKeys.dashboard, (old) => {
    if (!old) return old;
    return { ...old, tasks: old.tasks.filter((t) => t.id !== taskId) };
  });
}
