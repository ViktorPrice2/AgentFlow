import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { VersionDiffModal } from '../components/VersionDiffModal.jsx';
import { diffEntity } from '../api/agentApi.js';
import { resolveNextVersion } from '../../shared/semver.js';

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

function toPipelineId(name, projectId) {
  const normalizedName = (name || 'pipeline')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/(^-|-$)/g, '') || 'pipeline';

  if (!projectId) {
    return normalizedName;
  }

  return `${projectId}-${normalizedName}`;
}

export function PipelinesPage({
  pipelines = [],
  project = null,
  brief = {},
  onCreatePipeline,
  onRunPipeline,
  onRefresh,
  isAgentOnline = true,
  onNotify
}) {
  const [formState, setFormState] = useState(INITIAL_FORM_STATE);
  const [pendingPipeline, setPendingPipeline] = useState(null);
  const [diffPreview, setDiffPreview] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      onNotify('Имя пайплайна обязательно', 'error');
      return;
    }

    let overrideData = null;

    if (formState.override.trim()) {
      try {
        overrideData = JSON.parse(formState.override);
      } catch (error) {
        onNotify('Некорректный JSON в поле Override', 'error');
        return;
      }
    }

    const pipelineId = toPipelineId(formState.name.trim(), project?.id || null);
    const existing = pipelines.find((item) => item.id === pipelineId) || null;
    const nextVersion = resolveNextVersion(null, existing?.version);

    const pipeline = {
      id: pipelineId,
      name: formState.name.trim(),
      description: formState.description.trim(),
      projectId: project?.id || null,
      version: nextVersion,
      nodes: DEFAULT_NODES.map((node) => ({ ...node })),
      edges: DEFAULT_EDGES.map((edge) => ({ ...edge })),
      override: overrideData
    };

    setIsDiffLoading(true);

    try {
      const diff = await diffEntity({
        type: 'pipeline',
        idA: existing ? { entityId: existing.id, draft: existing } : null,
        idB: { draft: pipeline }
      });

      setPendingPipeline(pipeline);
      setDiffPreview({
        diff: diff.diff,
        currentVersion: existing?.version || '—',
        nextVersion
      });
      setModalVisible(true);
    } catch (error) {
      console.error('Failed to compute pipeline diff', error);
      onNotify('Не удалось подготовить сравнение версий', 'error');
    } finally {
      setIsDiffLoading(false);
    }
  };

  const handleRun = (pipeline) => {
    onRunPipeline(pipeline, runContext);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setPendingPipeline(null);
    setDiffPreview(null);
  };

  const handleConfirmSave = async () => {
    if (!pendingPipeline) {
      return;
    }

    setIsSaving(true);

    try {
      await onCreatePipeline(pendingPipeline);
      handleModalClose();
      setFormState(INITIAL_FORM_STATE);
    } catch (error) {
      console.error('Failed to persist pipeline version', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-grid">
      <InfoCard
        title="Пайплайны"
        subtitle="Линейные сценарии: Writer → StyleGuard → HumanGate → Uploader. Позже добавим визуальный редактор."
        footer={
          <button type="button" className="secondary-button" onClick={onRefresh}>
            Обновить список
          </button>
        }
      >
        {pipelines.length === 0 ? (
          <EmptyState
            title="Пайплайны ещё не созданы"
            description="Используйте форму справа, чтобы сохранить первый сценарий."
          />
        ) : (
          <div className="pipeline-list">
            {pipelines.map((pipeline) => (
              <article key={pipeline.id} className="pipeline-card">
                <header>
                  <h4>{pipeline.name}</h4>
                  <div className="pipeline-meta">
                    <span>{pipeline.projectId ? `Проект: ${pipeline.projectId}` : 'Без проекта'}</span>
                    <span className="pipeline-version">v{pipeline.version || '0.0.1'}</span>
                  </div>
                </header>
                <p>{pipeline.description || 'Описание не указано'}</p>
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
                    Запустить
                  </button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard
        title="Создать пайплайн"
        subtitle="Задайте название, описание и при необходимости JSON-override для шагов."
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Название
            <input
              name="name"
              value={formState.name}
              onChange={handleChange}
              placeholder="Лонгрид + посты"
            />
          </label>
          <label>
            Описание
            <textarea
              name="description"
              rows={3}
              value={formState.description}
              onChange={handleChange}
              placeholder="Кратко опишите, что делает сценарий"
            />
          </label>
          <label>
            Override (JSON)
            <textarea
              name="override"
              rows={6}
              value={formState.override}
              onChange={handleChange}
              placeholder='{"writer":{"params":{"tone":"friendly"}}}'
            />
          </label>
          <button type="submit" className="primary-button" disabled={!project || isDiffLoading}>
            Сохранить пайплайн
          </button>
          {!project ? <p className="hint">Выберите проект, чтобы привязать сценарий.</p> : null}
          {isDiffLoading ? <p className="hint">Готовим сравнение изменений…</p> : null}
        </form>
      </InfoCard>

      <VersionDiffModal
        open={modalVisible}
        entityName={pendingPipeline?.name || formState.name || 'Пайплайн'}
        currentVersion={diffPreview?.currentVersion || '—'}
        nextVersion={diffPreview?.nextVersion || '0.1.0'}
        diff={diffPreview?.diff}
        onConfirm={handleConfirmSave}
        onCancel={handleModalClose}
        saving={isSaving}
      />
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
  onNotify: PropTypes.func.isRequired
};
