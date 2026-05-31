import type { SubmissionMediaType } from '../../lib/media';
import { FORMAT_TIPS } from '../../lib/media';

type Props = {
  open: boolean;
  message: string;
  type: SubmissionMediaType;
  onClose: () => void;
};

export function FormatErrorModal({ open, message, type, onClose }: Props) {
  if (!open) return null;
  const tips = FORMAT_TIPS[type] || [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 3500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 24,
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--error)' }}>Format Tidak Didukung</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.6 }}>{message}</p>
        {tips.length > 0 && (
          <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>💡 Tips:</p>
            <ul style={{ fontSize: 12, color: 'var(--text-2)', paddingLeft: 16, lineHeight: 1.6 }}>
              {tips.map((t) => (
                <li key={t} style={{ marginBottom: 4 }}>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="btn btn-accent" style={{ width: '100%' }} onClick={onClose}>
          Mengerti
        </button>
      </div>
    </div>
  );
}
