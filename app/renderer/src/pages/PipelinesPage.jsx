import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

const DEFAULT_NODES = [
  { id: 'writer', agentName: 'WriterAgent', kind: 'task' },
  { id: 'guard', agentName: 'StyleGuard', kind: 'guard' },
  { id: 'human', agentName: 'HumanGate', kind: 'humanGate' },
  { id: 'uploader', agentName: 'UploaderAgent', kind: 'task' }
];

const INITIAL_FORM_STATE = {
  id: '',
  name: '',
  description: '',
  override: ''
};

export function PipelinesPage({
  pipelines = [],
  project = null,
  brief = {},
  onSavePipeline,
  onDeletePipeline,
  onRunPipeline,
  onRefresh,
  isAgentOnline = true,
  onNotify,
  agentOptions = [],
  onShowHistory = undefined
}) {
  const { t } = useI18n();
  const [formState, setFormState] = useState(() => ({ ...INITIAL_FORM_STATE }));
  const [formNodes, setFormNodes] = useState(() =>
    DEFAULT_NODES.map((node) => ({ ...node }))
  );
  const [editingId, setEditingId] = useState(null);
  const safeAgentOptions = useMemo(
    () => (Array.isArray(agentOptions) ? agentOptions : []),
    [agentOptions]
  );
  const isEditing = Boolean(editingId);

  const runContext = useMemo(() => {
    if (!project) {
      return {};
    }
    return { project, brief };
  }, [project, brief]);

  const handleDragStart = (event, index) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event, targetIndex) => {
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData('text/plain'));

    if (Number.isNaN(fromIndex) || fromIndex === targetIndex) {
      return;
    }

    setFormNodes((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
  };

  const handleResetNodes = () => {
    setFormNodes(DEFAULT_NODES.map((node) => ({ ...node })));
  };

  const handleResetForm = () => {
    setFormState({ ...INITIAL_FORM_STATE });
    handleResetNodes();
    setEditingId(null);
  };

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

    const orderedNodes = formNodes.map((node, index) => ({
      ...node,
      id: node.id || `node-${index}`
    }));

    if (orderedNodes.length === 0) {
      onNotify(t('pipelines.toast.stepsRequired'), 'error');
      return;
    }

    if (orderedNodes.some((node) => !node.agentName)) {
      onNotify(t('pipelines.toast.agentMissing'), 'error');
      return;
    }

    const edges =
      orderedNodes.length > 1
        ? orderedNodes.slice(0, -1).map((node, index) => ({
            from: orderedNodes[index].id,
            to: orderedNodes[index + 1].id
          }))
        : [];

    const pipelineId =
      editingId ||
      (formState.id && formState.id.trim()) ||
      `${project?.id || 'pipeline'}-${Date.now()}`;

    const pipeline = {
      id: pipelineId,
      name: formState.name.trim(),
      description: formState.description.trim(),
      projectId: project?.id || null,
      nodes: orderedNodes,
      edges,
      override: overrideData
    };

    const success = await onSavePipeline(pipeline);

    if (success) {
      handleResetForm();
    }
  };

  const handleEditPipeline = (pipeline) => {
    if (!pipeline) {
      return;
    }

    setEditingId(pipeline.id || null);
    setFormState({
      id: pipeline.id || '',
      name: pipeline.name || '',
      description: pipeline.description || '',
      override: pipeline.override ? JSON.stringify(pipeline.override, null, 2) : ''
    });
    setFormNodes(
      Array.isArray(pipeline.nodes) && pipeline.nodes.length
        ? pipeline.nodes.map((node, index) => ({
            ...node,
            id: node.id || `${pipeline.id}-node-${index}`,
            agentName: node.agentName || node.id,
            kind: node.kind || 'task'
          }))
        : DEFAULT_NODES.map((node) => ({ ...node }))
    );
  };

  const handleDeletePipelineClick = async (pipeline) => {
    if (!pipeline?.id) {
      return;
    }

    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(t('pipelines.list.confirmDelete', { name: pipeline.name || pipeline.id }));

    if (!confirmed) {
      return;
    }

    const success = await onDeletePipeline(pipeline.id);

    if (success) {
      if (editingId === pipeline.id) {
        handleResetForm();
      }
    }
  };

  const handleNodeAgentChange = (index, agentId) => {
    setFormNodes((prev) => {
      const updated = [...prev];
      const nextId = agentId || `node-${index}`;

      updated[index] = {
        ...updated[index],
        agentName: agentId,
        id: updated[index]?.id || nextId
      };

      return updated;
    });
  };

  const handleNodeKindChange = (index, kind) => {
    setFormNodes((prev) => {
      const updated = [...prev];

      updated[index] = {
        ...updated[index],
        kind
      };

      return updated;
    });
  };

  const handleAddNode = () => {
    const fallbackAgent = safeAgentOptions[0]?.id || 'WriterAgent';

    setFormNodes((prev) => [
      ...prev,
      {
        id: `step-${Date.now()}-${prev.length + 1}`,
        agentName: fallbackAgent,
        kind: 'task'
      }
    ]);
  };

  const handleRemoveNode = (index) => {
    setFormNodes((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
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
            {pipelines.map((pipeline) => {
              const nodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];
              const flowString = nodes.map((node) => node.agentName || node.id).join(' -> ');

              return (
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
                  <p className="pipeline-flow-summary">
                    <strong>{t('pipelines.list.flow')}</strong>{' '}
                    {flowString || t('pipelines.list.noNodes')}
                  </p>
                  <ul className="pipeline-flow">
                    {nodes.map((node) => (
                      <li key={node.id}>
                        <span>{node.agentName}</span>
                        <small>{t(`pipelines.form.kind.${node.kind}`, undefined, node.kind)}</small>
                      </li>
                    ))}
                  </ul>
                  <footer className="pipeline-card__footer">
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
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleEditPipeline(pipeline)}
                    >
                      {t('pipelines.list.edit')}
                    </button>
                    <button
                      type="button"
                      className="link-button warning"
                      onClick={() => handleDeletePipelineClick(pipeline)}
                    >
                      {t('pipelines.list.delete')}
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </InfoCard>

      <InfoCard
        title={t('pipelines.form.title')}
        subtitle={t('pipelines.form.subtitle')}
      >
        {isEditing ? (
          <div className="form-banner">
            <span>{t('pipelines.form.editing', { name: formState.name || editingId })}</span>
            <button type="button" className="link-button" onClick={handleResetForm}>
              {t('common.cancel')}
            </button>
          </div>
        ) : null}
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('pipelines.form.identifier')}
            <input
              name="id"
              value={formState.id}
              onChange={handleChange}
              placeholder={t('pipelines.form.idPlaceholder')}
              disabled={isEditing}
            />
          </label>
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
                    <div className="pipeline-steps">
            <div className="pipeline-steps__header">
              <span className="pipeline-steps__label">{t('pipelines.form.steps')}</span>
              <div className="pipeline-steps__controls">
                <button type="button" className="link-button" onClick={handleAddNode}>
                  {t('pipelines.form.addStep')}
                </button>
                <button type="button" className="link-button" onClick={handleResetNodes}>
                  {t('pipelines.form.stepsReset')}
                </button>
              </div>
            </div>
            <p className="hint">{t('pipelines.form.stepsHint')}</p>
            <ul className="pipeline-steps__list">
              {formNodes.map((node, index) => {
                const selectedAgent = node.agentName || '';
                const hasExistingOption = safeAgentOptions.some((option) => option.id === selectedAgent);
                const agentChoices = hasExistingOption
                  ? safeAgentOptions
                  : selectedAgent
                    ? [{ id: selectedAgent, label: selectedAgent }, ...safeAgentOptions]
                    : safeAgentOptions;

                return (
                  <li
                    key={node.id || `node-${index}`}
                    className="pipeline-steps__item"
                    draggable
                    onDragStart={(event) => handleDragStart(event, index)}
                    onDragOver={handleDragOver}
                    onDrop={(event) => handleDrop(event, index)}
                  >
                    <span className="pipeline-steps__handle" aria-hidden="true">
                      ::
                    </span>
                    <div className="pipeline-steps__meta">
                      <label>
                        {t('pipelines.form.stepAgent', { index: index + 1 })}
                        <select
                          value={selectedAgent}
                          onChange={(event) => handleNodeAgentChange(index, event.target.value)}
                        >
                          <option value="">{t('pipelines.form.agentPlaceholder')}</option>
                          {agentChoices.map((option) => (
                            <option key={`${option.id}-${index}`} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t('pipelines.form.stepKind')}
                        <select
                          value={node.kind || 'task'}
                          onChange={(event) => handleNodeKindChange(index, event.target.value)}
                        >
                          <option value="task">{t('pipelines.form.kind.task')}</option>
                          <option value="guard">{t('pipelines.form.kind.guard')}</option>
                          <option value="humanGate">{t('pipelines.form.kind.humanGate')}</option>
                          <option value="router">{t('pipelines.form.kind.router')}</option>
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="link-button warning"
                      onClick={() => handleRemoveNode(index)}
                      disabled={formNodes.length <= 1}
                    >
                      {t('pipelines.form.removeStep')}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
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
  onSavePipeline: PropTypes.func.isRequired,
  onDeletePipeline: PropTypes.func.isRequired,
  onRunPipeline: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  isAgentOnline: PropTypes.bool,
  onNotify: PropTypes.func.isRequired,
  agentOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      source: PropTypes.string
    })
  ),
  onShowHistory: PropTypes.func
};








