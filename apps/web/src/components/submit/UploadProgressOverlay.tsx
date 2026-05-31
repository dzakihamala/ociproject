export type UploadPhase = 'progress' | 'saving' | 'complete';

type Props = {
  open: boolean;
  phase: UploadPhase;
  totalFiles: number;
  statusText?: string;
  percent?: number;
};

export function UploadProgressOverlay({ open, phase, totalFiles, statusText, percent = 0 }: Props) {
  if (!open) return null;

  const pct = phase === 'complete' ? 100 : phase === 'saving' ? 95 : percent;
  const isComplete = phase === 'complete';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(249, 246, 240, 0.97)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: 24,
      }}
    >
      <style>{`
        @keyframes uploadPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes uploadSuccess {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      `}</style>
      <div style={{ textAlign: 'center', maxWidth: 340, width: '100%' }}>
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 20px',
            background: isComplete ? 'var(--success)' : 'var(--accent)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isComplete ? 'uploadSuccess 0.5s ease' : 'uploadPulse 1.5s ease-in-out infinite',
          }}
        >
          {isComplete ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          )}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
          {isComplete ? 'Tugas Terkirim!' : 'Mengirim Tugas'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
          {isComplete ? 'Tugas Anda berhasil dikirim.' : statusText || 'Mempersiapkan file...'}
        </p>
        <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 4,
              background: 'linear-gradient(90deg, var(--accent), #8fb382)',
              transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>
            {phase === 'progress' ? `0 / ${totalFiles} file` : `${totalFiles} file`}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{pct}%</span>
        </div>
        {!isComplete && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16 }}>
            Jangan tutup halaman ini selama proses upload berlangsung.
          </p>
        )}
      </div>
    </div>
  );
}
