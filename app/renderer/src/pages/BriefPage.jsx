import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

export const DEFAULT_BRIEF = {
  goals: '',
  audience: '',
  offer: '',
  tone: '',
  keyMessages: '',
  callToAction: '',
  successMetrics: '',
  references: ''
};

export function BriefPage({
  project = null,
  brief = DEFAULT_BRIEF,
  latestBrief = null,
  planText = '',
  telegramStatus = null,
  onUpdateBrief,
  onNotify,
  onRefreshBrief = () => {},
  onImportBrief = () => {},
  onGeneratePlan = () => {},
  isRefreshing = false,
  isGenerating = false
}) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
  const [formState, setFormState] = useState({ ...DEFAULT_BRIEF, ...brief });

  useEffect(() => {
    setFormState({ ...DEFAULT_BRIEF, ...brief });
  }, [brief]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onUpdateBrief(formState);
    onNotify(t('brief.toast.saved'), 'success');
  };

  const summary = useMemo(() => {
    const fields = [
      { label: t('brief.labels.goals'), value: formState.goals },
      { label: t('brief.labels.audience'), value: formState.audience },
      { label: t('brief.labels.offer'), value: formState.offer },
      { label: t('brief.labels.tone'), value: formState.tone },
      { label: t('brief.labels.keyMessages'), value: formState.keyMessages },
      { label: t('brief.labels.callToAction'), value: formState.callToAction },
      { label: t('brief.labels.successMetrics'), value: formState.successMetrics },
      { label: t('brief.labels.references'), value: formState.references }
    ];

    return fields.filter((field) => field.value?.trim()).map((field) => field.label);
  }, [formState, t]);

  const latestBriefDetails = latestBrief?.details ?? {};
  const statusLabel = telegramStatus?.running
    ? t('brief.telegram.statusActive')
    : t('brief.telegram.statusInactive');
  const deeplink = project && telegramStatus?.deeplinkBase ? `${telegramStatus.deeplinkBase}?start=project=${project.id}` : null;

  return (
    <div className="page-grid brief-grid">
      <InfoCard
        title={t('brief.title')}
        subtitle={
          project
            ? t('brief.subtitle.withProject', { project: project.name })
            : t('brief.subtitle.withoutProject')
        }
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            {t('brief.form.goals')}
            <textarea
              name="goals"
              rows={3}
              value={formState.goals}
              onChange={handleChange}
              placeholder={t('brief.form.goalsPlaceholder')}
            />
          </label>
          <label>
            {t('brief.form.audience')}
            <textarea
              name="audience"
              rows={3}
              value={formState.audience}
              onChange={handleChange}
              placeholder={t('brief.form.audiencePlaceholder')}
            />
          </label>
          <label>
            {t('brief.form.offer')}
            <textarea
              name="offer"
              rows={2}
              value={formState.offer}
              onChange={handleChange}
              placeholder={t('brief.form.offerPlaceholder')}
            />
          </label>
          <label>
            {t('brief.form.tone')}
            <input
              name="tone"
              value={formState.tone}
              onChange={handleChange}
              placeholder={t('brief.form.tonePlaceholder')}
            />
          </label>
          <label>
            {t('brief.form.keyMessages')}
            <textarea
              name="keyMessages"
              rows={3}
              value={formState.keyMessages}
              onChange={handleChange}
              placeholder={t('brief.form.keyMessagesPlaceholder')}
            />
          </label>
          <label>
            {t('brief.form.callToAction')}
            <input
              name="callToAction"
              value={formState.callToAction}
              onChange={handleChange}
              placeholder={t('brief.form.callToActionPlaceholder')}
            />
          </label>
          <label>
            {t('brief.form.successMetrics')}
            <input
              name="successMetrics"
              value={formState.successMetrics}
              onChange={handleChange}
              placeholder={t('brief.form.successMetricsPlaceholder')}
            />
          </label>
          <label>
            {t('brief.form.references')}
            <textarea
              name="references"
              rows={2}
              value={formState.references}
              onChange={handleChange}
              placeholder={t('brief.form.referencesPlaceholder')}
            />
          </label>
          <button type="submit" className="primary-button" disabled={!project}>
            {t('brief.form.save')}
          </button>
        </form>
      </InfoCard>

      <InfoCard
        title={t('brief.summary.title')}
        subtitle={t('brief.summary.subtitle')}
      >
        <ul className="brief-summary">
          {summary.length === 0 ? (
            <li>{t('brief.summary.empty')}</li>
          ) : (
            summary.map((item) => <li key={item}>{item}</li>)
          )}
        </ul>
      </InfoCard>

      <InfoCard
        title={t('brief.telegram.title')}
        subtitle={t('brief.telegram.subtitle')}
        footer={
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={onRefreshBrief}
              disabled={!project || isRefreshing}
            >
              {isRefreshing ? t('brief.telegram.refreshing') : t('brief.telegram.refresh')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onImportBrief}
              disabled={!latestBrief || !project}
            >
              {t('brief.telegram.apply')}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={onGeneratePlan}
              disabled={!project || isGenerating}
            >
              {isGenerating ? t('brief.telegram.generating') : t('brief.telegram.generate')}
            </button>
          </div>
        }
      >
        <div className="telegram-brief-status">
          <p>
            <strong>{t('common.status')}:</strong> {statusLabel}
            {telegramStatus?.lastError ? <span className="status-label warn">{telegramStatus.lastError}</span> : null}
          </p>
          {deeplink ? (
            <p className="hint">
              {t('common.deeplink')}: <code>{deeplink}</code>
            </p>
          ) : (
            <p className="hint">{t('brief.telegram.deeplinkHint')}</p>
          )}
        </div>
        {latestBrief ? (
          <div className="telegram-brief-preview">
            <p className="telegram-brief-preview__meta">
              {t('brief.telegram.receivedAt')}: {new Date(latestBrief.createdAt || latestBrief.updatedAt).toLocaleString(locale)}
            </p>
            <ul>
              {Object.entries(latestBriefDetails).map(([key, value]) => (
                <li key={key}>
                  <strong>{key}:</strong> {value || t('common.notAvailable')}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="hint">{t('brief.telegram.noBriefs')}</p>
        )}
      </InfoCard>

      <InfoCard title={t('brief.telegram.planTitle')} subtitle={t('brief.telegram.planSubtitle')}>
        {planText ? (
          <pre className="plan-preview">{planText}</pre>
        ) : (
          <p className="hint">{t('brief.telegram.planEmpty')}</p>
        )}
      </InfoCard>
    </div>
  );
}

BriefPage.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired
  }),
  brief: PropTypes.shape({
    goals: PropTypes.string,
    audience: PropTypes.string,
    offer: PropTypes.string,
    tone: PropTypes.string,
    keyMessages: PropTypes.string,
    callToAction: PropTypes.string,
    successMetrics: PropTypes.string,
    references: PropTypes.string
  }),
  onUpdateBrief: PropTypes.func.isRequired,
  onNotify: PropTypes.func.isRequired,
  latestBrief: PropTypes.shape({
    id: PropTypes.string,
    projectId: PropTypes.string,
    summary: PropTypes.string,
    details: PropTypes.object,
    createdAt: PropTypes.string,
    updatedAt: PropTypes.string
  }),
  planText: PropTypes.string,
  telegramStatus: PropTypes.shape({
    running: PropTypes.bool,
    lastError: PropTypes.string,
    deeplinkBase: PropTypes.string
  }),
  onRefreshBrief: PropTypes.func,
  onImportBrief: PropTypes.func,
  onGeneratePlan: PropTypes.func,
  isRefreshing: PropTypes.bool,
  isGenerating: PropTypes.bool
};
