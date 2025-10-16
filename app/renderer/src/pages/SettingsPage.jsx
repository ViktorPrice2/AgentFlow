import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.js';

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
  onStartBot,
  onStopBot,
  onRefreshBot,
  botBusy = false
}) {
  const { t, language, setLanguage } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
  const envInfo = getEnvironmentInfo();
  const [tokenInput, setTokenInput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTokenInput('');
  }, [botStatus?.tokenStored]);

  useEffect(() => {
    setCopied(false);
  }, [botStatus?.deeplinkBase]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (typeof onSaveToken === 'function') {
      await onSaveToken(tokenInput);
      setTokenInput('');
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

  const statusValue = botStatus?.running ? t('settings.telegram.statusRunning') : t('settings.telegram.statusStopped');
  const statusMarkup = t('settings.telegram.status', {
    status: statusValue,
    username: botStatus?.username ? ` (@${botStatus.username})` : ''
  });
  const deeplinkTemplate = botStatus?.deeplinkBase ? `${botStatus.deeplinkBase}?start=project=PRJ_ID` : null;
  const startedAtText = botStatus?.startedAt
    ? t('settings.telegram.startedAt', { date: new Date(botStatus.startedAt).toLocaleString(locale) })
    : null;
  const lastActivityText = botStatus?.lastActivityAt
    ? t('settings.telegram.lastActivity', { date: new Date(botStatus.lastActivityAt).toLocaleString(locale) })
    : null;
  const errorText = botStatus?.lastError
    ? t('settings.telegram.error', { message: botStatus.lastError })
    : null;
  const statusText = botStatus?.running ? 'бот активен' : 'бот остановлен';
  const deeplinkTemplate = botStatus?.deeplinkBase ? `${botStatus.deeplinkBase}?start=project=PRJ_ID` : null;

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
              <strong>{item.label}:</strong> {item.value || '—'}
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
        title="Telegram-бот"
        subtitle="Укажите токен бота и управляйте запуском встроенного опросника."
        footer={
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onRefreshBot} disabled={botBusy}>
              Обновить статус
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleCopy}
              disabled={!deeplinkTemplate}
            >
              {copied ? t('settings.telegram.copied') : t('settings.telegram.copy')}
              {copied ? 'Скопировано' : 'Скопировать deeplink'}
            </button>
          </div>
        }
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('settings.telegram.tokenLabel')}
            Токен Telegram Bot API
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={t('settings.telegram.tokenPlaceholder')}
              placeholder="Введите значение вида 1234567890:ABC..."
            />
          </label>
          <div className="button-row">
            <button type="submit" className="primary-button" disabled={botBusy}>
              {t('settings.telegram.save')}
              Сохранить токен
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onStartBot}
              disabled={botBusy || !botStatus?.tokenStored}
            >
              {t('settings.telegram.start')}
              Старт бота
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onStopBot}
              disabled={botBusy || !botStatus?.running}
            >
              {t('settings.telegram.stop')}
            </button>
          </div>
        </form>
        <p className="hint">{t('settings.telegram.clearHint')}</p>
        <p className="hint" dangerouslySetInnerHTML={{ __html: statusMarkup }} />
        {startedAtText ? <p className="hint">{startedAtText}</p> : null}
        {lastActivityText ? <p className="hint">{lastActivityText}</p> : null}
        {errorText ? <p className="hint warn">{errorText}</p> : null}
        {deeplinkTemplate ? (
          <p className="hint" dangerouslySetInnerHTML={{ __html: t('settings.telegram.deeplink', { deeplink: deeplinkTemplate }) }} />
        ) : (
          <p className="hint">{t('settings.telegram.deeplinkHint')}</p>
              Стоп бота
            </button>
          </div>
        </form>
        <p className="hint">Оставьте поле пустым и сохраните, чтобы удалить сохранённый токен.</p>
        <p className="hint">
          Статус: <strong>{statusText}</strong>
          {botStatus?.username ? ` (@${botStatus.username})` : ''}
        </p>
        {botStatus?.startedAt ? (
          <p className="hint">Запущен: {new Date(botStatus.startedAt).toLocaleString('ru-RU')}</p>
        ) : null}
        {botStatus?.lastActivityAt ? (
          <p className="hint">Последняя активность: {new Date(botStatus.lastActivityAt).toLocaleString('ru-RU')}</p>
        ) : null}
        {botStatus?.lastError ? <p className="hint warn">Ошибка: {botStatus.lastError}</p> : null}
        {deeplinkTemplate ? (
          <p className="hint">
            Шаблон deeplink: <code>{deeplinkTemplate}</code>
          </p>
        ) : (
          <p className="hint">После запуска бот покажет username, и deeplink станет доступен.</p>
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
    lastError: PropTypes.string
  }),
  onSaveToken: PropTypes.func.isRequired,
  onStartBot: PropTypes.func.isRequired,
  onStopBot: PropTypes.func.isRequired,
  onRefreshBot: PropTypes.func.isRequired,
  botBusy: PropTypes.bool
};
