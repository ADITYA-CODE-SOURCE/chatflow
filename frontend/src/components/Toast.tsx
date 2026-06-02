import './Toast.css';

type Props = {
  message: string;
  tone?: 'success' | 'error';
  onClose: () => void;
};

export default function Toast({ message, tone = 'success', onClose }: Props) {
  if (!message) return null;

  return (
    <div className={`toast toast-${tone}`} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  );
}
