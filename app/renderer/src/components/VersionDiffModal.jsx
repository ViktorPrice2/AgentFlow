import PropTypes from 'prop-types';

const CHANGE_LABELS = {
  added: 'Добавлено',
  removed: 'Удалено',
  changed: 'Изменено'
};

function formatValue(value) {
  if (value === null || value === undefined) {
    return '∅';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

export function VersionDiffModal({
  open,
  entityName,
  currentVersion,
  nextVersion,
  diff,
  onConfirm,
  onCancel,
  saving
}) {
  if (!open) {
    return null;
  }

  const summary = diff?.summary ?? { added: 0, removed: 0, changed: 0 };
  const hasChanges = Boolean(diff?.changes?.length);

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <header className="modal-header">
          <h3>Изменения версии</h3>
          <p>
            {entityName} · текущая {currentVersion || '—'} → новая {nextVersion || '0.1.0'}
          </p>
        </header>

        <section className="modal-body">
          <div className="diff-summary">
            <span className="diff-chip add">+{summary.added}</span>
            <span className="diff-chip change">≈{summary.changed}</span>
            <span className="diff-chip remove">−{summary.removed}</span>
          </div>

          {hasChanges ? (
            <ul className="diff-list">
              {diff.changes.map((change) => (
                <li key={`${change.path}-${change.type}`} className="diff-entry">
                  <div className="diff-entry-header">
                    <span className={`diff-badge ${change.type}`}>{CHANGE_LABELS[change.type] || change.type}</span>
                    <span className="diff-path">{change.path}</span>
                  </div>
                  <div className="diff-values">
                    <div>
                      <h4>Было</h4>
                      <pre>{formatValue(change.before)}</pre>
                    </div>
                    <div>
                      <h4>Стало</h4>
                      <pre>{formatValue(change.after)}</pre>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="diff-empty">Изменений не обнаружено. Версия будет увеличена для фиксации состояния.</p>
          )}
        </section>

        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
            Отмена
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? 'Сохраняем…' : 'Сохранить версию'}
          </button>
        </footer>
      </div>
    </div>
  );
}

VersionDiffModal.propTypes = {
  open: PropTypes.bool.isRequired,
  entityName: PropTypes.string,
  currentVersion: PropTypes.string,
  nextVersion: PropTypes.string,
  diff: PropTypes.shape({
    summary: PropTypes.shape({
      added: PropTypes.number,
      removed: PropTypes.number,
      changed: PropTypes.number
    }),
    changes: PropTypes.arrayOf(
      PropTypes.shape({
        path: PropTypes.string.isRequired,
        type: PropTypes.string.isRequired,
        before: PropTypes.any,
        after: PropTypes.any
      })
    )
  }),
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  saving: PropTypes.bool
};

VersionDiffModal.defaultProps = {
  entityName: 'Пайплайн',
  currentVersion: '—',
  nextVersion: '0.1.0',
  diff: { summary: { added: 0, removed: 0, changed: 0 }, changes: [] },
  saving: false
};
