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

export function SettingsPage({ providerStatus = [], apiAvailable, onRefresh }) {
  const envInfo = getEnvironmentInfo();

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
  onRefresh: PropTypes.func.isRequired
};
