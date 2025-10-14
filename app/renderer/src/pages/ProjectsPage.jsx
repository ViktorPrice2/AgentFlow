import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

function createProjectPayload(formState) {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `project-${Date.now()}`;

  return {
    id: formState.id || id,
    name: formState.name.trim(),
    industry: formState.industry.trim(),
    description: formState.description.trim(),
    deeplink: formState.deeplink.trim(),
    channels: formState.channels.trim(),
    updatedAt: new Date().toISOString()
  };
}

const INITIAL_FORM_STATE = {
  id: null,
  name: '',
  industry: '',
  description: '',
  deeplink: '',
  channels: ''
};

export function ProjectsPage({
  projects,
  selectedProjectId = null,
  onCreateProject,
  onSelectProject,
  onNotify
}) {
  const [formState, setFormState] = useState(INITIAL_FORM_STATE);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      onNotify('Укажите название проекта', 'error');
      return;
    }

    const payload = createProjectPayload(formState);
    onCreateProject(payload);
    onNotify('Проект сохранён', 'success');
    setFormState(INITIAL_FORM_STATE);
    onSelectProject(payload.id);
  };

  return (
    <div className="page-grid">
      <InfoCard
        title="Проекты"
        subtitle="Список активных инициатив. Выберите проект, чтобы продолжить настройку."
      >
        {projects.length === 0 ? (
          <EmptyState
            title="Проектов пока нет"
            description="Добавьте первый проект, чтобы сформировать бриф и пайплайны."
          />
        ) : (
          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={`project-list__item ${project.id === selectedProjectId ? 'active' : ''}`}
                  onClick={() => onSelectProject(project.id)}
                >
                  <div>
                    <h4>{project.name}</h4>
                    <p>{project.industry || 'Отрасль не указана'}</p>
                  </div>
                  <span>{new Date(project.updatedAt).toLocaleString('ru-RU')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </InfoCard>

      <InfoCard
        title="Добавить проект"
        subtitle="Заполните ключевые поля: описание, каналы, deeplink. Эти данные используют агенты."
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Название
            <input
              name="name"
              value={formState.name}
              onChange={handleInputChange}
              placeholder="Например, AgentFlow Launch"
            />
          </label>
          <label>
            Отрасль / ниша
            <input
              name="industry"
              value={formState.industry}
              onChange={handleInputChange}
              placeholder="SaaS, e-commerce, образование..."
            />
          </label>
          <label>
            Краткое описание
            <textarea
              name="description"
              value={formState.description}
              onChange={handleInputChange}
              rows={4}
              placeholder="Цели, продукт, особенности предложения"
            />
          </label>
          <label>
            Каналы
            <input
              name="channels"
              value={formState.channels}
              onChange={handleInputChange}
              placeholder="Telegram, VK, Email, Ads..."
            />
          </label>
          <label>
            Deeplink / URL
            <input
              name="deeplink"
              value={formState.deeplink}
              onChange={handleInputChange}
              placeholder="https://..."
            />
          </label>

          <button type="submit" className="primary-button">
            Сохранить
          </button>
        </form>
      </InfoCard>

      {selectedProject ? (
        <InfoCard
          title="Выбранный проект"
          subtitle="Эти данные используются при генерации контента и запуске пайплайнов."
        >
          <dl className="project-details">
            <div>
              <dt>Название</dt>
              <dd>{selectedProject.name}</dd>
            </div>
            <div>
              <dt>Отрасль</dt>
              <dd>{selectedProject.industry || '—'}</dd>
            </div>
            <div>
              <dt>Описание</dt>
              <dd>{selectedProject.description || '—'}</dd>
            </div>
            <div>
              <dt>Каналы</dt>
              <dd>{selectedProject.channels || '—'}</dd>
            </div>
            <div>
              <dt>Deeplink</dt>
              <dd>
                {selectedProject.deeplink ? (
                  <a href={selectedProject.deeplink} target="_blank" rel="noreferrer">
                    {selectedProject.deeplink}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        </InfoCard>
      ) : null}
    </div>
  );
}

ProjectsPage.propTypes = {
  projects: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      industry: PropTypes.string,
      description: PropTypes.string,
      deeplink: PropTypes.string,
      channels: PropTypes.string,
      updatedAt: PropTypes.string.isRequired
    })
  ).isRequired,
  selectedProjectId: PropTypes.string,
  onCreateProject: PropTypes.func.isRequired,
  onSelectProject: PropTypes.func.isRequired,
  onNotify: PropTypes.func.isRequired
};
