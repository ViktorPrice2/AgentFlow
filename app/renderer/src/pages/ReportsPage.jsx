import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

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
  const metrics = calculateMetrics(runs);

  return (
    <InfoCard
      title="Отчёты"
      subtitle="Сводные метрики по запуску пайплайнов. Подробные JSON-отчёты находятся в data/logs."
    >
      {runs.length === 0 ? (
        <EmptyState
          title="Нет данных для отчётов"
          description="Запустите хотя бы один сценарий, чтобы собрать статистику."
        />
      ) : (
        <div className="reports-grid">
          <section className="report-metric">
            <h4>Всего запусков</h4>
            <p>{metrics.total}</p>
          </section>
          <section className="report-metric">
            <h4>Успешно</h4>
            <p>{metrics.success}</p>
          </section>
          <section className="report-metric">
            <h4>Ошибки</h4>
            <p>{metrics.failed}</p>
          </section>
          <section className="report-metric">
            <h4>Последний запуск</h4>
            <p>
              {metrics.lastRun
                ? `${metrics.lastRun.pipelineName || 'Pipeline'} • ${new Date(
                    metrics.lastRun.timestamp
                  ).toLocaleString('ru-RU')} • ${metrics.lastRun.status}`
                : '—'}
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
