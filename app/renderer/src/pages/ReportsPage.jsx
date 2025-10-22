import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
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

function calculateMetrics(reports) {
  const base = {
    total: reports.length,
    completed: 0,
    failed: 0,
    pending: 0,
    other: 0,
    lastUpdated: null
  };

  if (reports.length === 0) {
    return base;
  }

  return reports.reduce((acc, report) => {
    const status = String(report?.status || 'unknown').toLowerCase();
    const timestamp = report?.updatedAt || report?.createdAt;

    if (['completed', 'success', 'succeeded'].includes(status)) {
      acc.completed += 1;
    } else if (['failed', 'error', 'errored', 'timeout'].includes(status)) {
      acc.failed += 1;
    } else if (['pending', 'running', 'in_progress', 'processing'].includes(status)) {
      acc.pending += 1;
    } else {
      acc.other += 1;
    }

    if (timestamp) {
      const time = new Date(timestamp).getTime();
      if (!Number.isNaN(time) && (!acc.lastUpdated || time > acc.lastUpdated)) {
        acc.lastUpdated = time;
      }
    }

    return acc;
  }, { ...base });
}

function getArtifactLabel(artifact, index) {
  if (typeof artifact === 'string') {
    return artifact;
  }

  if (artifact && typeof artifact === 'object') {
    return (
      artifact.label ||
      artifact.name ||
      artifact.title ||
      artifact.path ||
      artifact.url ||
      artifact.id ||
      `artifact-${index + 1}`
    );
  }

  return `artifact-${index + 1}`;
}

export function ReportsPage({ reports = [] }) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
  const metrics = calculateMetrics(reports);

  return (
    <InfoCard title={t('reports.title')} subtitle={t('reports.subtitle')}>
      {reports.length === 0 ? (
        <EmptyState title={t('reports.emptyTitle')} description={t('reports.emptyDescription')} />
      ) : (
        <div className="reports-content">
          <section className="reports-grid">
            <article className="report-metric">
              <h4>{t('reports.totalReports')}</h4>
              <p>{metrics.total}</p>
            </article>
            <article className="report-metric">
              <h4>{t('reports.completed')}</h4>
              <p>{metrics.completed}</p>
            </article>
            <article className="report-metric">
              <h4>{t('reports.pending')}</h4>
              <p>{metrics.pending}</p>
            </article>
            <article className="report-metric">
              <h4>{t('reports.failed')}</h4>
              <p>{metrics.failed}</p>
            </article>
            {metrics.other > 0 ? (
              <article className="report-metric">
                <h4>{t('reports.other')}</h4>
                <p>{metrics.other}</p>
              </article>
            ) : null}
            <article className="report-metric">
              <h4>{t('reports.lastUpdated')}</h4>
              <p>
                {metrics.lastUpdated
                  ? new Date(metrics.lastUpdated).toLocaleString(locale)
                  : t('common.notAvailable')}
              </p>
            </article>
          </section>

          <div className="reports-list">
            {reports.map((report, index) => {
              const artifacts = Array.isArray(report.artifacts) ? report.artifacts : [];
              const timestamp = report.updatedAt || report.createdAt;
              const normalizedStatus = String(report.status || 'unknown').toLowerCase();
              const statusClass = normalizedStatus.replace(/[^a-z0-9]+/g, '-');

              return (
                <article
                  key={report.id || `${index}`}
                  className={`report-card report-card--${statusClass}`}
                >
                  <header className="report-card__header">
                    <div className="report-card__heading">
                      <h4 className="report-card__title">{report.title || t('reports.untitled')}</h4>
                      <p className="report-card__meta">
                        {timestamp ? new Date(timestamp).toLocaleString(locale) : t('common.notAvailable')}
                      </p>
                    </div>
                    <span className="report-card__status">{formatStatusLabel(report.status, t)}</span>
                  </header>

                  <dl className="report-card__meta-grid">
                    <div>
                      <dt>{t('reports.project')}</dt>
                      <dd>{report.projectId || t('common.notAvailable')}</dd>
                    </div>
                    <div>
                      <dt>{t('reports.pipeline')}</dt>
                      <dd>{report.pipelineId || t('common.notAvailable')}</dd>
                    </div>
                  </dl>

                  {report.summary ? (
                    <section className="report-card__section">
                      <h5>{t('reports.summary')}</h5>
                      <ReactMarkdown className="report-card__summary">{report.summary}</ReactMarkdown>
                    </section>
                  ) : null}

                  {artifacts.length > 0 ? (
                    <section className="report-card__section">
                      <h5>{t('reports.artifacts')}</h5>
                      <ul className="report-card__artifacts">
                        {artifacts.map((artifact, artifactIndex) => (
                          <li
                            key={
                              artifact?.id ||
                              artifact?.path ||
                              artifact?.url ||
                              `${report.id}-artifact-${artifactIndex}`
                            }
                          >
                            {getArtifactLabel(artifact, artifactIndex)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : (
                    <p className="report-card__note">{t('reports.noArtifacts')}</p>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </InfoCard>
  );
}

ReportsPage.propTypes = {
  reports: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      projectId: PropTypes.string,
      pipelineId: PropTypes.string,
      status: PropTypes.string,
      title: PropTypes.string,
      summary: PropTypes.string,
      artifacts: PropTypes.arrayOf(
        PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.shape({
            id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            label: PropTypes.string,
            name: PropTypes.string,
            title: PropTypes.string,
            path: PropTypes.string,
            url: PropTypes.string
          })
        ])
      ),
      createdAt: PropTypes.string,
      updatedAt: PropTypes.string
    })
  )
};
