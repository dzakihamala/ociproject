type Props = {
  open: boolean;
  icon: string;
  title: string;
  subtitle?: string;
};

export function MediaProcessingOverlay({ open, icon, title, subtitle }: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(249, 246, 240, 0.98)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: 24,
      }}
    >
      <style>{`
        @keyframes mediaIconBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes mediaSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ textAlign: 'center', maxWidth: 300, width: '100%' }}>
        <div
          style={{
            width: 72,
            height: 72,
            margin: '0 auto 20px',
            background: 'linear-gradient(135deg, var(--accent), #8fb382)',
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'mediaIconBounce 1.5s ease-in-out infinite',
            boxShadow: '0 4px 16px rgba(107,143,94,0.25)',
          }}
        >
          <span style={{ fontSize: 32, lineHeight: 1 }}>{icon}</span>
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>{title}</h3>
        {subtitle && (
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.5 }}>{subtitle}</p>
        )}
        <div
          style={{
            width: 32,
            height: 32,
            margin: '0 auto',
            border: '3px solid var(--border)',
            borderTop: '3px solid var(--accent)',
            borderRadius: '50%',
            animation: 'mediaSpin 0.8s linear infinite',
          }}
        />
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16 }}>Mohon tunggu, jangan tutup halaman.</p>
      </div>
    </div>
  );
}
