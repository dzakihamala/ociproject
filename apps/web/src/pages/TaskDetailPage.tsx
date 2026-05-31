import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '@/api/client';
import { ConfirmModal } from '@/components/ConfirmModal';
import { MediaViewer } from '@/components/MediaViewer';
import { ProcessingOverlay } from '@/components/ProcessingOverlay';
import { QrModal } from '@/components/QrModal';
import { useToast } from '@/context/ToastContext';
import { useQuery } from '@tanstack/react-query';
import {
  buildDownloadIndex,
  downloadAllSubmissionsForTask,
  downloadStudentSubmission,
  type MediaGroup,
} from '@/lib/downloads';
import { fetchTaskDetail, queryClient, queryKeys, removeTaskFromDashboardCache } from '@/lib/queryClient';
import {
  type ClassRoster,
  computeNotSubmitted,
  filterSubmissionsByClass,
  splitSubmissions,
} from '@/lib/submissionStats';
import type { Submission } from '@/types';
import { formatDate, safeExternalUrl } from '@/types';

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.task(id!),
    queryFn: () => fetchTaskDetail(id!),
    enabled: !!id,
  });

  const task = data?.task ?? null;
  const subs = data?.submissions ?? [];

  const [qrOpen, setQrOpen] = useState(false);
  const [viewer, setViewer] = useState<{ groups: MediaGroup[]; type: 'image' | 'video' | 'audio' } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [roster, setRoster] = useState<ClassRoster[]>([]);
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    if (error) {
      showToast(error.message, 'error');
      navigate('/dashboard');
    }
  }, [error, navigate, showToast]);

  const taskClasses = task?.classes ?? [];
  const hasMultipleClasses = taskClasses.length > 1;

  useEffect(() => {
    if (!task?.classes?.length) {
      setRoster([]);
      setClassFilter('all');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await Promise.all(
          task.classes!.map(async (c) => {
            const data = await apiRequest<{ students: { id: string; name: string }[] }>(
              `/api/classes/${c.id}/students`,
            );
            return { classId: c.id, className: c.name, students: data.students || [] };
          }),
        );
        if (!cancelled) setRoster(rows);
      } catch {
        if (!cancelled) setRoster([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task?.id, task?.classes]);

  useEffect(() => {
    if (classFilter === 'all') return;
    if (!taskClasses.some((c) => c.id === classFilter)) setClassFilter('all');
  }, [classFilter, taskClasses]);

  const deadlineMs = task ? new Date(task.deadline).getTime() : 0;
  const filteredSubs = useMemo(
    () => (task ? filterSubmissionsByClass(subs, classFilter, taskClasses) : []),
    [subs, classFilter, task, taskClasses],
  );
  const { submitted, late } = useMemo(
    () => splitSubmissions(filteredSubs, deadlineMs),
    [filteredSubs, deadlineMs],
  );
  const notSubmitted = useMemo(
    () => (task && taskClasses.length ? computeNotSubmitted(roster, subs, classFilter, taskClasses) : []),
    [roster, subs, classFilter, task, taskClasses],
  );

  const downloadIndex = useMemo(() => buildDownloadIndex(filteredSubs), [filteredSubs]);

  if (!task) {
    if (isLoading) return <div className="loader page-loader" />;
    return (
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Tugas tidak dapat dimuat</h2>
        <p style={{ marginBottom: 16 }}>{error?.message || 'Data tugas tidak tersedia.'}</p>
        <Link to="/dashboard" className="btn btn-outline btn-inline">
          Kembali ke daftar tugas
        </Link>
      </div>
    );
  }

  const shareLink = `${window.location.origin}/kumpul?code=${task.task_code}`;
  const submissionType = task.submission_type || 'image';
  const typeLabel = { image: '📷 Gambar', video: '🎥 Video', audio: '🎙️ Audio' }[submissionType];

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

  function viewGroup(group: MediaGroup) {
    setViewer({ groups: [group], type: submissionType });
  }

  function viewAll() {
    if (!filteredSubs.length) {
      showToast('Belum ada pengumpulan tugas.', 'error');
      return;
    }
    const groups = downloadIndex.map((x) => x.group);
    if (!groups.length) {
      showToast('Tidak ada file pengumpulan yang valid.', 'error');
      return;
    }
    setViewer({ groups, type: submissionType });
  }

  function downloadGroup(group: MediaGroup) {
    runProcessing(
      async () => {
        await downloadStudentSubmission(group, submissionType, setProcessing);
        showToast(submissionType === 'image' ? 'PDF berhasil diunduh!' : 'File berhasil diunduh!', 'success');
      },
      `Menyiapkan unduhan untuk ${group.name}...`,
    );
  }

  function downloadAll() {
    if (!filteredSubs.length) {
      showToast('Belum ada pengumpulan tugas.', 'error');
      return;
    }
    const msg =
      submissionType === 'image'
        ? 'Semua tugas siswa akan digabung menjadi satu file PDF. Lanjutkan?'
        : 'Semua file akan dikemas dalam satu ZIP: per kelas, lalu folder Tepat Waktu dan Terlambat. Lanjutkan?';
    askConfirm('Unduh Semua', msg, () =>
      runProcessing(async () => {
        await downloadAllSubmissionsForTask(task!, filteredSubs, setProcessing);
        showToast(
          submissionType === 'image' ? 'PDF berhasil diunduh!' : 'ZIP berhasil diunduh!',
          'success',
        );
      }, submissionType === 'image' ? 'Menggabungkan semua tugas...' : 'Mengumpulkan file ke ZIP...'),
    );
  }

  return (
    <>
      <div className="header mt-2" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-danger btn-inline"
          onClick={() =>
            askConfirm(
              'Hapus Tugas',
              'Yakin ingin menghapus tugas ini? Semua data pengumpulan siswa juga akan ikut terhapus.',
              () =>
                runProcessing(async () => {
                  const deletedId = task.id;
                  await apiRequest(`/api/tasks/${deletedId}`, { method: 'DELETE' });
                  removeTaskFromDashboardCache(deletedId);
                  queryClient.invalidateQueries({ queryKey: queryKeys.task(deletedId) });
                  showToast('Tugas berhasil dihapus.', 'success');
                  navigate('/dashboard');
                }, 'Menghapus tugas...'),
            )
          }
        >
          Hapus
        </button>
      </div>

      <div className="card">
        <h1>{task.title}</h1>
        <p>{task.subject}</p>
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Kode Tugas:</span>{' '}
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 600, letterSpacing: '0.15em' }}>
            {task.task_code}
          </span>
          <span className="type-badge" style={{ marginLeft: 10 }}>
            {typeLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-2)', marginBottom: 12, flexWrap: 'wrap' }}>
          <span>
            Dibuat: <strong>{formatDate(task.created_at)}</strong>
          </span>
          <span>
            Deadline: <strong style={{ color: 'var(--error)' }}>{formatDate(task.deadline)}</strong>
          </span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Target Kelas:</span>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {task.classes && task.classes.length > 0 ? (
              task.classes.map((c) => (
                <span key={c.id} className="type-badge">
                  {c.name}
                </span>
              ))
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Semua kelas (input bebas)</span>
            )}
          </div>
        </div>
        {task.description && (
          <p style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-line', marginBottom: 16 }}>
            {task.description}
          </p>
        )}
        {task.file_url && safeExternalUrl(task.file_url) && (
          <a
            href={safeExternalUrl(task.file_url)!}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-inline mt-1"
          >
            Unduh File Soal
          </a>
        )}
        <div style={{ marginTop: 16, padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <label style={{ marginBottom: 4, fontSize: 12 }}>Link untuk siswa</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="text" readOnly value={shareLink} style={{ flex: 1, minWidth: 200 }} />
            <button
              type="button"
              className="btn btn-inline"
              onClick={() => {
                navigator.clipboard.writeText(shareLink);
                showToast('Link disalin!', 'success');
              }}
            >
              Salin
            </button>
            <button type="button" className="btn btn-outline btn-inline" onClick={() => setQrOpen(true)}>
              QR
            </button>
          </div>
        </div>
      </div>

      <div className="card mt-2" style={{ padding: '14px 16px' }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Info Pengumpulan</h2>

        {hasMultipleClasses && (
          <div className="class-filter-bar">
            <button
              type="button"
              className={`class-filter-btn${classFilter === 'all' ? ' active' : ''}`}
              onClick={() => setClassFilter('all')}
            >
              Semua Kelas
            </button>
            {taskClasses.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`class-filter-btn${classFilter === c.id ? ' active' : ''}`}
                onClick={() => setClassFilter(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="submission-stats-row">
          <div className="submission-stat-box">
            <div className="submission-stat-value">{filteredSubs.length}</div>
            <div className="submission-stat-label">Total</div>
          </div>
          <div className="submission-stat-box">
            <div className="submission-stat-value" style={{ color: 'var(--success)' }}>
              {submitted.length}
            </div>
            <div className="submission-stat-label">Tepat Waktu</div>
          </div>
          <div className="submission-stat-box">
            <div className="submission-stat-value" style={{ color: 'var(--error)' }}>
              {late.length}
            </div>
            <div className="submission-stat-label">Terlambat</div>
          </div>
          <div className="submission-stat-box">
            <div className="submission-stat-value" style={{ color: 'var(--accent-warm)' }}>
              {taskClasses.length ? notSubmitted.length : '—'}
            </div>
            <div className="submission-stat-label">Belum</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }} className="mt-2">
        <h2 style={{ marginBottom: 0 }}>Pengumpulan</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-outline btn-inline" onClick={viewAll}>
            Lihat Semua
          </button>
          <button type="button" className="btn btn-accent btn-inline" onClick={downloadAll}>
            Unduh Semua
          </button>
        </div>
      </div>

      <div className="submission-columns">
        <div className="submission-column">
          <h3 style={{ color: 'var(--success)' }}>Tepat Waktu</h3>
          <SubmissionTable
            rows={submitted}
            downloadIndex={downloadIndex}
            onView={viewGroup}
            onDownload={downloadGroup}
          />
        </div>
        <div className="submission-column">
          <h3 style={{ color: 'var(--error)' }}>Terlambat</h3>
          <SubmissionTable
            rows={late}
            downloadIndex={downloadIndex}
            onView={viewGroup}
            onDownload={downloadGroup}
          />
        </div>
      </div>

      <h3 className="mt-2" style={{ color: 'var(--accent-warm)' }}>
        Belum
      </h3>
      <NotSubmittedTable rows={notSubmitted} hasRoster={taskClasses.length > 0} />

      <p className="mt-2">
        <Link to="/dashboard" viewTransition className="link-back">
          ← Kembali ke daftar tugas
        </Link>
      </p>

      <QrModal open={qrOpen} url={shareLink} onClose={() => setQrOpen(false)} />
      {viewer && <MediaViewer groups={viewer.groups} type={viewer.type} onClose={() => setViewer(null)} />}
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

function NotSubmittedTable({
  rows,
  hasRoster,
}: {
  rows: { name: string; className: string }[];
  hasRoster: boolean;
}) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kelas</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((r) => (
                <tr key={`${r.className}-${r.name}`}>
                  <td>{r.name}</td>
                  <td>{r.className}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="text-center table-empty-cell">
                  {hasRoster ? '—' : 'Tugas tanpa target kelas'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubmissionTable({
  rows,
  downloadIndex,
  onView,
  onDownload,
}: {
  rows: Submission[];
  downloadIndex: { sub: Submission; group: MediaGroup }[];
  onView: (g: MediaGroup) => void;
  onDownload: (g: MediaGroup) => void;
}) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kelas</th>
              <th>Waktu</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((s) => {
                const entry = downloadIndex.find((x) => x.sub.id === s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      {s.student_name}
                      {s.student_note && (
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{s.student_note}</div>
                      )}
                    </td>
                    <td>{s.student_class}</td>
                    <td>{formatDate(s.created_at)}</td>
                    <td>
                      {entry ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-inline"
                            style={{ fontSize: 12, padding: '5px 10px' }}
                            onClick={() => onView(entry.group)}
                          >
                            Lihat
                          </button>
                          <button
                            type="button"
                            className="btn btn-accent btn-inline"
                            style={{ fontSize: 12, padding: '5px 10px' }}
                            onClick={() => onDownload(entry.group)}
                          >
                            Unduh
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="text-center table-empty-cell">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
