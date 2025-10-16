import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useI18n } from '../i18n/useI18n.js';

const DEFAULT_FORM = {
  id: null,
  pipelineId: '',
  cron: '*/15 * * * *',
  enabled: true
};

function formatDate(isoString, locale, fallback = '—') {
  if (!isoString) {
    return fallback;
  }

  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(date);
  } catch (error) {
    return isoString;
  }
}

function pipelineNameById(pipelines, pipelineId) {
  const pipeline = pipelines.find((item) => item.id === pipelineId);
  return pipeline ? pipeline.name : pipelineId;
}

export function SchedulerPage({
  project,
  pipelines,
  schedules,
  status,
  onRefresh,
  onSubmit,
  onDelete,
  onToggle,
  onRunNow,
  isLoading,
  onNotify
}) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
  const fallbackDateLabel = t('common.notAvailable');
  const renderHtml = (key, params) => ({ __html: t(key, params) });
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.pipelineId && pipelines.length > 0) {
      setForm((prev) => ({ ...prev, pipelineId: pipelines[0].id }));
    }
  }, [pipelines, form.pipelineId]);

  const projectName = project?.name || t('common.notAvailable');
  const sortedSchedules = useMemo(
    () => [...schedules].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [schedules]
  );

  const handleChange = (field) => (event) => {
    const value = field === 'enabled' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm((prev) => ({ ...DEFAULT_FORM, pipelineId: pipelines[0]?.id || '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.pipelineId) {
      onNotify?.(t('scheduler.toast.selectPipeline'), 'warn');
      return;
    }

    if (!form.cron.trim()) {
      onNotify?.(t('scheduler.toast.cronRequired'), 'warn');
      return;
    }

    setSaving(true);

    try {
      await onSubmit({
        id: form.id || undefined,
        projectId: project?.id || null,
        pipelineId: form.pipelineId,
        cron: form.cron.trim(),
        enabled: form.enabled
      });
      onNotify?.(t('scheduler.toast.saved'), 'success');
      resetForm();
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (schedule) => {
    setForm({
      id: schedule.id,
      pipelineId: schedule.pipelineId,
      cron: schedule.cron,
      enabled: schedule.enabled
    });
  };

  const handleDelete = async (schedule) => {
    if (!schedule?.id) {
      return;
    }

    try {
      await onDelete(schedule.id);
      onNotify?.(t('scheduler.toast.deleted'), 'info');

      if (form.id === schedule.id) {
        resetForm();
      }
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.deleteError'), 'error');
    }
  };

  const handleToggle = async (schedule) => {
    try {
      await onToggle(schedule.id, !schedule.enabled);
      const stateLabel = t(schedule.enabled ? 'scheduler.state.disabled' : 'scheduler.state.enabled');
      onNotify?.(t('scheduler.toast.toggled', { state: stateLabel }), 'info');
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.toggleError'), 'error');
    }
  };

  const handleRunNow = async (schedule) => {
    try {
      await onRunNow(schedule.id);
      onNotify?.(t('scheduler.toast.run'), 'success');
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.runError'), 'error');
    }
  };

  const handleRefresh = async () => {
    try {
      await onRefresh();
      onNotify?.(t('scheduler.toast.refreshed'), 'info');
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.refreshError'), 'error');
    }
  };

  return (
    <div className="page-grid two-columns">
      <section className="info-card">
        <header className="info-card__header">
          <h3>{t('scheduler.form.title')}</h3>
          <p dangerouslySetInnerHTML={renderHtml('scheduler.form.project', { name: projectName })} />
        </header>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('scheduler.form.pipeline')}
            <select value={form.pipelineId} onChange={handleChange('pipelineId')}>
              {pipelines.length === 0 ? (
                <option value="" disabled>
                  {t('scheduler.form.noPipelines')}
                </option>
              ) : null}
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('scheduler.form.cron')}
            <input
              type="text"
              placeholder={t('scheduler.form.cronPlaceholder')}
              value={form.cron}
              onChange={handleChange('cron')}
            />
          </label>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={handleChange('enabled')}
            />
            {t('scheduler.form.enabled')}
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving || !pipelines.length}>
              {form.id ? t('scheduler.form.submitUpdate') : t('scheduler.form.submitCreate')}
            </button>
            {form.id ? (
              <button
                className="secondary-button"
                type="button"
                onClick={resetForm}
                disabled={saving}
              >
                {t('scheduler.form.cancel')}
              </button>
            ) : null}
            <button
              className="secondary-button"
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {t('scheduler.form.refresh')}
            </button>
          </div>
        </form>

        <footer className="info-card__footer">
          <p className="small-text">
            <span dangerouslySetInnerHTML={renderHtml('scheduler.form.hint')} />
            {' '}
            <span dangerouslySetInnerHTML={renderHtml('scheduler.form.hintExample')} />
          </p>
        </footer>
      </section>

      <section className="info-card">
        <header className="info-card__header">
          <h3>{t('scheduler.status.title')}</h3>
          <p
            dangerouslySetInnerHTML={renderHtml('scheduler.status.running', {
              value: status?.running ? t('common.yes') : t('common.no')
            })}
          />
        </header>

        <div className="info-card__content">
          <ul className="project-details">
            <li>
              <strong>{t('scheduler.status.started')}</strong>
              <div>{formatDate(status?.startedAt, locale, fallbackDateLabel)}</div>
            </li>
            <li>
              <strong>{t('scheduler.status.lastRun')}</strong>
              <div>{formatDate(status?.lastRunAt, locale, fallbackDateLabel)}</div>
            </li>
            <li>
              <strong>{t('scheduler.status.activeJobs')}</strong>
              <div>{status?.jobs ?? 0}</div>
            </li>
          </ul>
          <p className="small-text">{t('scheduler.status.note')}</p>
        </div>
      </section>

      <section className="info-card" style={{ gridColumn: '1 / -1' }}>
        <header className="info-card__header">
          <h3>{t('scheduler.list.title')}</h3>
          <p>{t('scheduler.list.subtitle')}</p>
        </header>

        <div className="info-card__content">
          {sortedSchedules.length === 0 ? (
            <div className="empty-state">
              <h4>{t('scheduler.list.emptyTitle')}</h4>
              <p>{t('scheduler.list.emptyDescription')}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>{t('scheduler.list.pipeline')}</th>
                    <th>{t('scheduler.form.cron')}</th>
                    <th>{t('scheduler.list.nextRun')}</th>
                    <th>{t('scheduler.list.state')}</th>
                    <th>{t('scheduler.list.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSchedules.map((schedule) => (
                    <tr key={schedule.id}>
                      <td>{pipelineNameById(pipelines, schedule.pipelineId)}</td>
                      <td>{schedule.cron}</td>
                      <td>{formatDate(schedule.nextRun, locale, fallbackDateLabel)}</td>
                      <td>{schedule.enabled ? t('common.enabled') : t('common.paused')}</td>
                      <td>
                        <div className="button-row">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleEdit(schedule)}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleToggle(schedule)}
                          >
                            {schedule.enabled ? t('scheduler.list.pause') : t('scheduler.list.enable')}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleRunNow(schedule)}
                          >
                            {t('scheduler.list.run')}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleDelete(schedule)}
                          >
                            {t('scheduler.list.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

SchedulerPage.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string
  }),
  pipelines: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired
    })
  ),
  schedules: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      pipelineId: PropTypes.string.isRequired,
      cron: PropTypes.string.isRequired,
      enabled: PropTypes.bool.isRequired,
      nextRun: PropTypes.string,
      createdAt: PropTypes.string
    })
  ),
  status: PropTypes.shape({
    running: PropTypes.bool,
    startedAt: PropTypes.string,
    lastRunAt: PropTypes.string,
    jobs: PropTypes.number
  }),
  onRefresh: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onToggle: PropTypes.func.isRequired,
  onRunNow: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  onNotify: PropTypes.func
};

SchedulerPage.defaultProps = {
  project: null,
  pipelines: [],
  schedules: [],
  status: null,
  onRefresh: async () => {},
  isLoading: false,
  onNotify: null
};
