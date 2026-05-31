import { useEffect, useRef, useState } from 'react';

type Props = {
  students: string[];
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (name: string) => void;
};

export function StudentNameSearch({ students, value, disabled, placeholder, onChange }: Props) {
  const [locked, setLocked] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!locked) setQuery(value);
  }, [value, locked]);

  function unlock() {
    setLocked(false);
    setQuery('');
    onChange('');
    setOpen(false);
  }

  function lockName(name: string) {
    setLocked(true);
    setQuery(name);
    onChange(name);
    setOpen(false);
  }

  function runSearch(q: string) {
    const lower = q.trim().toLowerCase();
    if (lower.length < 1) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }

  const matches = locked
    ? []
    : students.filter((s) => s.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div id="studentNameContainer" style={{ position: 'relative' }}>
      <input
        type="text"
        id="studentName"
        value={locked ? value : query}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        readOnly={locked}
        className={locked ? 'name-input-locked' : ''}
        onChange={(e) => {
          if (locked) return;
          const v = e.target.value;
          setQuery(v);
          onChange(v);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => runSearch(v), 150);
        }}
        onFocus={() => {
          if (locked) {
            unlock();
            return;
          }
          if (query.trim().length >= 1) runSearch(query);
        }}
        onClick={() => {
          if (locked) unlock();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && !locked && (
        <div id="studentNameDropdown" className="student-name-dropdown" style={{ display: 'block' }}>
          {matches.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-3)' }}>Tidak ditemukan</div>
          ) : (
            matches.map((name) => (
              <div
                key={name}
                className="student-pick-item"
                style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border)' }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => lockName(name)}
              >
                {name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
