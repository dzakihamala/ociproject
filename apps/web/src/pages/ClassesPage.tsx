import { useState } from 'react';
import { apiRequest } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useCachedQuery } from '../hooks/useCachedQuery';
import { invalidateCache } from '../lib/dataCache';
import { CACHE_KEYS, fetchClasses } from '../lib/prefetch';
import type { ClassRow, Student } from '../types';

export function ClassesPage() {
  const { showToast } = useToast();
  const { data: classesData, loading, refresh } = useCachedQuery(CACHE_KEYS.classes, fetchClasses);
  const classes = classesData ?? [];
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [activeClass, setActiveClass] = useState<ClassRow | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [bulkNames, setBulkNames] = useState('');
  const [editingName, setEditingName] = useState('');
  const [renameClass, setRenameClass] = useState(false);

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    if (!newClassName.trim()) return;
    try {
      await apiRequest('/api/classes', { method: 'POST', body: JSON.stringify({ name: newClassName.trim() }) });
      invalidateCache(CACHE_KEYS.classes);
      invalidateCache(CACHE_KEYS.dashboard);
      setNewClassName('');
      setShowAddClass(false);
      await refresh(true);
      showToast('Kelas berhasil ditambahkan.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal', 'error');
    }
  }

  async function openStudents(cls: ClassRow) {
    setActiveClass(cls);
    setEditingName(cls.name);
    setRenameClass(false);
    setBulkNames('');
    try {
      const data = await apiRequest<{ students: Student[] }>(`/api/classes/${cls.id}/students`);
      setStudents(data.students || []);
    } catch {
      setStudents([]);
    }
  }

  function startRename() {
    if (!activeClass) return;
    setEditingName(activeClass.name);
    setRenameClass(true);
  }

  function cancelRename() {
    if (!activeClass) return;
    setEditingName(activeClass.name);
    setRenameClass(false);
  }

  async function saveClassName() {
    if (!activeClass || !editingName.trim()) return;
    try {
      await apiRequest(`/api/classes/${activeClass.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editingName.trim() }),
      });
      showToast('Nama kelas diperbarui.', 'success');
      setRenameClass(false);
      invalidateCache(CACHE_KEYS.classes);
      invalidateCache(CACHE_KEYS.dashboard);
      await refresh(true);
      setActiveClass({ ...activeClass, name: editingName.trim() });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal', 'error');
    }
  }

  async function bulkAdd() {
    if (!activeClass) return;
    const names = bulkNames.split('\n').map((n) => n.trim()).filter(Boolean);
    if (!names.length) {
      showToast('Masukkan minimal satu nama.', 'error');
      return;
    }
    try {
      await apiRequest(`/api/classes/${activeClass.id}/students`, {
        method: 'POST',
        body: JSON.stringify({ names }),
      });
      setBulkNames('');
      invalidateCache(CACHE_KEYS.classes);
      invalidateCache(CACHE_KEYS.dashboard);
      await openStudents(activeClass);
      await refresh(true);
      showToast('Siswa ditambahkan.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal', 'error');
    }
  }

  async function deleteStudent(id: string) {
    if (!confirm('Hapus siswa ini?')) return;
    try {
      await apiRequest(`/api/students/${id}`, { method: 'DELETE' });
      if (activeClass) await openStudents(activeClass);
      invalidateCache(CACHE_KEYS.classes);
      invalidateCache(CACHE_KEYS.dashboard);
      await refresh(true);
      showToast('Siswa dihapus.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal', 'error');
    }
  }

  async function deleteClass() {
    if (!activeClass || !confirm(`Hapus kelas "${activeClass.name}"?`)) return;
    try {
      await apiRequest(`/api/classes/${activeClass.id}`, { method: 'DELETE' });
      setActiveClass(null);
      invalidateCache(CACHE_KEYS.classes);
      invalidateCache(CACHE_KEYS.dashboard);
      await refresh(true);
      showToast('Kelas dihapus.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal', 'error');
    }
  }

  return (
    <>
      <div className="header mt-2">
        <div>
          <h1>🌿 Kelas</h1>
          <p>Kelola daftar kelas dan siswa.</p>
        </div>
        <button type="button" className="btn btn-accent btn-inline" onClick={() => setShowAddClass(true)}>
          Tambah Kelas
        </button>
      </div>

      {loading ? (
        <div className="loader page-loader" />
      ) : classes.length === 0 ? (
        <p className="empty-state">Belum ada kelas. Klik &quot;Tambah Kelas&quot; untuk mulai.</p>
      ) : (
        <div className="task-list">
          {classes.map((c) => (
            <div key={c.id} className="task-item" onClick={() => openStudents(c)} role="button" tabIndex={0}>
              <div className="task-info">
                <h3>{c.name}</h3>
                <p>{c.student_count} siswa</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddClass && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Tambah Kelas</h2>
              <button type="button" className="close-btn" onClick={() => setShowAddClass(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={addClass}>
              <div className="form-group">
                <label htmlFor="classNameInput">Nama Kelas</label>
                <input
                  type="text"
                  id="classNameInput"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  required
                  placeholder="Contoh: XII IPA 1"
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-accent">
                Simpan
              </button>
            </form>
          </div>
        </div>
      )}

      {activeClass && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ marginBottom: 0 }}>Siswa</h2>
                <div className="class-name-inline-wrap">
                  <div className="class-name-inline-row">
                    {renameClass ? (
                      <input
                        type="text"
                        id="studentModalClassNameInput"
                        className="class-name-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                        autoComplete="off"
                      />
                    ) : (
                      <span className="class-name-display">{activeClass.name}</span>
                    )}
                  </div>
                  <div className="class-name-inline-actions">
                    {renameClass ? (
                      <div className="class-name-edit-btns">
                        <button type="button" className="btn btn-accent btn-inline btn-sm" onClick={saveClassName}>
                          Simpan
                        </button>
                        <button type="button" className="btn btn-outline btn-inline btn-sm" onClick={cancelRename}>
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="link-edit-nama" onClick={startRename}>
                        edit nama
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <button type="button" className="close-btn" onClick={() => setActiveClass(null)}>
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline btn-inline btn-sm"
                style={{ color: 'var(--error)' }}
                onClick={deleteClass}
              >
                Hapus kelas
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="bulkNamesInput">Tambah siswa (satu nama per baris)</label>
              <textarea
                id="bulkNamesInput"
                value={bulkNames}
                onChange={(e) => setBulkNames(e.target.value)}
                rows={4}
                placeholder={'Ahmad Fauzi\nBudi Santoso\nCitra Dewi'}
              />
              <button type="button" className="btn btn-accent btn-inline btn-sm mt-1" onClick={bulkAdd}>
                Simpan daftar
              </button>
            </div>

            <div className="student-list-panel">
              {students.length === 0 ? (
                <p className="form-hint" style={{ textAlign: 'center', margin: 0 }}>
                  Belum ada siswa.
                </p>
              ) : (
                students.map((s) => (
                  <div key={s.id} className="student-list-row">
                    <span>{s.name}</span>
                    <button type="button" className="btn btn-outline btn-inline btn-sm" onClick={() => deleteStudent(s.id)}>
                      Hapus
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
