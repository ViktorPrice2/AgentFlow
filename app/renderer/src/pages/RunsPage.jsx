import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

function formatStatusLabel(status, t) {
  if (!status) {
    return t('common.notAvailable');
  }

  const normalized = String(status).toLowerCase();

  return t(`runs.statuses.${normalized}`, undefined, status);
}

export function RunsPage({ runs = [] }) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';

  return (
    <InfoCard
      title={t('runs.title')}
      subtitle={t('runs.subtitle')}
    >
      {runs.length === 0 ? (
        <EmptyState title={t('runs.emptyTitle')} description={t('runs.emptyDescription')} />
      ) : (
        <div className="runs-list">
          {runs.map((run) => (
            <article key={run.id} className={`run-card run-${run.status}`}>
              <header>
                <h4>{run.pipelineName || t('common.pipeline')}</h4>
                <span>{new Date(run.timestamp).toLocaleString(locale)}</span>
              </header>
              <p>
                {t('runs.status')}: {formatStatusLabel(run.status, t)}
              </p>
              {run.projectName ? <p>{t('runs.project')}: {run.projectName}</p> : null}
              {run.summary ? <p>{t('runs.summary')}: {run.summary}</p> : null}
              {run.artifacts && run.artifacts.length > 0 ? (
                <p>
                  {t('runs.artifacts')}: {run.artifacts.join(', ')}
                </p>
              ) : (
                <p>{t('runs.noArtifacts')}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </InfoCard>
  );
}

RunsPage.propTypes = {
  runs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      timestamp: PropTypes.string.isRequired,
      pipelineName: PropTypes.string,
      projectName: PropTypes.string,
      summary: PropTypes.string,
      artifacts: PropTypes.arrayOf(PropTypes.string)
    })
  )
};
