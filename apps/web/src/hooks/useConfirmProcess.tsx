import { useState, type ReactNode } from 'react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ProcessingOverlay } from '@/components/ProcessingOverlay';
import { useToast } from '@/context/ToastContext';

type ConfirmAction = {
  title: string;
  message: string;
  action: () => void;
};

/**
 * Shared hook for confirmation dialogs + processing overlays.
 * Replaces the duplicated askConfirm/runProcessing pattern across pages.
 */
export function useConfirmProcess() {
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  function askConfirm(title: string, message: string, action: () => void) {
    setConfirm({ title, message, action });
  }

  async function runProcessing(fn: () => Promise<void>, startMsg: string) {
    setProcessing(startMsg);
    try {
      await fn();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Gagal', 'error');
    } finally {
      setProcessing(null);
    }
  }

  const modals: ReactNode = (
    <>
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
      <ProcessingOverlay open={!!processing} text={processing || ''} />
    </>
  );

  return { askConfirm, runProcessing, modals, processing, setProcessing };
}
