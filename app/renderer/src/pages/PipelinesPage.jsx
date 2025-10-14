import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

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
  onNotify
}) {
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
    onNotify('Пайплайн сохранён', 'success');
    setFormState(INITIAL_FORM_STATE);
  };

  const handleRun = (pipeline) => {
    onRunPipeline(pipeline, runContext);
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
                  <span>{pipeline.projectId ? `Проект: ${pipeline.projectId}` : 'Без проекта'}</span>
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
          <button type="submit" className="primary-button" disabled={!project}>
            Сохранить пайплайн
          </button>
          {!project ? <p className="hint">Выберите проект, чтобы привязать сценарий.</p> : null}
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
  onNotify: PropTypes.func.isRequired
};
