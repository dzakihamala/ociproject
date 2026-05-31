import { useEffect } from 'react';

type Props = {
  open: boolean;
  type: 'image' | 'video' | 'audio';
  url: string;
  caption?: string;
  onClose: () => void;
};

export function MediaPreviewOverlay({ open, type, url, caption, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    history.pushState({ preview: true }, '');
    return () => window.removeEventListener('popstate', onPop);
  }, [open, onClose]);

  if (!open) return null;

  if (type === 'image') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        onClick={onClose}
      >
        <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
          <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 4 }} />
          {caption && (
            <div style={{ textAlign: 'center', color: '#fff', fontSize: 13, marginTop: 8 }}>{caption}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 12,
          right: 16,
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          color: '#fff',
          fontSize: 24,
          width: 40,
          height: 40,
          borderRadius: '50%',
          cursor: 'pointer',
          zIndex: 10,
        }}
      >
        &times;
      </button>
      <div style={{ position: 'relative', maxWidth: '92vw', maxHeight: '85vh', width: '100%', textAlign: 'center', padding: '0 8px' }}>
        {type === 'video' ? (
          <video src={url} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '78vh', borderRadius: 8, background: '#000' }} />
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '32px 24px', maxWidth: 400, margin: '0 auto' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
            <audio src={url} controls style={{ width: '100%' }} />
          </div>
        )}
        {caption && (
          <div style={{ textAlign: 'center', color: '#fff', fontSize: 13, marginTop: 12 }}>{caption}</div>
        )}
      </div>
    </div>
  );
}
