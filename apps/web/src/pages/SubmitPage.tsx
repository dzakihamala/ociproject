import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE, apiForm } from '@/api/client';
import { AudioRecorder } from '@/components/submit/AudioRecorder';
import { FormatErrorModal } from '@/components/submit/FormatErrorModal';
import { MediaPreviews } from '@/components/submit/MediaPreviews';
import { MediaProcessingOverlay } from '@/components/submit/MediaProcessingOverlay';
import { MediaPreviewOverlay } from '@/components/submit/MediaPreviewOverlay';
import { StudentNameSearch } from '@/components/submit/StudentNameSearch';
import { UploadProgressOverlay, type UploadPhase } from '@/components/submit/UploadProgressOverlay';
import { useToast } from '@/context/ToastContext';
import {
  isMobileDevice,
  MAX_CAPTURED_MEDIA,
  processCapturedFile,
  validateMediaFile,
  type SubmissionMediaType,
} from '@/lib/media';
import type { Task } from '@/types';
import { formatDate, safeExternalUrl } from '@/types';

type SuccessState = {
  studentName: string;
  studentClass: string;
  studentNote: string;
  fileUrls: string[];
  replaced: boolean;
};

export function SubmitPage() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const { showToast } = useToast();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [roster, setRoster] = useState<string[]>([]);
  const [rosterFailed, setRosterFailed] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [processing, setProcessing] = useState<{ icon: string; title: string; subtitle: string } | null>(null);
  const [formatError, setFormatError] = useState<{ message: string; type: SubmissionMediaType } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('progress');
  const [uploadStatus, setUploadStatus] = useState('');
  const [successPreview, setSuccessPreview] = useState<{ url: string; caption: string } | null>(null);

  const mediaInputRef = useRef<HTMLInputElement>(null);

  const submissionType: SubmissionMediaType = (task?.submission_type as SubmissionMediaType) || 'image';

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tasks/code/${code}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setTask(data.task);
        setClasses(data.task.classes || []);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Tugas tidak ditemukan', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [code, showToast]);

  const loadRoster = useCallback(
    async (classId: string) => {
      setRosterLoading(true);
      setRosterFailed(false);
      setRoster([]);
      setStudentName('');
      try {
        const res = await fetch(`${API_BASE}/api/tasks/code/${code}/classes/${classId}/students`);
        const data = await res.json();
        if (!res.ok) throw new Error();
        const names = (data.students || []).map((s: { name: string }) => s.name);
        setRoster(names);
      } catch {
        setRosterFailed(true);
        setRoster([]);
      } finally {
        setRosterLoading(false);
      }
    },
    [code],
  );

  function nameAllowed(name: string) {
    if (!classes.length) return true;
    if (rosterFailed) return false;
    if (!roster.length) return false;
    const n = name.trim().toLowerCase();
    return roster.some((s) => s.trim().toLowerCase() === n);
  }

  async function handleMediaCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (files.length >= MAX_CAPTURED_MEDIA) {
      showToast(`Maksimal ${MAX_CAPTURED_MEDIA} file per pengumpulan.`, 'error');
      return;
    }

    const validation = validateMediaFile(file, submissionType);
    if (!validation.ok) {
      setFormatError({ message: validation.errorMsg!, type: submissionType });
      return;
    }

    const typeLabels = { image: 'foto', video: 'video', audio: 'audio' };
    const typeIcons = { image: '📷', video: '🎥', audio: '🎙️' };
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    try {
      if (submissionType === 'image') {
        const formatHint = (file.type || file.name.split('.').pop() || 'unknown').replace('image/', '');
        setProcessing({
          icon: typeIcons.image,
          title: `Mengompresi ${typeLabels.image}...`,
          subtitle: `Ukuran asli: ${sizeMB}MB • Format: ${formatHint}`,
        });
      } else if (submissionType === 'video') {
        const formatLabel = (file.type || file.name.split('.').pop() || 'video').replace('video/', '').toUpperCase();
        setProcessing({
          icon: typeIcons.video,
          title: file.size >= 5 * 1024 * 1024 ? `Mengompresi video (${sizeMB}MB)...` : 'Memproses video...',
          subtitle:
            file.size >= 5 * 1024 * 1024
              ? `Format: ${formatLabel} • Mohon tunggu, jangan tutup halaman.`
              : `Ukuran: ${sizeMB}MB • Format: ${formatLabel}`,
        });
      } else {
        const formatLabel = (file.type || file.name.split('.').pop() || 'audio').replace('audio/', '').toUpperCase();
        setProcessing({
          icon: typeIcons.audio,
          title: 'Mengonversi ke MP3...',
          subtitle: `Ukuran: ${sizeMB}MB • Asal: ${formatLabel}`,
        });
      }

      const processedFile = await processCapturedFile(file, submissionType);
      setProcessing(null);
      setFiles((prev) => [...prev, processedFile]);

      const resultMB = (processedFile.size / 1024 / 1024).toFixed(1);
      if (submissionType === 'audio') {
        showToast(
          processedFile.size < file.size
            ? `Audio disimpan sebagai MP3 (${sizeMB}MB → ${resultMB}MB)`
            : `Audio disimpan sebagai MP3 (${resultMB}MB)`,
          'success',
        );
      } else if (processedFile !== file) {
        const saved = ((1 - processedFile.size / file.size) * 100).toFixed(0);
        showToast(
          `${typeLabels[submissionType].charAt(0).toUpperCase() + typeLabels[submissionType].slice(1)} berhasil diproses! ${sizeMB}MB → ${resultMB}MB (${saved}% lebih kecil)`,
          'success',
        );
      } else {
        showToast(
          `${typeLabels[submissionType].charAt(0).toUpperCase() + typeLabels[submissionType].slice(1)} berhasil ditambahkan!`,
          'success',
        );
      }
    } catch (err) {
      setProcessing(null);
      const msg = err instanceof Error ? err.message : 'Error tidak diketahui';
      const label = { image: 'foto', video: 'video', audio: 'audio' }[submissionType];
      if (msg.includes('decode')) {
        setFormatError({
          message: `Format ${label} tidak dapat dibaca. Coba format lain (${submissionType === 'video' ? 'MP4, MOV' : submissionType === 'audio' ? 'MP3, M4A, AAC' : 'JPG, PNG, WebP'}).`,
          type: submissionType,
        });
      } else {
        showToast(`Gagal memproses ${label}: ${msg}`, 'error');
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task || submitting) return;

    if (!studentName.trim() || !studentClass.trim()) {
      showToast('Lengkapi nama dan kelas.', 'error');
      return;
    }

    if (classes.length) {
      if (rosterFailed) {
        showToast('Gagal memuat daftar siswa. Pilih kelas lagi.', 'error');
        return;
      }
      if (!nameAllowed(studentName)) {
        showToast('Nama tidak ada di daftar kelas ini.', 'error');
        return;
      }
    }

    if (!files.length) {
      const typeLabels = { image: 'foto', video: 'video', audio: 'audio' };
      showToast(`Harap ambil ${typeLabels[submissionType]} tugas.`, 'error');
      return;
    }

    setSubmitting(true);
    setUploadOpen(true);
    setUploadPhase('progress');
    setUploadStatus(`Mengirim ${files.length} file...`);

    const fd = new FormData();
    fd.append('task_code', code);
    fd.append('task_id', task.id);
    fd.append('student_name', studentName.trim());
    fd.append('student_class', studentClass.trim());
    if (note.trim()) fd.append('student_note', note.trim());
    files.forEach((f, i) => fd.append(`file_${i}`, f));

    try {
      setUploadPhase('saving');
      setUploadStatus('Menyimpan ke server...');

      const result = await apiForm<{ replaced?: boolean; file_urls?: string[] }>('/api/submissions', fd, {
        onRetry: (attempt, waitSec) => {
          setUploadPhase('progress');
          setUploadStatus(
            `Banyak siswa sedang mengirim bersamaan. Menunggu giliran (${attempt}) — coba lagi ~${waitSec} detik...`,
          );
        },
      });

      setUploadPhase('complete');
      await new Promise((r) => setTimeout(r, 1200));
      setUploadOpen(false);

      setSuccess({
        studentName: studentName.trim(),
        studentClass: studentClass.trim(),
        studentNote: note.trim(),
        fileUrls: result.file_urls || [],
        replaced: !!result.replaced,
      });
    } catch (err) {
      setUploadOpen(false);
      showToast(err instanceof Error ? err.message : 'Gagal mengirim tugas', 'error');
      setSubmitting(false);
    }
  }

  if (!code) {
    return (
      <div className="container" style={{ maxWidth: 520, marginTop: 32 }}>
        <div className="card text-center">
          <h2>Link Tidak Valid</h2>
          <p>Gunakan link dengan kode tugas dari guru Anda (contoh: /kumpul?code=123456).</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ maxWidth: 520, marginTop: 32 }}>
        <div className="loader" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="container" style={{ maxWidth: 520, marginTop: 32 }}>
        <div className="card text-center">
          <h2>Tugas Tidak Ditemukan</h2>
          <p>Link tidak valid atau tugas telah dihapus.</p>
        </div>
      </div>
    );
  }

  if (success) {
    const fileLabel = submissionType === 'image' ? 'Halaman' : submissionType === 'video' ? 'Video' : 'Audio';
    return (
      <div className="container" style={{ maxWidth: 520, marginTop: 32 }}>
        <div className="card">
          <h2 style={{ color: 'var(--success)', marginBottom: 4 }}>Tugas Terkirim</h2>
          <p style={{ marginBottom: 16 }}>
            Tugas Anda telah berhasil dikirim ke guru.
            {success.replaced ? ' Pengumpulan sebelumnya telah diganti dengan yang baru.' : ''}
          </p>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>Tugas</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{task.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{task.subject}</div>
            <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-2)', marginBottom: 12, flexWrap: 'wrap' }}>
              <span>
                Nama: <strong>{success.studentName}</strong>
              </span>
              <span>
                Kelas: <strong>{success.studentClass}</strong>
              </span>
            </div>
            {success.studentNote && (
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>Catatan: {success.studentNote}</div>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
              {fileLabel} yang dikirim ({success.fileUrls.length})
            </div>
            <div
              style={
                submissionType === 'image'
                  ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }
                  : undefined
              }
            >
              {success.fileUrls.map((url, i) => {
                const safe = safeExternalUrl(url);
                if (!safe) return null;
                if (submissionType === 'image') {
                  return (
                    <div
                      key={url}
                      style={{ textAlign: 'center', cursor: 'pointer' }}
                      onClick={() => setSuccessPreview({ url: safe, caption: `Halaman ${i + 1} dari ${success.fileUrls.length}` })}
                    >
                      <img src={safe} alt="" style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)' }} />
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Halaman {i + 1}</div>
                    </div>
                  );
                }
                if (submissionType === 'video') {
                  return (
                    <div key={url} style={{ marginBottom: 12 }}>
                      <video src={safe} controls style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)' }} />
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, textAlign: 'center' }}>
                        Video {i + 1}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={url} style={{ marginBottom: 12, padding: 12, background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Audio {i + 1}</div>
                    <audio src={safe} controls className="audio-player-inline" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {successPreview && (
          <MediaPreviewOverlay
            open
            type="image"
            url={successPreview.url}
            caption={successPreview.caption}
            onClose={() => setSuccessPreview(null)}
          />
        )}
      </div>
    );
  }

  const isLate = Date.now() > new Date(task.deadline).getTime();
  const mediaAccept =
    submissionType === 'video'
      ? 'video/*,.mov,.mp4,.webm,.3gp,.avi,.mkv'
      : submissionType === 'audio'
        ? 'audio/*,.m4a,.mp3,.aac,.ogg,.wav,.flac,.webm'
        : 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp';

  const mediaLabel = submissionType === 'video' ? 'Video Tugas' : submissionType === 'audio' ? 'Rekam Audio' : 'Foto Tugas';
  const captureBtnLabel = submissionType === 'video' ? 'Rekam Video' : 'Ambil Foto';
  const mediaHint =
    submissionType === 'video' ? (
      <>
        Tekan untuk merekam video. Format yang didukung: MP4, MOV, WebM, 3GP.
        <br />
        <span style={{ color: 'var(--error)' }}>Maksimal 100MB.</span>
      </>
    ) : submissionType === 'image' ? (
      <>
        Tekan untuk memfoto. Format yang didukung: JPG, PNG, WebP.
        <br />
        <span style={{ color: 'var(--error)' }}>Format HEIC (iPhone) tidak didukung — gunakan JPG.</span>
      </>
    ) : null;

  let namePlaceholder = 'Nama lengkap';
  let nameDisabled = false;
  if (classes.length) {
    if (rosterFailed) namePlaceholder = 'Gagal memuat siswa';
    else if (rosterLoading) namePlaceholder = 'Memuat daftar siswa...';
    else if (!studentClass) namePlaceholder = 'Pilih kelas terlebih dahulu';
    else if (!roster.length) namePlaceholder = 'Tidak ada siswa di kelas ini';
    else namePlaceholder = 'Ketik nama untuk mencari...';
    nameDisabled = !studentClass || rosterLoading || rosterFailed || !roster.length;
  }

  return (
    <div className="container" style={{ maxWidth: 520, marginTop: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1>Pengumpulan Tugas</h1>
        <p>Isi form di bawah untuk mengirim tugas.</p>
      </div>

      {!isMobileDevice() && (
        <div
          style={{
            background: '#faf3e0',
            border: '1px solid var(--accent-warm)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 13,
            color: '#7a5c20',
          }}
        >
          📱 <strong>Disarankan menggunakan HP</strong> agar dapat langsung mengambil foto/video/audio dari kamera.
        </div>
      )}

      <div id="appContent">
        <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <h2 style={{ marginBottom: 4 }}>{task.title}</h2>
          <p style={{ fontWeight: 500 }}>{task.subject}</p>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {task.description && <p style={{ whiteSpace: 'pre-line', marginBottom: 12 }}>{task.description}</p>}
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
          </div>
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8 }}>
            <p style={{ color: 'var(--error)', fontSize: 13, fontWeight: 500 }}>
              Batas Waktu: {formatDate(task.deadline)}
            </p>
          </div>
          {isLate && (
            <div
              style={{
                background: '#fee2e2',
                border: '1px solid var(--error)',
                borderRadius: 8,
                padding: '10px 14px',
                marginTop: 10,
                fontSize: 13,
                color: '#7f1d1d',
              }}
            >
              ⏰ <strong>Batas waktu pengumpulan telah lewat.</strong> Anda masih dapat mengirim tugas, namun akan tercatat sebagai{' '}
              <em>terlambat</em>.
            </div>
          )}
        </div>

        <div className="card">
          <form id="submitForm" onSubmit={handleSubmit}>
            {classes.length > 0 ? (
              <>
                <div className="form-group" id="studentClassGroup">
                  <label>Kelas</label>
                  <select
                    id="studentClass"
                    required
                    value={studentClass}
                    onChange={(e) => {
                      const opt = e.target.selectedOptions[0];
                      const className = opt.value;
                      const classId = opt.dataset.classId || '';
                      setStudentClass(className);
                      if (classId) loadRoster(classId);
                      else {
                        setRoster([]);
                        setStudentName('');
                      }
                    }}
                  >
                    <option value="" disabled>
                      Pilih kelas...
                    </option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.name} data-class-id={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" id="studentNameGroup">
                  <label>Nama Lengkap</label>
                  <StudentNameSearch
                    students={roster}
                    value={studentName}
                    disabled={nameDisabled}
                    placeholder={namePlaceholder}
                    onChange={setStudentName}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="form-group" id="studentClassGroup">
                  <label>Kelas</label>
                  <input
                    type="text"
                    id="studentClass"
                    required
                    placeholder="Contoh: XII IPA 1"
                    value={studentClass}
                    onChange={(e) => setStudentClass(e.target.value)}
                  />
                </div>
                <div className="form-group" id="studentNameGroup">
                  <label>Nama Lengkap</label>
                  <input
                    type="text"
                    id="studentName"
                    required
                    placeholder="Nama lengkap"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="form-group" id="mediaInputGroup">
              <label id="mediaLabel">{mediaLabel}</label>
              <MediaPreviews files={files} type={submissionType} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />

              {submissionType === 'audio' ? (
                <AudioRecorder
                  files={files}
                  onAddFile={(f) => setFiles((prev) => [...prev, f])}
                  showToast={showToast}
                />
              ) : (
                <>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    id="mediaInput"
                    accept={mediaAccept}
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleMediaCapture}
                  />
                  <button
                    type="button"
                    id="mediaCaptureBtn"
                    className="btn btn-outline mt-1"
                    style={{ width: '100%', padding: 14 }}
                    onClick={() => mediaInputRef.current?.click()}
                  >
                    {captureBtnLabel}
                  </button>
                  {mediaHint && (
                    <p id="mediaHint" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, textAlign: 'center' }}>
                      {mediaHint}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="form-group">
              <label>Catatan untuk Guru (opsional)</label>
              <textarea id="studentNote" rows={2} placeholder="Tulis catatan jika ada" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <button type="submit" className="btn mt-1" id="btnSubmit" disabled={submitting}>
              {submitting ? 'Mengirim...' : 'Kirim Tugas'}
            </button>
          </form>
        </div>
      </div>

      <MediaProcessingOverlay
        open={!!processing}
        icon={processing?.icon || ''}
        title={processing?.title || ''}
        subtitle={processing?.subtitle}
      />
      <FormatErrorModal
        open={!!formatError}
        message={formatError?.message || ''}
        type={formatError?.type || 'image'}
        onClose={() => setFormatError(null)}
      />
      <UploadProgressOverlay
        open={uploadOpen}
        phase={uploadPhase}
        totalFiles={files.length}
        statusText={uploadStatus || `Mengirim ${files.length} file...`}
      />
    </div>
  );
}
