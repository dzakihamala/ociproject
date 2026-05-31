import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

type Props = {
  open: boolean;
  url: string;
  onClose: () => void;
};

export function QrModal({ open, url, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 360,
      margin: 2,
      color: { dark: '#3b5a30', light: '#fffef9' },
    }).catch(() => {});
  }, [open, url]);

  if (!open) return null;

  return (
    <div className="modal active">
      <div className="modal-content" style={{ maxWidth: 480, textAlign: 'center' }}>
        <div className="modal-header">
          <h2>QR Code</h2>
          <button type="button" className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <canvas ref={canvasRef} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Siswa dapat scan kode ini untuk mengumpulkan tugas.
        </p>
      </div>
    </div>
  );
}
