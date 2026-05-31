type Props = {
  open: boolean;
  text: string;
};

export function ProcessingOverlay({ open, text }: Props) {
  if (!open) return null;
  return (
    <div className="modal active" style={{ background: 'rgba(249, 246, 240, 0.92)' }}>
      <div className="text-center">
        <div className="loader" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <h3 className="mt-2">Memproses...</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}
