import PropTypes from 'prop-types';

export function Toast({ message = null, type = 'info', onClose }) {
  if (!message) {
    return null;
  }

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button type="button" className="toast__close" onClick={onClose} aria-label="Закрыть">
        ×
      </button>
    </div>
  );
}

Toast.propTypes = {
  message: PropTypes.string,
  type: PropTypes.oneOf(['info', 'success', 'error']),
  onClose: PropTypes.func.isRequired
};
