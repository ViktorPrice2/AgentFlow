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
function formatDate(isoString) {
  if (!isoString) {
    return '—';
  }

  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat(locale, {
    return new Intl.DateTimeFormat('ru-RU', {
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
  const projectName = project?.name || 'Не выбран';
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
      onNotify?.('Выберите пайплайн для расписания', 'warn');
      return;
    }

    if (!form.cron.trim()) {
      onNotify?.(t('scheduler.toast.cronRequired'), 'warn');
      onNotify?.('Укажите cron-выражение', 'warn');
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
      onNotify?.('Расписание сохранено', 'success');
      resetForm();
    } catch (error) {
      onNotify?.(error.message || 'Не удалось сохранить расписание', 'error');
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
      onNotify?.('Расписание удалено', 'info');

      if (form.id === schedule.id) {
        resetForm();
      }
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.deleteError'), 'error');
      onNotify?.(error.message || 'Не удалось удалить расписание', 'error');
    }
  };

  const handleToggle = async (schedule) => {
    try {
      await onToggle(schedule.id, !schedule.enabled);
      const stateLabel = t(schedule.enabled ? 'scheduler.state.disabled' : 'scheduler.state.enabled');
      onNotify?.(t('scheduler.toast.toggled', { state: stateLabel }), 'info');
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.toggleError'), 'error');
      onNotify?.(`Расписание ${schedule.enabled ? 'отключено' : 'включено'}`, 'info');
    } catch (error) {
      onNotify?.(error.message || 'Не удалось обновить расписание', 'error');
    }
  };

  const handleRunNow = async (schedule) => {
    try {
      await onRunNow(schedule.id);
      onNotify?.(t('scheduler.toast.run'), 'success');
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.runError'), 'error');
      onNotify?.('Пайплайн запущен вручную', 'success');
    } catch (error) {
      onNotify?.(error.message || 'Не удалось запустить пайплайн', 'error');
    }
  };

  const handleRefresh = async () => {
    try {
      await onRefresh();
      onNotify?.(t('scheduler.toast.refreshed'), 'info');
    } catch (error) {
      onNotify?.(error.message || t('scheduler.toast.refreshError'), 'error');
      onNotify?.('Расписания обновлены', 'info');
    } catch (error) {
      onNotify?.(error.message || 'Не удалось обновить расписания', 'error');
    }
  };

  return (
    <div className="page-grid two-columns">
      <section className="info-card">
        <header className="info-card__header">
          <h3>{t('scheduler.form.title')}</h3>
          <p dangerouslySetInnerHTML={renderHtml('scheduler.form.project', { name: projectName })} />
          <h3>Новое расписание</h3>
          <p>
            Проект: <strong>{projectName}</strong>
          </p>
        </header>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('scheduler.form.pipeline')}
            <select value={form.pipelineId} onChange={handleChange('pipelineId')}>
              {pipelines.length === 0 ? (
                <option value="" disabled>
                  {t('scheduler.form.noPipelines')}
            Пайплайн
            <select value={form.pipelineId} onChange={handleChange('pipelineId')}>
              {pipelines.length === 0 ? (
                <option value="" disabled>
                  Нет доступных пайплайнов
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
            Cron-выражение
            <input
              type="text"
              placeholder="*/5 * * * *"
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
            Активно
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving || !pipelines.length}>
              {form.id ? t('scheduler.form.submitUpdate') : t('scheduler.form.submitCreate')}
              {form.id ? 'Обновить' : 'Добавить'}
            </button>
            {form.id ? (
              <button
                className="secondary-button"
                type="button"
                onClick={resetForm}
                disabled={saving}
              >
                {t('scheduler.form.cancel')}
                Отмена
              </button>
            ) : null}
            <button
              className="secondary-button"
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {t('scheduler.form.refresh')}
              Обновить список
            </button>
          </div>
        </form>

        <footer className="info-card__footer">
          <p className="small-text">
            <span dangerouslySetInnerHTML={renderHtml('scheduler.form.hint')} />
            {' '}
            <span dangerouslySetInnerHTML={renderHtml('scheduler.form.hintExample')} />
            Используйте cron-выражение формата <code>минуты часы день-месяца месяц день-недели</code>.
            Например, <code>*/30 * * * *</code> — каждые 30 минут.
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
          <h3>Статус планировщика</h3>
          <p>
            Работает: <strong>{status?.running ? 'Да' : 'Нет'}</strong>
          </p>
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
              <strong>Запущен</strong>
              <div>{formatDate(status?.startedAt)}</div>
            </li>
            <li>
              <strong>Последний запуск</strong>
              <div>{formatDate(status?.lastRunAt)}</div>
            </li>
            <li>
              <strong>Активные задачи</strong>
              <div>{status?.jobs ?? 0}</div>
            </li>
          </ul>
          <p className="small-text">
            Все расписания сохраняются в базе данных и перезапускаются при старте приложения.
          </p>
        </div>
      </section>

      <section className="info-card" style={{ gridColumn: '1 / -1' }}>
        <header className="info-card__header">
          <h3>{t('scheduler.list.title')}</h3>
          <p>{t('scheduler.list.subtitle')}</p>
          <h3>Список расписаний</h3>
          <p>Контролируйте активные задачи и запускайте пайплайны вручную.</p>
        </header>

        <div className="info-card__content">
          {sortedSchedules.length === 0 ? (
            <div className="empty-state">
              <h4>{t('scheduler.list.emptyTitle')}</h4>
              <p>{t('scheduler.list.emptyDescription')}</p>
              <h4>Расписаний пока нет</h4>
              <p>Создайте новое расписание, чтобы запускать пайплайны автоматически.</p>
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
                    <th>Пайплайн</th>
                    <th>Cron</th>
                    <th>Следующий запуск</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSchedules.map((schedule) => (
                    <tr key={schedule.id}>
                      <td>{pipelineNameById(pipelines, schedule.pipelineId)}</td>
                      <td>{schedule.cron}</td>
                      <td>{formatDate(schedule.nextRun, locale, fallbackDateLabel)}</td>
                      <td>{schedule.enabled ? t('common.enabled') : t('common.paused')}</td>
                      <td>{formatDate(schedule.nextRun)}</td>
                      <td>{schedule.enabled ? 'Активно' : 'Пауза'}</td>
                      <td>
                        <div className="button-row">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleEdit(schedule)}
                          >
                            {t('common.edit')}
                            Изменить
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleToggle(schedule)}
                          >
                            {schedule.enabled ? t('scheduler.list.pause') : t('scheduler.list.enable')}
                            {schedule.enabled ? 'Пауза' : 'Включить'}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleRunNow(schedule)}
                          >
                            {t('scheduler.list.run')}
                            Запустить
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleDelete(schedule)}
                          >
                            {t('scheduler.list.delete')}
                            Удалить
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
