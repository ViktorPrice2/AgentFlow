import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { diffEntityVersions, fetchEntityHistory } from '../api/agentApi.js';

function formatTimestamp(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ru-RU');
}

function stringifyValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

export function VersionHistoryModal({
  isOpen,
  entityType = null,
  entityId = null,
  entityName = '',
  onClose
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leftId, setLeftId] = useState(null);
  const [rightId, setRightId] = useState(null);
  const [diff, setDiff] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (!isOpen || !entityType || !entityId) {
        return;
      }

      setLoading(true);
      setError(null);
      setDiff(null);
      setDiffError(null);

      try {
        const entries = await fetchEntityHistory(entityType, entityId);

        if (cancelled) {
          return;
        }

        setHistory(entries);

        if (entries.length >= 2) {
          setLeftId(entries[0].id);
          setRightId(entries[1].id);
        } else if (entries.length === 1) {
          setLeftId(entries[0].id);
          setRightId(null);
        } else {
          setLeftId(null);
          setRightId(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Не удалось загрузить историю версий');
          setHistory([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (isOpen) {
      loadHistory();
    } else {
      setHistory([]);
      setLeftId(null);
      setRightId(null);
      setDiff(null);
      setError(null);
      setDiffError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, entityType, entityId]);

  const canCompare = useMemo(() => {
    return Boolean(leftId && rightId && leftId !== rightId);
  }, [leftId, rightId]);

  const selectedLeft = useMemo(
    () => history.find((item) => item.id === leftId) || null,
    [history, leftId]
  );
  const selectedRight = useMemo(
    () => history.find((item) => item.id === rightId) || null,
    [history, rightId]
  );

  const handleCompare = async () => {
    if (!canCompare || !selectedLeft || !selectedRight) {
      return;
    }

    setDiffLoading(true);
    setDiffError(null);

    try {
      const newer = selectedLeft.version >= selectedRight.version ? selectedLeft : selectedRight;
      const older = newer === selectedLeft ? selectedRight : selectedLeft;
      const diffResult = await diffEntityVersions(entityType, newer.id, older.id);
      setDiff(diffResult);
    } catch (err) {
      setDiff(null);
      setDiffError(err.message || 'Не удалось вычислить изменения');
    } finally {
      setDiffLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <h3>Изменения версии</h3>
            <p className="modal-subtitle">
              {entityName || entityId} · {entityType === 'agent' ? 'Агент' : 'Пайплайн'}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="modal-content">
          {loading ? (
            <p>Загрузка истории…</p>
          ) : error ? (
            <p className="error-text">{error}</p>
          ) : history.length === 0 ? (
            <p>Для этой сущности ещё нет версий.</p>
          ) : (
            <>
              <div className="history-selectors">
                <label>
                  Текущая версия
                  <select value={leftId ?? ''} onChange={(event) => setLeftId(Number(event.target.value) || null)}>
                    {history.map((item) => (
                      <option key={item.id} value={item.id}>
                        v{item.version} · {formatTimestamp(item.createdAt)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Сравнить с
                  <select value={rightId ?? ''} onChange={(event) => setRightId(Number(event.target.value) || null)}>
                    <option value="">—</option>
                    {history.map((item) => (
                      <option key={item.id} value={item.id}>
                        v{item.version} · {formatTimestamp(item.createdAt)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary-button" onClick={handleCompare} disabled={!canCompare || diffLoading}>
                  {diffLoading ? 'Вычисление…' : 'Показать изменения'}
                </button>
              </div>

              <section className="history-timeline">
                <h4>Журнал версий</h4>
                <ul>
                  {history.map((item) => (
                    <li key={item.id}>
                      <div>
                        <span className="history-version">v{item.version}</span>
                        <span className="history-date">{formatTimestamp(item.createdAt)}</span>
                      </div>
                      <p>{item.summary}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="diff-section">
                <h4>Различия</h4>
                {!canCompare ? (
                  <p>Выберите две разные версии для сравнения.</p>
                ) : diffError ? (
                  <p className="error-text">{diffError}</p>
                ) : diff && diff.changes.length === 0 ? (
                  <p>Версии идентичны.</p>
                ) : diff && diff.changes.length > 0 ? (
                  <ul className="diff-list">
                    {diff.changes.map((change, index) => (
                      <li key={index}>
                        <span className={`diff-badge diff-${change.type}`}>
                          {change.type === 'added'
                            ? 'Добавлено'
                            : change.type === 'removed'
                            ? 'Удалено'
                            : 'Изменено'}
                        </span>
                        <code className="diff-path">{change.path || '(корень)'}</code>
                        {change.type === 'changed' ? (
                          <div className="diff-values">
                            <div>
                              <small>Было:</small>
                              <pre>{stringifyValue(change.before)}</pre>
                            </div>
                            <div>
                              <small>Стало:</small>
                              <pre>{stringifyValue(change.after)}</pre>
                            </div>
                          </div>
                        ) : (
                          <div className="diff-values single">
                            <pre>{stringifyValue(change.value)}</pre>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : diffLoading ? (
                  <p>Вычисление изменений…</p>
                ) : (
                  <p>Выберите версии и нажмите «Показать изменения», чтобы увидеть дифф.</p>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Закрыть
          </button>
          {selectedLeft && selectedRight ? (
            <div className="modal-meta">
              <span>Сравнение v{selectedLeft.version} ↔ v{selectedRight.version}</span>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

VersionHistoryModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  entityType: PropTypes.string,
  entityId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  entityName: PropTypes.string,
  onClose: PropTypes.func.isRequired
};
