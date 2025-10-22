import PropTypes from 'prop-types';

export function Toast({ message = null, type = 'info', onClose }) {
  if (!message) {
    return null;
  }

  const normalized = typeof type === 'string' ? type.toLowerCase() : 'info';
  const resolved = normalized === 'warning' ? 'warn' : normalized;
  const allowed = new Set(['info', 'success', 'error', 'warn']);
  const toastType = allowed.has(resolved) ? resolved : 'info';

  return (
    <div className={`toast toast-${toastType}`}>
      <span>{message}</span>
      <button type="button" className="toast__close" onClick={onClose} aria-label="Закрыть">
        ×
      </button>
    </div>
  );
}

Toast.propTypes = {
  message: PropTypes.string,
  type: PropTypes.oneOf(['info', 'success', 'error', 'warn', 'warning']),
  onClose: PropTypes.func.isRequired
};
