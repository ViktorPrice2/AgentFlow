import { useEffect, useMemo, useState } from 'react';
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
  botStatus = null,
  onRefreshBot,
  onStartBot,
  onStopBot,
  onUpdateToken,
  onCopyDeeplink,
  selectedProject
}) {
  const envInfo = getEnvironmentInfo();
  const [tokenInput, setTokenInput] = useState('');

  const tokenPlaceholder = botStatus?.tokenStored ? 'Токен сохранён' : 'Вставьте токен от @BotFather';
  const botRunning = Boolean(botStatus?.running);
  const restarts = botStatus?.restarts ?? 0;
  const lastError = botStatus?.lastError || '—';
  const startedAt = botStatus?.startedAt ? new Date(botStatus.startedAt).toLocaleString('ru-RU') : '—';

  const deeplinkPreview = useMemo(() => {
    if (!botStatus?.deeplinkBase || !selectedProject?.id) {
      return '—';
    }

    return `${botStatus.deeplinkBase}${selectedProject.id}`;
  }, [botStatus?.deeplinkBase, selectedProject]);

  useEffect(() => {
    if (!botStatus?.tokenStored) {
      setTokenInput('');
    }
  }, [botStatus?.tokenStored]);

  const handleTokenSubmit = async (event) => {
    event.preventDefault();

    if (!tokenInput.trim()) {
      return;
    }

    await onUpdateToken(tokenInput.trim());
    setTokenInput('');
  };

  const handleTokenClear = async () => {
    setTokenInput('');
    await onUpdateToken('');
  };

  return (
    <div className="page-grid settings-grid">
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
          IPC API{' '}
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

      <InfoCard
        title="Telegram-бот"
        subtitle="Подключите токен, запустите long-polling и делитесь deeplink с командой."
        footer={
          <div className="telegram-actions">
            <button type="button" className="primary-button" onClick={onStartBot} disabled={botRunning}>
              Старт
            </button>
            <button type="button" className="secondary-button" onClick={onStopBot} disabled={!botRunning}>
              Стоп
            </button>
            <button type="button" className="secondary-button" onClick={onRefreshBot}>
              Обновить статус
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onCopyDeeplink}
              disabled={!botStatus?.deeplinkBase || !selectedProject?.id}
            >
              Скопировать deeplink
            </button>
          </div>
        }
      >
        <form className="telegram-form" onSubmit={handleTokenSubmit}>
          <label>
            Токен бота
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={tokenPlaceholder}
            />
          </label>
          <div className="telegram-actions">
            <button type="submit" className="primary-button" disabled={!tokenInput.trim()}>
              Сохранить токен
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleTokenClear}
              disabled={!botStatus?.tokenStored && tokenInput.length === 0}
            >
              Очистить токен
            </button>
          </div>
        </form>

        <ul className="telegram-status">
          <li>
            Состояние:{' '}
            <span className={`status-label ${botRunning ? 'ok' : 'warn'}`}>
              {botRunning ? 'работает' : 'остановлен'}
            </span>
          </li>
          <li>Юзернейм: {botStatus?.username ? `@${botStatus.username}` : '—'}</li>
          <li>Запущен: {startedAt}</li>
          <li>Перезапуски: {restarts}</li>
          <li>Последняя ошибка: {lastError}</li>
          <li>Deeplink: {botStatus?.deeplinkBase ? deeplinkPreview : 'недоступен'}</li>
        </ul>
        <p className="telegram-note">
          {botStatus?.deeplinkBase
            ? selectedProject
              ? `Выбран проект «${selectedProject.name}». Ссылка скопирует ${deeplinkPreview}.`
              : 'Выберите проект, чтобы сформировать deeplink.'
            : 'Укажите токен и запустите бота, чтобы получить deeplink.'}
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
    startedAt: PropTypes.string,
    username: PropTypes.string,
    restarts: PropTypes.number,
    lastError: PropTypes.string,
    tokenStored: PropTypes.bool,
    deeplinkBase: PropTypes.string
  }),
  onRefreshBot: PropTypes.func.isRequired,
  onStartBot: PropTypes.func.isRequired,
  onStopBot: PropTypes.func.isRequired,
  onUpdateToken: PropTypes.func.isRequired,
  onCopyDeeplink: PropTypes.func.isRequired,
  selectedProject: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string
  })
};
