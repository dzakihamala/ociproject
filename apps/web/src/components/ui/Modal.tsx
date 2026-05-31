import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(74,64,48,0.3)] backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        className="bg-surface p-7 rounded-modal w-[90%] max-w-[440px] max-h-[90vh] overflow-y-auto break-words shadow-lg animate-modal-slide-in"
      >
        <div className="flex justify-between items-center mb-4">
          {title && <h2 className="text-base font-semibold text-text">{title}</h2>}
          <button
            type="button"
            className="bg-transparent border-none text-xl cursor-pointer text-text-3 py-1 px-2 rounded-md transition-all duration-150 hover:text-text hover:bg-green-pale ml-auto"
            onClick={onClose}
            aria-label="Tutup"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
