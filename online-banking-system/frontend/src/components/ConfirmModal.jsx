import { Modal, PrimaryButton, SecondaryButton, DangerButton } from './ui';

/**
 * Confirmation dialog for destructive or irreversible actions. Focus starts on
 * Cancel (the safe choice), Escape cancels, and an API error shows inside it.
 */
export default function ConfirmModal({ open, title, children, confirmLabel = 'Confirm', danger = false, loading = false, error = '', onConfirm, onCancel }) {
  const close = () => { if (!loading) onCancel(); };

  const Confirm = danger ? DangerButton : PrimaryButton;
  return (
    <Modal open={open} title={title} onClose={close} busy={loading}>
      <div className="text-sm text-gray-600 space-y-2">{children}</div>
      {error && <p className="text-red-600 text-sm mt-3" role="alert">{error}</p>}
      <div className="flex gap-3 mt-5">
        <SecondaryButton data-autofocus type="button" onClick={close} disabled={loading} className="flex-1">Cancel</SecondaryButton>
        <Confirm type="button" onClick={onConfirm} disabled={loading} className={`flex-1 ${danger ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : ''}`}>
          {loading ? 'Working…' : confirmLabel}
        </Confirm>
      </div>
    </Modal>
  );
}
