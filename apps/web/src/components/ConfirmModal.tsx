type Props = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({ open, title, message, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="modal active">
      <div className="modal-content" style={{ maxWidth: 360, textAlign: 'center' }}>
        <h3>{title}</h3>
        <p className="mt-1">{message}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
            Batal
          </button>
          <button type="button" className="btn btn-accent" style={{ flex: 1 }} onClick={onConfirm}>
            Ya
          </button>
        </div>
      </div>
    </div>
  );
}
