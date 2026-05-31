import { useEffect } from 'react';
import type { MediaGroup } from '@/lib/downloads';
import { safeExternalUrl } from '@/types';

type Props = {
  groups: MediaGroup[];
  type: 'image' | 'video' | 'audio';
  onClose: () => void;
};

export function MediaViewer({ groups, type, onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const title =
    groups.length === 1
      ? groups[0].name
      : type === 'image'
        ? `Semua Tugas (${groups.length} siswa)`
        : `Semua ${type === 'video' ? 'Video' : 'Audio'} (${groups.length} siswa)`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 2000,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 1,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <button type="button" className="btn btn-outline btn-inline" style={{ fontSize: 12, padding: '6px 14px' }} onClick={onClose}>
          Tutup
        </button>
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
        {groups.map((group, gi) => (
          <div key={`${group.name}-${gi}`}>
            {groups.length > 1 && (
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 8,
                  paddingTop: gi > 0 ? 24 : 0,
                  borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
                  marginTop: gi > 0 ? 24 : 0,
                }}
              >
                {group.name}
                {group.className ? ` — ${group.className}` : ''}
              </div>
            )}
            {group.urls.map((url, i) => {
              const safe = safeExternalUrl(url);
              if (!safe) return null;
              return (
                <div key={i} style={{ marginBottom: 12 }} className={type !== 'image' ? 'media-viewer-item' : undefined}>
                  {type === 'image' && (
                    <img
                      src={safe}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
                    />
                  )}
                  {type === 'video' && <video src={safe} controls preload="metadata" style={{ width: '100%', display: 'block' }} />}
                  {type === 'audio' && (
                    <div style={{ padding: 16 }}>
                      <audio src={safe} controls style={{ width: '100%' }} />
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-3)',
                      marginTop: 4,
                      textAlign: 'center',
                    }}
                    className={type !== 'image' ? 'media-viewer-caption' : undefined}
                  >
                    {type === 'image' ? `Halaman ${i + 1} dari ${group.urls.length}` : `${type === 'video' ? 'Video' : 'Audio'} ${i + 1} dari ${group.urls.length}`}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
