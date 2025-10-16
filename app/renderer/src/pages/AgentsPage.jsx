import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

function AgentTable({ items = [], emptyMessage, onShowHistory }) {
  const { t } = useI18n();

  if (!items || items.length === 0) {
    return <EmptyState title={emptyMessage} description="" />;
  }

  const hasHistoryActions = typeof onShowHistory === 'function';

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>{t('agents.table.name')}</th>
            <th>{t('agents.table.type')}</th>
            <th>{t('agents.table.version')}</th>
            <th>{t('agents.table.source')}</th>
            <th>{t('agents.table.description')}</th>
            {hasHistoryActions ? <th>{t('agents.table.history')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((agent) => (
            <tr key={agent.id}>
              <td>{agent.name}</td>
              <td>{agent.type || t('common.notAvailable')}</td>
              <td>{agent.version || t('common.notAvailable')}</td>
              <td>{agent.source || 'plugin'}</td>
              <td>{agent.description || t('common.notAvailable')}</td>
              {hasHistoryActions ? (
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onShowHistory(agent)}
                    disabled={!agent?.id}
                  >
                    {t('agents.table.changes')}
                  </button>
                </td>
              ) : null}
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
  emptyMessage: PropTypes.string.isRequired,
  onShowHistory: PropTypes.func
};

AgentTable.defaultProps = {
  onShowHistory: undefined
};

export function AgentsPage({
  agentsData,
  providerStatus = [],
  onRefresh,
  lastUpdated = null,
  onShowHistory
}) {
  const { t } = useI18n();
  return (
    <div className="page-grid two-columns">
      <InfoCard
        title={t('agents.title')}
        subtitle={t('agents.subtitle')}
        footer={
          <button type="button" className="secondary-button" onClick={onRefresh}>
            {t('agents.refresh')}
          </button>
        }
      >
        <div className="provider-status-list">
          {providerStatus.length === 0 ? (
            <EmptyState
              title={t('agents.emptyTitle')}
              description={t('agents.emptyDescription')}
            />
          ) : (
            <ul>
              {providerStatus.map((provider) => (
                <li key={provider.id}>
                  <div>
                    <h4>{provider.id}</h4>
                    <span className={`status-dot ${provider.hasKey ? 'online' : 'offline'}`} />
                  </div>
                  <p>{t('agents.type')}: {provider.type}</p>
                  <p>
                    {t('agents.models')}: {provider.models?.join(', ') || t('common.notAvailable')}
                  </p>
                  <p>
                    {t('agents.apiKey')}: 
                    {provider.hasKey ? (
                      <span className="status-label ok">{t('agents.apiKeyPresent')}</span>
                    ) : provider.apiKeyRef ? (
                      <span className="status-label warn">{t('agents.apiKeyMissing', { ref: provider.apiKeyRef })}</span>
                    ) : (
                      <span className="status-label info">{t('agents.apiKeyNotRequired')}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        {lastUpdated ? (
          <p className="provider-updated">
            {t('agents.updatedAt')}: {lastUpdated}
          </p>
        ) : null}
      </InfoCard>

      <InfoCard
        title={t('agents.agentsTitle')}
        subtitle={t('agents.agentsSubtitle')}
      >
        <h4 className="table-title">{t('agents.plugins')}</h4>
        <AgentTable items={agentsData.plugins} emptyMessage={t('agents.pluginsEmpty')} />

        <h4 className="table-title">{t('agents.configs')}</h4>
        <AgentTable
          items={agentsData.configs}
          emptyMessage={t('agents.configsEmpty')}
          onShowHistory={onShowHistory}
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
  lastUpdated: PropTypes.string,
  onShowHistory: PropTypes.func
};

AgentsPage.defaultProps = {
  lastUpdated: null,
  onShowHistory: undefined
};
