import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

function getEnvironmentInfo() {
  if (typeof process === 'undefined') {
    return [];
  }

  return [
    { label: 'Node', value: process.versions?.node },
    { label: 'Chromium', value: process.versions?.chrome },
    { label: 'Electron', value: process.versions?.electron },
    { label: 'OS', value: typeof navigator !== 'undefined' ? navigator.userAgent : '' }
  ];
}

export function SettingsPage({
  providerStatus = [],
  apiAvailable,
  onRefresh,
  botStatus,
  onSaveToken,
  onRefreshBot,
  onTailLog,
  proxyValue = '',
  onSaveProxy,
  proxyBusy = false,
  botLogEntries = [],
  botLogLoading = false,
  botBusy = false,
  theme = 'light',
  onThemeChange
}) {
  const { t, language, setLanguage } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
  const envInfo = getEnvironmentInfo();
  const storedProxyValue = typeof proxyValue === 'string' ? proxyValue : '';
  const [tokenInput, setTokenInput] = useState('');
  const [proxyInput, setProxyInput] = useState(storedProxyValue);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTokenInput('');
  }, [botStatus?.tokenStored]);

  useEffect(() => {
    setCopied(false);
  }, [botStatus?.deeplinkBase]);

  useEffect(() => {
    setProxyInput(storedProxyValue);
  }, [storedProxyValue]);

  const normalizedProxyStored = storedProxyValue.trim();
  const normalizedProxyInput = proxyInput.trim();
  const proxyDirty = normalizedProxyInput !== normalizedProxyStored;
  const canClearProxy = normalizedProxyStored.length > 0 || normalizedProxyInput.length > 0;

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (typeof onSaveToken === 'function') {
      await onSaveToken(tokenInput);
      setTokenInput('');
    }
  };

  const handleProxySubmit = async (event) => {
    event.preventDefault();

    if (typeof onSaveProxy === 'function' && proxyDirty) {
      await onSaveProxy(proxyInput);
    }
  };

  const handleProxyClear = async () => {
    setProxyInput('');

    if (typeof onSaveProxy === 'function') {
      await onSaveProxy('');
    }
  };

  const handleCopy = async () => {
    if (!botStatus?.deeplinkBase) {
      return;
    }

    const deeplinkTemplate = `${botStatus.deeplinkBase}?start=project=PRJ_ID`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(deeplinkTemplate);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Clipboard copy failed', error);
    }
  };

  const statusKey =
    botStatus?.status || (botStatus?.running ? 'running' : botStatus?.lastError ? 'error' : 'stopped');
  const statusLabels = {
    running: t('settings.telegram.statusRunning', undefined, 'Running'),
    starting: t('settings.telegram.statusStarting', undefined, 'Starting...'),
    stopped: t('settings.telegram.statusStopped', undefined, 'Stopped'),
    error: t('settings.telegram.statusErrorShort', undefined, 'Error'),
    unknown: t('settings.telegram.statusUnknown', undefined, 'Unknown')
  };
  const normalizedStatusKey = statusLabels[statusKey] ? statusKey : 'unknown';
  const statusLabel = statusLabels[normalizedStatusKey];
  const usernameSuffix = botStatus?.username ? ` (@${botStatus.username})` : '';
  const statusErrorMessage = botStatus?.lastError
    ? t(botStatus.lastError, undefined, botStatus.lastError)
    : null;
  const statusLine =
    normalizedStatusKey === 'error' && botStatus?.lastError
      ? t(
          'settings.telegram.statusErrorLabel',
          {
            status: `${statusLabel}${usernameSuffix}`,
            message: statusErrorMessage || botStatus.lastError
          },
          'Status: {status}. Error: {message}'
        )
      : t(
          'settings.telegram.statusLabel',
          { status: `${statusLabel}${usernameSuffix}` },
          'Status: {status}'
        );
  const isRunning = Boolean(botStatus?.running);
  const isStarting = botStatus?.status === 'starting';
  const hasTokenStored = Boolean(botStatus?.tokenStored);
  const deeplinkTemplate = botStatus?.deeplinkBase ? `${botStatus.deeplinkBase}?start=project=PRJ_ID` : null;
  const startedAtText = botStatus?.startedAt
    ? t('settings.telegram.startedAt', { date: new Date(botStatus.startedAt).toLocaleString(locale) })
    : null;
  const lastActivityText = botStatus?.lastActivityAt
    ? t('settings.telegram.lastActivity', { date: new Date(botStatus.lastActivityAt).toLocaleString(locale) })
    : null;
  const hasLogEntries = Array.isArray(botLogEntries) && botLogEntries.length > 0;
  const logText = hasLogEntries
    ? botLogEntries
        .map((entry) => {
          if (!entry) {
            return '';
          }

          if (typeof entry === 'string') {
            return entry;
          }

          const timestamp = entry.ts || entry.timestamp || entry.time || null;
          const level = (entry.level || entry.lvl || 'info').toUpperCase();
          const event = entry.event || entry.message || entry.msg || '';
          const data = entry.data ?? entry.payload ?? entry.details;
          let dataText = '';

          if (data !== undefined) {
            if (typeof data === 'string') {
              dataText = data;
            } else {
              try {
                dataText = JSON.stringify(data);
              } catch (serializationError) {
                dataText = '[unserializable]';
              }
            }
          }

          return [timestamp ? `[${timestamp}]` : null, level, event, dataText]
            .filter(Boolean)
            .join(' ');
        })
        .join('\n')
    : '';
  const logButtonLabel = botLogLoading
    ? t('settings.telegram.loadingLog', undefined, 'Loading log...')
    : t('settings.telegram.showLog', undefined, 'Show last 20 log lines');
  const handleTailLogClick = async () => {
    if (typeof onTailLog === 'function') {
      await onTailLog();
    }
  };

  return (
    <div className="page-grid two-columns">
      <InfoCard title={t('settings.language.title')} subtitle={t('settings.language.subtitle')}>
        <label className="language-select">
          {t('settings.language.label')}
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="ru">{t('settings.language.ru')}</option>
            <option value="en">{t('settings.language.en')}</option>
          </select>
        </label>
      </InfoCard>

      <InfoCard title={t('settings.theme.title')} subtitle={t('settings.theme.subtitle')}>
        <div className="theme-options" role="radiogroup" aria-label={t('settings.theme.label')}>
          <label className={`theme-option ${theme === 'light' ? 'active' : ''}`}>
            <input
              type="radio"
              name="settings-theme"
              value="light"
              checked={theme === 'light'}
              onChange={() => onThemeChange?.('light')}
            />
            <span>{t('app.theme.light')}</span>
          </label>
          <label className={`theme-option ${theme === 'dark' ? 'active' : ''}`}>
            <input
              type="radio"
              name="settings-theme"
              value="dark"
              checked={theme === 'dark'}
              onChange={() => onThemeChange?.('dark')}
            />
            <span>{t('app.theme.dark')}</span>
          </label>
        </div>
      </InfoCard>

      <InfoCard
        title={t('settings.system.title')}
        subtitle={t('settings.system.subtitle')}
        footer={
          <button type="button" className="secondary-button" onClick={onRefresh}>
            {t('settings.system.refresh')}
          </button>
        }
      >
        <ul className="env-info">
          {envInfo.map((item) => (
            <li key={item.label}>
              <strong>{item.label}:</strong> {item.value || 'вЂ”'}
            </li>
          ))}
        </ul>
        <p className="env-info__status">
          IPC API:{' '}
          {apiAvailable ? (
            <span className="status-label ok">{t('settings.system.ipcAvailable')}</span>
          ) : (
            <span className="status-label warn">{t('settings.system.ipcUnavailable')}</span>
          )}
        </p>
        <p className="hint" dangerouslySetInnerHTML={{ __html: t('settings.system.hint') }} />
      </InfoCard>

      <InfoCard title={t('settings.providers.title')} subtitle={t('settings.providers.subtitle')}>
        {providerStatus.length === 0 ? (
          <EmptyState title={t('settings.providers.emptyTitle')} description={t('settings.providers.emptyDescription')} />
        ) : (
          <table className="provider-table">
            <thead>
              <tr>
                <th>{t('settings.providers.id')}</th>
                <th>{t('settings.providers.type')}</th>
                <th>{t('settings.providers.models')}</th>
                <th>{t('settings.providers.key')}</th>
              </tr>
            </thead>
            <tbody>
              {providerStatus.map((provider) => (
                <tr key={provider.id}>
                  <td>{provider.id}</td>
                  <td>{provider.type}</td>
                  <td>{provider.models?.join(', ') || t('common.notAvailable')}</td>
                  <td>
                    {provider.hasKey ? (
                      <span className="status-label ok">{t('settings.providers.keyPresent')}</span>
                    ) : provider.apiKeyRef ? (
                      <span className="status-label warn">{t('settings.providers.keyMissing', { ref: provider.apiKeyRef })}</span>
                    ) : (
                      <span className="status-label info">{t('settings.providers.keyNotRequired')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </InfoCard>

      <InfoCard
        title={t('settings.telegram.title')}
        subtitle={t('settings.telegram.subtitle')}
        footer={
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onRefreshBot} disabled={botBusy}>
              {t('settings.telegram.refresh')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleCopy}
              disabled={!deeplinkTemplate}
            >
              {copied ? t('settings.telegram.copied') : t('settings.telegram.copy')}
            </button>
          </div>
        }
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('settings.telegram.tokenLabel')}
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={t('settings.telegram.tokenPlaceholder')}
            />
          </label>
          <div className="button-row">
            <button type="submit" className="primary-button" disabled={botBusy}>
              {t('settings.telegram.save')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onRefreshBot}
              disabled={botBusy}
            >
              {t('settings.telegram.refresh')}
            </button>
          </div>
        </form>
        <p className="hint">{t('settings.telegram.clearHint')}</p>
        <p className="hint">{t('settings.telegram.controlsHint')}</p>
        <p className="hint" dangerouslySetInnerHTML={{ __html: t('settings.telegram.flowHint') }} />
        <form className="form" onSubmit={handleProxySubmit}>
          <label>
            {t('settings.telegram.proxyLabel')}
            <input
              type="text"
              value={proxyInput}
              onChange={(event) => setProxyInput(event.target.value)}
              placeholder={t('settings.telegram.proxyPlaceholder')}
              autoComplete="off"
            />
          </label>
          <div className="button-row">
            <button type="submit" className="secondary-button" disabled={proxyBusy || !proxyDirty}>
              {t('settings.telegram.proxySave')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleProxyClear}
              disabled={proxyBusy || !canClearProxy}
            >
              {t('settings.telegram.proxyClear')}
            </button>
          </div>
        </form>
        <p className="hint">{t('settings.telegram.proxyHint')}</p>
        <p className={`hint ${normalizedStatusKey === 'error' ? 'warn' : ''}`}>{statusLine}</p>
        {startedAtText ? <p className="hint">{startedAtText}</p> : null}
        {lastActivityText ? <p className="hint">{lastActivityText}</p> : null}
        {deeplinkTemplate ? (
          <p
            className="hint"
            dangerouslySetInnerHTML={{ __html: t('settings.telegram.deeplink', { deeplink: deeplinkTemplate }) }}
          />
        ) : (
          <p className="hint">{t('settings.telegram.deeplinkHint')}</p>
        )}
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={handleTailLogClick}
            disabled={botLogLoading}
          >
            {logButtonLabel}
          </button>
        </div>
        {botLogLoading ? (
          <p className="hint">{t('settings.telegram.loadingLog', undefined, 'Loading log...')}</p>
        ) : hasLogEntries ? (
          <pre className="telegram-log-output" aria-live="polite">
            {logText}
          </pre>
        ) : (
          <p className="hint">
            {t('settings.telegram.logHint', undefined, 'Load the log to inspect recent bot events.')}
          </p>
        )}
      </InfoCard>
    </div>
  );
}

SettingsPage.propTypes = {
  providerStatus: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      models: PropTypes.arrayOf(PropTypes.string),
      hasKey: PropTypes.bool,
      apiKeyRef: PropTypes.string
    })
  ),
  apiAvailable: PropTypes.bool.isRequired,
  onRefresh: PropTypes.func.isRequired,
  botStatus: PropTypes.shape({
    running: PropTypes.bool,
    tokenStored: PropTypes.bool,
    username: PropTypes.string,
    deeplinkBase: PropTypes.string,
    startedAt: PropTypes.string,
    lastActivityAt: PropTypes.string,
    lastError: PropTypes.string,
    tokenSource: PropTypes.string
  }),
  onSaveToken: PropTypes.func.isRequired,
  onRefreshBot: PropTypes.func.isRequired,
  onTailLog: PropTypes.func,
  proxyValue: PropTypes.string,
  onSaveProxy: PropTypes.func,
  proxyBusy: PropTypes.bool,
  botLogEntries: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.object])),
  botLogLoading: PropTypes.bool,
  botBusy: PropTypes.bool,
  theme: PropTypes.oneOf(['light', 'dark']),
  onThemeChange: PropTypes.func
};



