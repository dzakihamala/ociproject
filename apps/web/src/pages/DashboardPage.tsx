import flatpickr from 'flatpickr';
import { Indonesian } from 'flatpickr/dist/l10n/id.js';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import 'flatpickr/dist/flatpickr.min.css';
import { apiRequest } from '../api/client';
import { ClassTargetPicker } from '../components/ClassTargetPicker';
import { ConfirmModal } from '../components/ConfirmModal';
import { ProcessingOverlay } from '../components/ProcessingOverlay';
import { useToast } from '../context/ToastContext';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { getCache, invalidateCache } from '../lib/dataCache';
import { downloadAllTasksZip } from '../lib/downloads';
import { CACHE_KEYS, fetchDashboard, prefetchTaskDetail, type DashboardData } from '../lib/prefetch';
import type { Task } from '../types';
import { formatDate } from '../types';

export function DashboardPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { showToast } = useToast();
  const { data: dashboard, loading, setData } = useCachedQuery(CACHE_KEYS.dashboard, fetchDashboard);
  const tasks = dashboard?.tasks ?? [];
  const storage = dashboard?.storage ?? null;

  useEffect(() => {
    if (pathname !== '/dashboard') return;
    const cached = getCache<DashboardData>(CACHE_KEYS.dashboard);
    if (cached) setData(cached);
  }, [pathname, setData]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  const [submissionType, setSubmissionType] = useState<'image' | 'video' | 'audio'>('image');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const deadlineRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<flatpickr.Instance | null>(null);

  useEffect(() => {
    if (showCreate) {
      setDeadline('');
      setSelectedClassIds([]);
    }
  }, [showCreate]);

  useEffect(() => {
    if (!showCreate || !deadlineRef.current) {
      if (fpRef.current) {
        fpRef.current.destroy();
        fpRef.current = null;
      }
      return;
    }
    if (fpRef.current) fpRef.current.destroy();
    fpRef.current = flatpickr(deadlineRef.current, {
      enableTime: true,
      time_24hr: true,
      dateFormat: 'Y-m-d H:i',
      locale: Indonesian,
      minDate: 'today',
      disableMobile: false,
      onChange: (_dates, dateStr) => setDeadline(dateStr),
    });
    return () => {
      fpRef.current?.destroy();
      fpRef.current = null;
    };
  }, [showCreate]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const deadlineValue = (fpRef.current?.input as HTMLInputElement | undefined)?.value || deadline;
    if (!title.trim() || !subject.trim() || !deadlineValue) {
      showToast('Lengkapi judul, mata pelajaran, dan deadline.', 'error');
      return;
    }
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('subject', subject.trim());
    fd.append('deadline', deadlineValue);
    fd.append('submission_type', submissionType);
    if (description.trim()) fd.append('description', description.trim());
    if (selectedClassIds.length) fd.append('classes', JSON.stringify(selectedClassIds));
    if (attachment) fd.append('file', attachment);

    try {
      const data = await apiRequest<{ task: Task }>('/api/tasks', { method: 'POST', body: fd });
      invalidateCache(CACHE_KEYS.dashboard);
      invalidateCache(/^task:/);
      prefetchTaskDetail(data.task.id);
      setShowCreate(false);
      navigate(`/detail/${data.task.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat tugas', 'error');
    }
  }

  const totalBytes = storage?.used_bytes || 0;
  const usedMb = totalBytes / (1024 * 1024);
  const pct = Math.min((usedMb / (10 * 1024)) * 100, 100);
  let usedLabel = '0 KB';
  if (totalBytes < 1024 * 1024) {
    usedLabel = `${(totalBytes / 1024).toFixed(0)} KB`;
  } else if (usedMb < 1024) {
    usedLabel = `${usedMb.toFixed(1)} MB`;
  } else {
    usedLabel = `${(usedMb / 1024).toFixed(2)} GB`;
  }
  const storageWarning =
    pct > 90
      ? {
          className: 'storage-warning danger',
          html: '⚠️ <strong>Penyimpanan hampir penuh!</strong> Segera hapus tugas-tugas lama yang sudah tidak diperlukan. Buka detail tugas → klik tombol "Hapus" untuk menghapus tugas beserta seluruh file kiriman siswa.',
        }
      : pct > 70
        ? {
            className: 'storage-warning',
            html: '💡 Penyimpanan mulai terbatas. Pertimbangkan untuk menghapus tugas-tugas lama yang sudah selesai agar ruang penyimpanan tetap tersedia.',
          }
        : null;

  function askConfirm(title: string, message: string, action: () => void) {
    setConfirm({ title, message, action });
  }

  async function runProcessing(fn: () => Promise<void>, startMsg: string) {
    setProcessing(startMsg);
    try {
      await fn();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal', 'error');
    } finally {
      setProcessing(null);
    }
  }

  async function deleteAllTasks() {
    if (!tasks.length) {
      showToast('Tidak ada tugas untuk dihapus.', 'error');
      return;
    }
    askConfirm(
      'Hapus Semua Tugas',
      `Yakin ingin menghapus SEMUA ${tasks.length} tugas? Semua data pengumpulan dan file siswa akan terhapus permanen.`,
      () =>
        runProcessing(async () => {
          for (const task of tasks) {
            await apiRequest(`/api/tasks/${task.id}`, { method: 'DELETE' });
          }
          invalidateCache(CACHE_KEYS.dashboard);
          invalidateCache(/^task:/);
          setData({ tasks: [], classes: dashboard?.classes ?? [], storage: dashboard?.storage ?? { used_bytes: 0 } });
          showToast('Semua tugas berhasil dihapus!', 'success');
        }, 'Menghapus semua tugas...'),
    );
  }

  function downloadAllTasks() {
    if (!tasks.length) {
      showToast('Tidak ada tugas untuk diunduh.', 'error');
      return;
    }
    askConfirm(
      'Unduh Semua Tugas',
      `Semua kiriman dari ${tasks.length} tugas akan diunduh sebagai satu ZIP. Tiap tugas → per kelas → Tepat Waktu / Terlambat → file siswa. Proses ini mungkin memakan waktu. Lanjutkan?`,
      () =>
        runProcessing(async () => {
          await downloadAllTasksZip(setProcessing);
          showToast('ZIP berhasil diunduh!', 'success');
        }, 'Menyiapkan file ZIP...'),
    );
  }

  return (
    <>
      <div className="header mt-2">
        <div>
          <h1>🌿 Daftar Tugas</h1>
          <p>Kelola tugas siswa Anda.</p>
        </div>
      </div>

      {storage && (
        <div id="storageBar" className="storage-bar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>Penyimpanan</span>
            <span id="storageText" style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {usedLabel} / 10 GB
            </span>
          </div>
          <div className="storage-track">
            <div id="storageFill" className={`storage-fill${pct > 90 ? ' danger' : pct > 70 ? ' warning' : ''}`} style={{ width: `${pct}%` }} />
          </div>
          {storageWarning && (
            <div id="storageWarning" className={storageWarning.className} dangerouslySetInnerHTML={{ __html: storageWarning.html }} />
          )}
        </div>
      )}

      <div style={{ marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-accent btn-inline" onClick={() => setShowCreate(true)}>
          Buat Tugas
        </button>
        <button type="button" className="btn btn-outline btn-inline" onClick={downloadAllTasks}>
          Unduh Semua
        </button>
        <button
          type="button"
          className="btn btn-outline btn-inline"
          style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
          onClick={deleteAllTasks}
        >
          Hapus Semua
        </button>
      </div>

      {loading ? (
        <div className="loader page-loader" />
      ) : tasks.length === 0 ? (
        <p className="empty-state">Belum ada tugas yang dibuat.</p>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <Link
              key={task.id}
              to={`/detail/${task.id}`}
              viewTransition
              className="task-item"
              onMouseEnter={() => prefetchTaskDetail(task.id)}
              onFocus={() => prefetchTaskDetail(task.id)}
            >
              <div className="task-info">
                <h3>{task.title}</h3>
                <p>
                  {task.subject} | Deadline: {formatDate(task.deadline)}
                </p>
              </div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, letterSpacing: '0.1em' }}>{task.task_code}</span>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Buat Tugas Baru</h2>
              <button type="button" className="close-btn" onClick={() => setShowCreate(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={createTask}>
              <div className="form-group">
                <label htmlFor="taskTitleInput">Judul</label>
                <input
                  type="text"
                  id="taskTitleInput"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Contoh: Tugas Bab 3"
                />
              </div>
              <div className="form-group">
                <label htmlFor="taskSubjectInput">Mata Pelajaran</label>
                <input
                  type="text"
                  id="taskSubjectInput"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  placeholder="Contoh: Matematika"
                />
              </div>
              <div className="form-group">
                <label htmlFor="taskDeadlineInput">Deadline</label>
                <input
                  ref={deadlineRef}
                  type="text"
                  id="taskDeadlineInput"
                  required
                  placeholder="Pilih tanggal & waktu"
                  readOnly
                  className="deadline-input"
                />
              </div>
              <div className="form-group">
                <label>Deskripsi (opsional)</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="form-group">
                <label>Jenis Kiriman Siswa</label>
                <div className="type-picker">
                  {(['image', 'video', 'audio'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`type-picker-btn${submissionType === t ? ' active' : ''}`}
                      onClick={() => setSubmissionType(t)}
                    >
                      {t === 'image' ? '📷 Gambar' : t === 'video' ? '🎥 Video' : '🎙️ Audio'}
                    </button>
                  ))}
                </div>
              </div>
              <ClassTargetPicker selectedIds={selectedClassIds} onChange={setSelectedClassIds} />
              <div className="form-group">
                <label>Lampiran (opsional)</label>
                <input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
              </div>
              <button type="submit" className="btn btn-accent">
                Buat Tugas
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.action;
          setConfirm(null);
          action?.();
        }}
      />
      <ProcessingOverlay open={!!processing} text={processing || ''} />
    </>
  );
}
