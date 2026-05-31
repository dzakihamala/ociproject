interface StorageWarningProps {
  usedMb: number;
  limitMb?: number;
}

export function StorageWarning({ usedMb, limitMb = 10240 }: StorageWarningProps) {
  const pct = Math.min((usedMb / limitMb) * 100, 100);

  let usedLabel: string;
  if (usedMb < 1) {
    usedLabel = `${(usedMb * 1024).toFixed(0)} KB`;
  } else if (usedMb < 1024) {
    usedLabel = `${usedMb.toFixed(1)} MB`;
  } else {
    usedLabel = `${(usedMb / 1024).toFixed(2)} GB`;
  }
  const limitLabel = limitMb >= 1024 ? `${(limitMb / 1024).toFixed(0)} GB` : `${limitMb.toFixed(0)} MB`;

  const isDanger = pct > 90;
  const isWarning = pct > 70;

  return (
    <div className="storage-bar">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-text-2">Penyimpanan</span>
        <span className="text-xs text-text-3">
          {usedLabel} / {limitLabel}
        </span>
      </div>
      <div className="storage-track">
        <div
          className={`storage-fill${isDanger ? ' danger' : isWarning ? ' warning' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isDanger && (
        <div className="storage-warning danger">
          <strong>Penyimpanan hampir penuh!</strong> Segera hapus tugas-tugas lama yang sudah tidak diperlukan. Buka detail tugas &rarr; klik tombol &quot;Hapus&quot; untuk menghapus tugas beserta seluruh file kiriman siswa.
        </div>
      )}
      {isWarning && !isDanger && (
        <div className="storage-warning">
          Penyimpanan mulai terbatas. Pertimbangkan untuk menghapus tugas-tugas lama yang sudah selesai agar ruang penyimpanan tetap tersedia.
        </div>
      )}
    </div>
  );
}
