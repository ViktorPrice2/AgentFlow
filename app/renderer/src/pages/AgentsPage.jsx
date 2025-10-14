import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

function AgentTable({ items = [], emptyMessage }) {
  if (!items || items.length === 0) {
    return <EmptyState title={emptyMessage} description="" />;
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Название</th>
            <th>Тип</th>
            <th>Версия</th>
            <th>Источник</th>
            <th>Описание</th>
          </tr>
        </thead>
        <tbody>
          {items.map((agent) => (
            <tr key={agent.id}>
              <td>{agent.name}</td>
              <td>{agent.type || '—'}</td>
              <td>{agent.version || '—'}</td>
              <td>{agent.source || 'plugin'}</td>
              <td>{agent.description || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

AgentTable.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      type: PropTypes.string,
      version: PropTypes.string,
      source: PropTypes.string,
      description: PropTypes.string
    })
  ),
  emptyMessage: PropTypes.string.isRequired
};

export function AgentsPage({
  agentsData,
  providerStatus = [],
  onRefresh,
  lastUpdated = null
}) {
  return (
    <div className="page-grid two-columns">
      <InfoCard
        title="Поставщики контента"
        subtitle="Статусы подключения LLM, Image и Video движков. При отсутствии ключей используется mock-режим."
        footer={
          <button type="button" className="secondary-button" onClick={onRefresh}>
            Обновить статусы
          </button>
        }
      >
        <div className="provider-status-list">
          {providerStatus.length === 0 ? (
            <EmptyState
              title="Нет данных о провайдерах"
              description="Проверьте файл config/providers.json и повторите попытку."
            />
          ) : (
            <ul>
              {providerStatus.map((provider) => (
                <li key={provider.id}>
                  <div>
                    <h4>{provider.id}</h4>
                    <span className={`status-dot ${provider.hasKey ? 'online' : 'offline'}`} />
                  </div>
                  <p>Тип: {provider.type}</p>
                  <p>Модели: {provider.models?.join(', ') || '—'}</p>
                  <p>
                    API ключ:{' '}
                    {provider.hasKey ? (
                      <span className="status-label ok">указан</span>
                    ) : provider.apiKeyRef ? (
                      <span className="status-label warn">нет ({provider.apiKeyRef})</span>
                    ) : (
                      <span className="status-label info">не требуется</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        {lastUpdated ? <p className="provider-updated">Обновлено: {lastUpdated}</p> : null}
      </InfoCard>

      <InfoCard
        title="Агенты"
        subtitle="Плагины и пользовательские конфигурации. Управление конфигами добавим в следующих релизах."
      >
        <h4 className="table-title">Загруженные плагины</h4>
        <AgentTable items={agentsData.plugins} emptyMessage="Плагины не найдены" />

        <h4 className="table-title">Конфигурации проекта</h4>
        <AgentTable
          items={agentsData.configs}
          emptyMessage="Конфигурации агентов ещё не созданы"
        />
      </InfoCard>
    </div>
  );
}

AgentsPage.propTypes = {
  agentsData: PropTypes.shape({
    plugins: PropTypes.array,
    configs: PropTypes.array
  }).isRequired,
  providerStatus: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      hasKey: PropTypes.bool,
      apiKeyRef: PropTypes.string,
      models: PropTypes.arrayOf(PropTypes.string)
    })
  ),
  onRefresh: PropTypes.func.isRequired,
  lastUpdated: PropTypes.string
};
