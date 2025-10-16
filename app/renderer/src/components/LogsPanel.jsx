import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useI18n } from '../i18n/useI18n.jsx';

function normalizeLevel(level) {
  const value = (level || '').toLowerCase();
  if (value === 'error') {
    return 'error';
  }

  if (value === 'warn' || value === 'warning') {
    return 'warn';
  }

  if (value === 'success' || value === 'ok') {
    return 'success';
  }

  return 'info';
}

function prepareDetails(details) {
  if (details === null || details === undefined) {
    return null;
  }

  if (typeof details === 'string') {
    return details;
  }

  try {
    const serialized = JSON.stringify(details, null, 2);
    return serialized.length > 1200 ? `${serialized.slice(0, 1200)}…` : serialized;
  } catch (error) {
    return String(details);
  }
}

export function LogsPanel({ entries, open, onClose, onClear }) {
  const { t, language } = useI18n();
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
    [language]
  );

  return (
    <aside className={`logs-panel ${open ? 'open' : ''}`} aria-live="polite">
      <header className="logs-panel__header">
        <div>
          <h3>{t('app.log.title')}</h3>
          <span className="logs-panel__count">{entries.length}</span>
        </div>
        <div className="logs-panel__actions">
          <button
            type="button"
            className="link-button"
            onClick={onClear}
            disabled={entries.length === 0}
          >
            {t('app.log.clear')}
          </button>
          <button type="button" className="link-button" onClick={onClose}>
            {t('app.log.close')}
          </button>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="logs-panel__empty">{t('app.log.empty')}</p>
      ) : (
        <ul className="logs-panel__list">
          {entries.map((entry) => {
            const levelKey = normalizeLevel(entry.level);
            const timeLabel = formatter.format(new Date(entry.timestamp || Date.now()));
            const detailsText = prepareDetails(entry.details);

            return (
              <li key={entry.id} className="logs-panel__item">
                <div className="logs-panel__item-head">
                  <span className={`logs-level logs-level-${levelKey}`}>
                    {t(`app.log.level.${levelKey}`)}
                  </span>
                  <time dateTime={entry.timestamp || ''}>{timeLabel}</time>
                </div>
                <p className="logs-panel__message">{entry.message}</p>
                {entry.source ? (
                  <span className="logs-panel__source">{entry.source}</span>
                ) : null}
                {detailsText ? <pre className="logs-panel__details">{detailsText}</pre> : null}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

LogsPanel.propTypes = {
  entries: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      level: PropTypes.string,
      message: PropTypes.string,
      source: PropTypes.string,
      details: PropTypes.any,
      timestamp: PropTypes.string
    })
  ).isRequired,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired
};




