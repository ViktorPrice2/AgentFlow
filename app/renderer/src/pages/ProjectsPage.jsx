import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

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
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
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
      onNotify(t('projects.toast.nameRequired'), 'error');
      return;
    }

    const payload = createProjectPayload(formState);
    onCreateProject(payload);
    onNotify(t('projects.toast.saved'), 'success');
    setFormState(INITIAL_FORM_STATE);
    onSelectProject(payload.id);
  };

  return (
    <div className="page-grid">
      <InfoCard
        title={t('projects.list.title')}
        subtitle={t('projects.list.subtitle')}
      >
        {projects.length === 0 ? (
          <EmptyState
            title={t('projects.list.emptyTitle')}
            description={t('projects.list.emptyDescription')}
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
                    <p>{project.industry || t('projects.list.industryMissing')}</p>
                  </div>
                  <span>{new Date(project.updatedAt).toLocaleString(locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </InfoCard>

      <InfoCard
        title={t('projects.form.title')}
        subtitle={t('projects.form.subtitle')}
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('projects.form.name')}
            <input
              name="name"
              value={formState.name}
              onChange={handleInputChange}
              placeholder={t('projects.form.namePlaceholder')}
            />
          </label>
          <label>
            {t('projects.form.industry')}
            <input
              name="industry"
              value={formState.industry}
              onChange={handleInputChange}
              placeholder={t('projects.form.industryPlaceholder')}
            />
          </label>
          <label>
            {t('projects.form.description')}
            <textarea
              name="description"
              value={formState.description}
              onChange={handleInputChange}
              rows={4}
              placeholder={t('projects.form.descriptionPlaceholder')}
            />
          </label>
          <label>
            {t('projects.form.channels')}
            <input
              name="channels"
              value={formState.channels}
              onChange={handleInputChange}
              placeholder={t('projects.form.channelsPlaceholder')}
            />
          </label>
          <label>
            {t('projects.form.deeplink')}
            <input
              name="deeplink"
              value={formState.deeplink}
              onChange={handleInputChange}
              placeholder={t('projects.form.deeplinkPlaceholder')}
            />
          </label>

          <button type="submit" className="primary-button">{t('common.saveProject')}</button>
        </form>
      </InfoCard>

      {selectedProject ? (
        <InfoCard
          title={t('projects.details.title')}
          subtitle={t('projects.details.subtitle')}
        >
          <dl className="project-details">
            <div>
              <dt>{t('projects.details.name')}</dt>
              <dd>{selectedProject.name}</dd>
            </div>
            <div>
              <dt>{t('projects.details.industry')}</dt>
              <dd>{selectedProject.industry || t('common.notAvailable')}</dd>
            </div>
            <div>
              <dt>{t('projects.details.description')}</dt>
              <dd>{selectedProject.description || t('common.notAvailable')}</dd>
            </div>
            <div>
              <dt>{t('projects.details.channels')}</dt>
              <dd>{selectedProject.channels || t('common.notAvailable')}</dd>
            </div>
            <div>
              <dt>{t('projects.details.deeplink')}</dt>
              <dd>
                {selectedProject.deeplink ? (
                  <a href={selectedProject.deeplink} target="_blank" rel="noreferrer">
                    {selectedProject.deeplink}
                  </a>
                ) : (
                  t('common.notAvailable')
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
