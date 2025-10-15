import { useState } from 'react';
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
  telegramStatus,
  onTelegramTokenSave,
  onTelegramStart,
  onTelegramStop,
  onCopyDeeplink,
  selectedProjectId
}) {
  const envInfo = getEnvironmentInfo();
  const [tokenDraft, setTokenDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const botState = telegramStatus?.status?.status || 'idle';
  const botRunning = botState === 'running';
  const hasToken = Boolean(telegramStatus?.hasToken);
  const botUsername = telegramStatus?.status?.username || '—';
  const sessions = telegramStatus?.status?.sessions ?? 0;
  const lastError = telegramStatus?.status?.lastError || null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      await onTelegramTokenSave(tokenDraft.trim());
      setTokenDraft('');
    } finally {
      setSaving(false);
    }
  };

  const handleClearToken = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      await onTelegramTokenSave('');
    } finally {
      setSaving(false);
    }
  };

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

      <InfoCard
        title="Telegram-бот"
        subtitle="Управляйте встроенным ботом для сбора брифов и рассылайте ссылку команде."
      >
        <form className="telegram-card__form" onSubmit={handleSubmit}>
          <div className="telegram-card__form-row">
            <label className="telegram-card__token">
              Токен бота
              <input
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder="Введите токен BotFather"
              />
            </label>
            <div className="telegram-card__buttons">
              <button type="submit" className="primary-button" disabled={saving || !tokenDraft.trim()}>
                Сохранить токен
              </button>
              <button type="button" className="secondary-button" onClick={handleClearToken} disabled={saving || !hasToken}>
                Очистить
              </button>
            </div>
          </div>
        </form>

        <div className="telegram-card__status">
          <p>
            Статус бота:{' '}
            <span className={`status-label ${botRunning ? 'ok' : 'warn'}`}>
              {botRunning ? 'запущен' : 'остановлен'}
            </span>
          </p>
          <p>
            Имя в Telegram: <strong>{botUsername}</strong>
          </p>
          <p>
            Активных сессий: <strong>{sessions}</strong>
          </p>
          <p>
            Токен сохранён: {hasToken ? <span className="status-label ok">да</span> : <span className="status-label warn">нет</span>}
          </p>
          {lastError && <p className="status-label warn">Ошибка: {lastError}</p>}
          {telegramStatus?.status?.restartPlanned && (
            <p className="status-label info">Запланирован автоматический перезапуск</p>
          )}
        </div>

        <div className="telegram-card__actions">
          <button type="button" className="primary-button" onClick={onTelegramStart} disabled={!hasToken || botRunning}>
            Запустить бота
          </button>
          <button type="button" className="secondary-button" onClick={onTelegramStop} disabled={!botRunning}>
            Остановить
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onCopyDeeplink}
            disabled={!botRunning || !hasToken || !selectedProjectId || !telegramStatus?.status?.username}
          >
            Скопировать deeplink
          </button>
        </div>

        <p className="hint">
          Deeplink формируется для выбранного проекта: <code>{selectedProjectId || '—'}</code>.
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
  telegramStatus: PropTypes.shape({
    hasToken: PropTypes.bool,
    status: PropTypes.shape({
      status: PropTypes.string,
      startedAt: PropTypes.string,
      username: PropTypes.string,
      lastError: PropTypes.string,
      sessions: PropTypes.number,
      restartPlanned: PropTypes.bool
    })
  }),
  onTelegramTokenSave: PropTypes.func.isRequired,
  onTelegramStart: PropTypes.func.isRequired,
  onTelegramStop: PropTypes.func.isRequired,
  onCopyDeeplink: PropTypes.func.isRequired,
  selectedProjectId: PropTypes.string
};
