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

function calculateMetrics(runs) {
  const total = runs.length;

  if (total === 0) {
    return {
      total: 0,
      success: 0,
      failed: 0,
      lastRun: null
    };
  }

  const success = runs.filter((run) => run.status === 'completed').length;
  const failed = total - success;
  const lastRun = runs[0];

  return { total, success, failed, lastRun };
}

export function ReportsPage({ runs = [] }) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
  const metrics = calculateMetrics(runs);

  return (
    <InfoCard title={t('reports.title')} subtitle={t('reports.subtitle')}>
      {runs.length === 0 ? (
        <EmptyState title={t('reports.emptyTitle')} description={t('reports.emptyDescription')} />
      ) : (
        <div className="reports-grid">
          <section className="report-metric">
            <h4>{t('reports.totalRuns')}</h4>
            <p>{metrics.total}</p>
          </section>
          <section className="report-metric">
            <h4>{t('reports.success')}</h4>
            <p>{metrics.success}</p>
          </section>
          <section className="report-metric">
            <h4>{t('reports.errors')}</h4>
            <p>{metrics.failed}</p>
          </section>
          <section className="report-metric">
            <h4>{t('reports.lastRun')}</h4>
            <p>
              {metrics.lastRun
                ? `${metrics.lastRun.pipelineName || t('common.pipeline')} • ${new Date(
                    metrics.lastRun.timestamp
                  ).toLocaleString(locale)} • ${formatStatusLabel(metrics.lastRun.status, t)}`
                : t('common.notAvailable')}
            </p>
          </section>
        </div>
      )}
    </InfoCard>
  );
}

ReportsPage.propTypes = {
  runs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      timestamp: PropTypes.string.isRequired,
      pipelineName: PropTypes.string
    })
  )
};
