import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from '@/api/client';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useToast } from '@/context/ToastContext';
import { fetchClasses, queryClient, queryKeys } from '@/lib/queryClient';
import type { ClassRow, Student } from '@/types';

export function ClassesPage() {
  const { showToast } = useToast();

  const { data: classesData, isLoading } = useQuery({
    queryKey: queryKeys.classes,
    queryFn: fetchClasses,
  });
  const classes = classesData ?? [];

  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [activeClass, setActiveClass] = useState<ClassRow | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [bulkNames, setBulkNames] = useState('');
  const [editingName, setEditingName] = useState('');
  const [renameClass, setRenameClass] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const addClassMutation = useMutation({
    mutationFn: async (name: string) => apiRequest('/api/classes', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.classes });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      setNewClassName('');
      setShowAddClass(false);
      showToast('Kelas berhasil ditambahkan.', 'success');
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Gagal', 'error'),
  });

  function addClass(e: React.FormEvent) {
    e.preventDefault();
    if (!newClassName.trim()) return;
    addClassMutation.mutate(newClassName.trim());
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
      queryClient.invalidateQueries({ queryKey: queryKeys.classes });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.classes });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      await openStudents(activeClass);
      showToast('Siswa ditambahkan.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal', 'error');
    }
  }

  function deleteStudent(id: string, name: string) {
    setConfirm({
      title: 'Hapus Siswa',
      message: `Hapus siswa "${name}"?`,
      action: async () => {
        try {
          await apiRequest(`/api/students/${id}`, { method: 'DELETE' });
          if (activeClass) await openStudents(activeClass);
          queryClient.invalidateQueries({ queryKey: queryKeys.classes });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
          showToast('Siswa dihapus.', 'success');
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Gagal', 'error');
        }
      },
    });
  }

  function deleteClass() {
    if (!activeClass) return;
    setConfirm({
      title: 'Hapus Kelas',
      message: `Hapus kelas "${activeClass.name}"?`,
      action: async () => {
        try {
          await apiRequest(`/api/classes/${activeClass.id}`, { method: 'DELETE' });
          setActiveClass(null);
          queryClient.invalidateQueries({ queryKey: queryKeys.classes });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
          showToast('Kelas dihapus.', 'success');
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Gagal', 'error');
        }
      },
    });
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

      {isLoading ? (
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
              <button type="submit" className="btn btn-accent" disabled={addClassMutation.isPending}>
                {addClassMutation.isPending ? 'Menyimpan...' : 'Simpan'}
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
                    <button type="button" className="btn btn-outline btn-inline btn-sm" onClick={() => deleteStudent(s.id, s.name)}>
                      Hapus
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.action;
          setConfirm(null);
          action?.();
        }}
      />
    </>
  );
}
