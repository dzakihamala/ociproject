import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchClasses } from '../lib/prefetch';
import type { ClassRow } from '../types';

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function ClassTargetPicker({ selectedIds, onChange }: Props) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchClasses()
      .then((list) => {
        if (!cancelled) setClasses(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat kelas');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label htmlFor="taskClassTarget">Target Kelas (opsional)</label>
        {!loading && classes.length > 0 && (
          <div className="class-target-toolbar">
            <button type="button" className="link-edit-nama" onClick={() => onChange(classes.map((c) => c.id))}>
              Pilih semua
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" className="link-edit-nama" onClick={() => onChange([])}>
              Kosongkan
            </button>
          </div>
        )}
      </div>

      {loading && <p className="form-hint">Memuat daftar kelas...</p>}
      {error && (
        <p className="form-hint" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}

      {!loading && !error && classes.length === 0 && (
        <p className="form-hint">
          Belum ada kelas.{' '}
          <Link to="/kelas" viewTransition style={{ color: 'var(--accent)', fontWeight: 500 }}>
            Buat kelas
          </Link>{' '}
          terlebih dahulu.
        </p>
      )}

      {!loading && !error && classes.length > 0 && (
        <div id="taskClassTarget" className="class-target-panel" role="group" aria-label="Target kelas">
          {classes.map((c) => {
            const active = selectedIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`class-target-chip${active ? ' active' : ''}`}
                aria-pressed={active}
                onClick={() => toggle(c.id)}
              >
                <span className="class-target-chip-name">{c.name}</span>
                <span className="class-target-chip-meta">{c.student_count} siswa</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="form-hint">Kosongkan pilihan jika tugas terbuka untuk semua siswa.</p>
    </div>
  );
}
