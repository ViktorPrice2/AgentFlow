import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

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

  const statusText = botStatus?.running ? 'бот активен' : 'бот остановлен';
  const deeplinkTemplate = botStatus?.deeplinkBase ? `${botStatus.deeplinkBase}?start=project=PRJ_ID` : null;

  return (
    <div className="page-grid two-columns">
      <InfoCard
        title="Системные параметры"
        subtitle="Информация об окружении AgentFlow Desktop."
        footer={
          <button type="button" className="secondary-button" onClick={onRefresh}>
            Проверить провайдеры
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
            <span className="status-label ok">доступен</span>
          ) : (
            <span className="status-label warn">нет</span>
          )}
        </p>
        <p className="hint">
          Файл окружения: <code>.env</code>. Конфигурация провайдеров: <code>config/providers.json</code>.
        </p>
      </InfoCard>

      <InfoCard title="Провайдеры" subtitle="Текущее состояние подключения к внешним сервисам.">
        {providerStatus.length === 0 ? (
          <EmptyState
            title="Нет данных о провайдерах"
            description="Убедитесь, что файл config/providers.json присутствует, и обновите статусы."
          />
        ) : (
          <table className="provider-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Тип</th>
                <th>Модели</th>
                <th>Ключ</th>
              </tr>
            </thead>
            <tbody>
              {providerStatus.map((provider) => (
                <tr key={provider.id}>
                  <td>{provider.id}</td>
                  <td>{provider.type}</td>
                  <td>{provider.models?.join(', ') || '—'}</td>
                  <td>
                    {provider.hasKey ? (
                      <span className="status-label ok">указан</span>
                    ) : provider.apiKeyRef ? (
                      <span className="status-label warn">{provider.apiKeyRef}</span>
                    ) : (
                      <span className="status-label info">не требуется</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </InfoCard>

      <InfoCard
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
              {copied ? 'Скопировано' : 'Скопировать deeplink'}
            </button>
          </div>
        }
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Токен Telegram Bot API
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Введите значение вида 1234567890:ABC..."
            />
          </label>
          <div className="button-row">
            <button type="submit" className="primary-button" disabled={botBusy}>
              Сохранить токен
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onStartBot}
              disabled={botBusy || !botStatus?.tokenStored}
            >
              Старт бота
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onStopBot}
              disabled={botBusy || !botStatus?.running}
            >
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
