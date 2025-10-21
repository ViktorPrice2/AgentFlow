import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

const DEFAULT_AGENT_TEMPLATE = {
  id: 'NewAgent',
  name: 'NewAgent',
  type: 'custom',
  instructions: '',
  engine: {
    provider: 'mock',
    model: 'template'
  },
  params: {},
  templates: {}
};

const DEFAULT_AGENT_JSON = JSON.stringify(DEFAULT_AGENT_TEMPLATE, null, 2);

function AgentTable({
  items = [],
  emptyMessage,
  onShowHistory = undefined,
  onEdit = undefined,
  onDelete = undefined
}) {
  const { t } = useI18n();

  if (!items || items.length === 0) {
    return <EmptyState title={emptyMessage} description="" />;
  }

  const hasHistoryActions = typeof onShowHistory === 'function';
  const hasEditorActions = typeof onEdit === 'function' || typeof onDelete === 'function';

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>{t('agents.table.name')}</th>
            <th>{t('agents.table.type')}</th>
            <th>{t('agents.table.version')}</th>
            <th>{t('agents.table.source')}</th>
            <th>{t('agents.table.project')}</th>
            <th>{t('agents.table.description')}</th>
            <th>{t('agents.table.connections')}</th>
            {hasHistoryActions ? <th>{t('agents.table.history')}</th> : null}
            {hasEditorActions ? <th>{t('agents.table.actions')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((agent) => {
            const usage = Array.isArray(agent.usage) ? agent.usage : [];
            const visibleUsage = usage.slice(0, 3);
            const remaining = usage.length - visibleUsage.length;

            return (
              <tr key={agent.id}>
                <td>{agent.name}</td>
                <td>{agent.type || t('common.notAvailable')}</td>
                <td>{agent.version || t('common.notAvailable')}</td>
                <td>{agent.source || t('agents.table.pluginSource')}</td>
                <td>{agent.projectId || t('common.notAvailable')}</td>
                <td>{agent.description || t('common.notAvailable')}</td>
                <td>
                  {usage.length === 0 ? (
                    <span>{t('agents.table.noUsage')}</span>
                  ) : (
                    <div className="agent-usage">
                      <ul className="agent-usage__list">
                        {visibleUsage.map((entry) => {
                          const rawKind =
                            typeof entry.nodeKind === 'string' ? entry.nodeKind.trim() : '';
                          const tokens = rawKind.split(/[-_\s]+/).filter(Boolean);
                          const hasCamelCase = rawKind.slice(1).split('').some((char) => char >= 'A' && char <= 'Z');
                          let normalizedKind = '';

                          if (tokens.length > 1) {
                            normalizedKind = tokens
                              .map((token, index) => {
                                const lower = token.toLowerCase();
                                return index === 0
                                  ? lower
                                  : lower.charAt(0).toUpperCase() + lower.slice(1);
                              })
                              .join('');
                          } else if (rawKind) {
                            normalizedKind = hasCamelCase
                              ? rawKind.charAt(0).toLowerCase() + rawKind.slice(1)
                              : rawKind.toLowerCase();
                          }

                          const fallbackKindLabel = rawKind || t('common.notAvailable');
                          const kindLabel = normalizedKind
                            ? t(`pipelines.form.kind.${normalizedKind}`, undefined, fallbackKindLabel)
                            : fallbackKindLabel;

                          return (
                            <li key={`${entry.pipelineId}:${entry.nodeId}`}>
                              <strong>{entry.pipelineName || entry.pipelineId}</strong>
                              <small>{kindLabel}</small>
                            </li>
                          );
                        })}
                      </ul>
                      {remaining > 0 ? (
                        <span className="agent-usage__more">
                          {t('agents.table.morePipelines', { count: remaining })}
                        </span>
                      ) : null}
                    </div>
                  )}
                </td>
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
                {hasEditorActions ? (
                  <td className="agent-actions">
                    {typeof onEdit === 'function' ? (
                      <button type="button" className="link-button" onClick={() => onEdit(agent)}>
                        {t('common.edit')}
                      </button>
                    ) : null}
                    {typeof onDelete === 'function' ? (
                      <button
                        type="button"
                        className="link-button warning"
                        onClick={() => onDelete(agent)}
                      >
                        {t('common.delete')}
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
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
      description: PropTypes.string,
      projectId: PropTypes.string,
      usage: PropTypes.arrayOf(
        PropTypes.shape({
          pipelineId: PropTypes.string,
          pipelineName: PropTypes.string,
          nodeId: PropTypes.string,
          nodeKind: PropTypes.string,
          position: PropTypes.number
        })
      )
    })
  ),
  emptyMessage: PropTypes.string.isRequired,
  onShowHistory: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func
};

export function AgentsPage({
  agentsData,
  providerStatus = [],
  onRefresh,
  lastUpdated = null,
  onShowHistory = undefined,
  onSaveAgent,
  onDeleteAgent,
  onNotify = undefined
}) {
  const { t } = useI18n();
  const [editorJson, setEditorJson] = useState(DEFAULT_AGENT_JSON);
  const [editingAgent, setEditingAgent] = useState(null);
  const [formError, setFormError] = useState(null);

  const configuredAgents = useMemo(() => Array.isArray(agentsData?.configs) ? agentsData.configs : [], [agentsData]);
  const pluginAgents = useMemo(() => Array.isArray(agentsData?.plugins) ? agentsData.plugins : [], [agentsData]);

  const resetEditor = () => {
    setEditorJson(DEFAULT_AGENT_JSON);
    setEditingAgent(null);
    setFormError(null);
  };

  const handleFormChange = (event) => {
    setEditorJson(event.target.value);
  };

  const handleEditAgent = (agent) => {
    if (!agent) {
      return;
    }

    const payload = agent.payload || agent;
    setEditorJson(JSON.stringify(payload, null, 2));
    setEditingAgent(agent);
    setFormError(null);
  };

  const handleDeleteAgentClick = async (agent) => {
    if (!agent?.id) {
      return;
    }

    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(t('agents.form.confirmDelete', { name: agent.name || agent.id }));

    if (!confirmed) {
      return;
    }

    const success = await onDeleteAgent(agent.id);

    if (success && editingAgent?.id === agent.id) {
      resetEditor();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);

    try {
      const parsed = JSON.parse(editorJson);

      if (!parsed.id && editingAgent?.id) {
        parsed.id = editingAgent.id;
      }

      const success = await onSaveAgent(parsed);

      if (success) {
        resetEditor();
      }
    } catch (error) {
      setFormError(t('agents.form.jsonError', { message: error.message }));
    }
  };

  const handleReset = () => {
    resetEditor();
  };

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
                  <p>
                    {t('agents.type')}: {provider.type}
                  </p>
                  <p>
                    {t('agents.models')}:{' '}
                    {provider.models?.join(', ') || t('common.notAvailable')}
                  </p>
                  <p>
                    {t('agents.apiKey')}:{' '}
                    {provider.hasKey ? (
                      <span className="status-label ok">{t('agents.apiKeyPresent')}</span>
                    ) : provider.apiKeyRef ? (
                      <span className="status-label warn">
                        {t('agents.apiKeyMissing', { ref: provider.apiKeyRef })}
                      </span>
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
        <AgentTable items={pluginAgents} emptyMessage={t('agents.pluginsEmpty')} />

        <h4 className="table-title">{t('agents.configs')}</h4>
        <AgentTable
          items={configuredAgents}
          emptyMessage={t('agents.configsEmpty')}
          onShowHistory={onShowHistory}
          onEdit={handleEditAgent}
          onDelete={handleDeleteAgentClick}
        />

        <section className="agent-editor">
          <header className="agent-editor__header">
            <h4>
              {editingAgent
                ? t('agents.form.editTitle', { name: editingAgent.name || editingAgent.id })
                : t('agents.form.createTitle')}
            </h4>
            <button type="button" className="link-button" onClick={handleReset}>
              {t('agents.form.resetButton')}
            </button>
          </header>
          <p className="hint">{t('agents.form.hint')}</p>
          <form className="form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="agent-editor-json">{t('agents.form.jsonLabel')}</label>
              <textarea
                id="agent-editor-json"
                rows={14}
                value={editorJson}
                onChange={handleFormChange}
                spellCheck={false}
              />
            </div>
            {formError ? <p className="form-error">{formError}</p> : null}
            <div className="form-actions">
              <button type="submit" className="primary-button">
                {editingAgent ? t('common.update') : t('common.save')}
              </button>
              <button type="button" className="secondary-button" onClick={handleReset}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </section>
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
  onShowHistory: PropTypes.func,
  onSaveAgent: PropTypes.func.isRequired,
  onDeleteAgent: PropTypes.func.isRequired,
  onNotify: PropTypes.func
};



