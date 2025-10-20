import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

function createProjectPayload(formState) {
  const payload = {
    name: formState.name.trim(),
    industry: formState.industry.trim(),
    description: formState.description.trim(),
    deeplink: formState.deeplink.trim(),
    channels: formState.channels.trim()
  };

  if (formState.id) {
    payload.id = formState.id;
  }

  return payload;
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
  onNotify,
  botStatus = null,
  botBusy = false,
  onStartBot = () => {},
  onStopBot = () => {},
  onRefreshBot = () => {}
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

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      onNotify(t('projects.toast.nameRequired'), 'error');
      return;
    }

    const payload = createProjectPayload(formState);
    try {
      const savedProject = await onCreateProject(payload);
      onNotify(t('projects.toast.saved'), 'success');
      setFormState(INITIAL_FORM_STATE);

      if (savedProject?.id) {
        onSelectProject(savedProject.id);
      }
    } catch (error) {
      console.error('Failed to create project', error);
      onNotify(error?.message || t('app.toasts.genericError'), 'error');
    }
  };

  const statusKey = (botStatus?.status || (botStatus?.running ? 'running' : 'stopped') || '').toLowerCase();
  const botStatusLabels = {
    running: t('settings.telegram.statusRunning'),
    starting: t('settings.telegram.statusStarting'),
    stopped: t('settings.telegram.statusStopped'),
    error: t('settings.telegram.statusErrorShort'),
    unknown: t('settings.telegram.statusUnknown')
  };
  const normalizedStatus = botStatusLabels[statusKey] || botStatusLabels.unknown;
  const tokenStored = Boolean(botStatus?.tokenStored);
  const canStart = !botBusy && tokenStored && statusKey !== 'running' && statusKey !== 'starting';
  const canStop = !botBusy && statusKey === 'running';
  const statusClass =
    statusKey === 'running'
      ? 'success'
      : statusKey === 'starting'
        ? 'info'
        : statusKey === 'error'
          ? 'warn'
          : 'info';

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
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={onStartBot}
              disabled={!canStart}
            >
              {botBusy && statusKey === 'starting'
                ? t('settings.telegram.statusStarting')
                : t('settings.telegram.start')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onStopBot}
              disabled={!canStop}
            >
              {t('settings.telegram.stop')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onRefreshBot}
              disabled={botBusy}
            >
              {t('settings.telegram.refresh')}
            </button>
          </div>
          <p className="hint">
            <span className={`status-label ${tokenStored ? 'success' : 'warn'}`}>
              {tokenStored ? t('projects.form.botTokenStored') : t('projects.form.botTokenMissing')}
            </span>
          </p>
          <p className="hint">
            <span className={`status-label ${statusClass}`}>
              {t('projects.form.botStatus', {
                status: normalizedStatus,
                username: botStatus?.username ? ` @${botStatus.username}` : ''
              })}
            </span>
          </p>
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
  onNotify: PropTypes.func.isRequired,
  botStatus: PropTypes.shape({
    status: PropTypes.string,
    running: PropTypes.bool,
    tokenStored: PropTypes.bool,
    username: PropTypes.string
  }),
  botBusy: PropTypes.bool,
  onStartBot: PropTypes.func,
  onStopBot: PropTypes.func,
  onRefreshBot: PropTypes.func
};
