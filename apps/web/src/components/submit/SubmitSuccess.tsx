import { useState } from 'react';
import type { Task } from '@/types';
import type { SubmissionMediaType } from '@/lib/media';
import { safeExternalUrl } from '@/types';
import { MediaPreviewOverlay } from './MediaPreviewOverlay';

type Props = {
  task: Task;
  studentName: string;
  studentClass: string;
  studentNote: string;
  fileUrls: string[];
  replaced: boolean;
  submissionType: SubmissionMediaType;
};

export function SubmitSuccess({ task, studentName, studentClass, studentNote, fileUrls, replaced, submissionType }: Props) {
  const [preview, setPreview] = useState<{ url: string; caption: string } | null>(null);
  const fileLabel = submissionType === 'image' ? 'Halaman' : submissionType === 'video' ? 'Video' : 'Audio';

  return (
    <div className="container" style={{ maxWidth: 520, marginTop: 32 }}>
      <div className="card">
        <h2 style={{ color: 'var(--success)', marginBottom: 4 }}>Tugas Terkirim</h2>
        <p style={{ marginBottom: 16 }}>
          Tugas Anda telah berhasil dikirim ke guru.
          {replaced ? ' Pengumpulan sebelumnya telah diganti dengan yang baru.' : ''}
        </p>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>Tugas</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{task.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{task.subject}</div>
          <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-2)', marginBottom: 12, flexWrap: 'wrap' }}>
            <span>Nama: <strong>{studentName}</strong></span>
            <span>Kelas: <strong>{studentClass}</strong></span>
          </div>
          {studentNote && (
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>Catatan: {studentNote}</div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
            {fileLabel} yang dikirim ({fileUrls.length})
          </div>
          <div style={submissionType === 'image' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 } : undefined}>
            {fileUrls.map((url, i) => {
              const safe = safeExternalUrl(url);
              if (!safe) return null;
              if (submissionType === 'image') {
                return (
                  <div key={url} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setPreview({ url: safe, caption: `Halaman ${i + 1} dari ${fileUrls.length}` })}>
                    <img src={safe} alt="" style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)' }} />
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Halaman {i + 1}</div>
                  </div>
                );
              }
              if (submissionType === 'video') {
                return (
                  <div key={url} style={{ marginBottom: 12 }}>
                    <video src={safe} controls style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)' }} />
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, textAlign: 'center' }}>Video {i + 1}</div>
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
      {preview && (
        <MediaPreviewOverlay open type="image" url={preview.url} caption={preview.caption} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
