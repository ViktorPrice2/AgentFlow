import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.js';

const DEFAULT_NODES = [
  { id: 'writer', agentName: 'WriterAgent', kind: 'task' },
  { id: 'guard', agentName: 'StyleGuard', kind: 'guard' },
  { id: 'human', agentName: 'HumanGate', kind: 'humanGate' },
  { id: 'uploader', agentName: 'UploaderAgent', kind: 'task' }
];

const DEFAULT_EDGES = [
  { from: 'writer', to: 'guard' },
  { from: 'guard', to: 'human' },
  { from: 'human', to: 'uploader' }
];

const INITIAL_FORM_STATE = {
  name: '',
  description: '',
  override: ''
};

export function PipelinesPage({
  pipelines = [],
  project = null,
  brief = {},
  onCreatePipeline,
  onRunPipeline,
  onRefresh,
  isAgentOnline = true,
  onNotify,
  onShowHistory
}) {
  const { t } = useI18n();
  const [formState, setFormState] = useState(INITIAL_FORM_STATE);

  const runContext = useMemo(() => {
    if (!project) {
      return {};
    }
    return { project, brief };
  }, [project, brief]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      onNotify(t('pipelines.toast.nameRequired'), 'error');
      return;
    }

    let overrideData = null;

    if (formState.override.trim()) {
      try {
        overrideData = JSON.parse(formState.override);
      } catch (error) {
        onNotify(t('pipelines.toast.overrideError'), 'error');
        return;
      }
    }

    const pipeline = {
      id: `${project?.id || 'pipeline'}-${Date.now()}`,
      name: formState.name.trim(),
      description: formState.description.trim(),
      projectId: project?.id || null,
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
      override: overrideData
    };

    onCreatePipeline(pipeline);
    onNotify(t('pipelines.toast.saved'), 'success');
    setFormState(INITIAL_FORM_STATE);
  };

  const handleRun = (pipeline) => {
    onRunPipeline(pipeline, runContext);
  };

  return (
    <div className="page-grid">
      <InfoCard
        title={t('pipelines.list.title')}
        subtitle={t('pipelines.list.subtitle')}
        footer={
          <button type="button" className="secondary-button" onClick={onRefresh}>
            {t('pipelines.list.refresh')}
          </button>
        }
      >
        {pipelines.length === 0 ? (
          <EmptyState
            title={t('pipelines.list.emptyTitle')}
            description={t('pipelines.list.emptyDescription')}
          />
        ) : (
          <div className="pipeline-list">
            {pipelines.map((pipeline) => (
              <article key={pipeline.id} className="pipeline-card">
                <header>
                  <div className="pipeline-header-info">
                    <h4>{pipeline.name}</h4>
                    <span>
                      {pipeline.projectId
                        ? t('pipelines.list.project', { project: pipeline.projectId })
                        : t('pipelines.list.noProject')}
                    </span>
                  </div>
                  {pipeline.version ? (
                    <span className="pipeline-version">v{pipeline.version}</span>
                  ) : null}
                </header>
                <p>{pipeline.description || t('pipelines.list.descriptionMissing')}</p>
                <ul className="pipeline-flow">
                  {pipeline.nodes.map((node) => (
                    <li key={node.id}>
                      <span>{node.agentName}</span>
                      <small>{node.kind}</small>
                    </li>
                  ))}
                </ul>
                <footer>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => handleRun(pipeline)}
                    disabled={!isAgentOnline}
                  >
                    {t('pipelines.list.run')}
                  </button>
                  {typeof onShowHistory === 'function' ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onShowHistory(pipeline)}
                    >
                      {t('pipelines.list.history')}
                    </button>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard
        title={t('pipelines.form.title')}
        subtitle={t('pipelines.form.subtitle')}
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('pipelines.form.name')}
            <input
              name="name"
              value={formState.name}
              onChange={handleChange}
              placeholder={t('pipelines.form.namePlaceholder')}
            />
          </label>
          <label>
            {t('pipelines.form.description')}
            <textarea
              name="description"
              rows={3}
              value={formState.description}
              onChange={handleChange}
              placeholder={t('pipelines.form.descriptionPlaceholder')}
            />
          </label>
          <label>
            {t('pipelines.form.override')}
            <textarea
              name="override"
              rows={6}
              value={formState.override}
              onChange={handleChange}
              placeholder={t('pipelines.form.overridePlaceholder')}
            />
          </label>
          <button type="submit" className="primary-button" disabled={!project}>
            {t('pipelines.form.submit')}
          </button>
          {!project ? <p className="hint">{t('pipelines.form.projectHint')}</p> : null}
        </form>
      </InfoCard>
    </div>
  );
}

PipelinesPage.propTypes = {
  pipelines: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      nodes: PropTypes.array.isRequired,
      edges: PropTypes.array.isRequired,
      projectId: PropTypes.string
    })
  ),
  project: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string
  }),
  brief: PropTypes.object,
  onCreatePipeline: PropTypes.func.isRequired,
  onRunPipeline: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  isAgentOnline: PropTypes.bool,
  onNotify: PropTypes.func.isRequired,
  onShowHistory: PropTypes.func
};

PipelinesPage.defaultProps = {
  pipelines: [],
  project: null,
  brief: {},
  isAgentOnline: true,
  onShowHistory: undefined
};
