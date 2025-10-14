import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

export function RunsPage({ runs = [], onClear }) {
  return (
    <InfoCard
      title="Запуски"
      subtitle="История выполненных пайплайнов. Логи и артефакты сохраняются в папке data."
      footer={
        runs.length > 0 ? (
          <button type="button" className="secondary-button" onClick={onClear}>
            Очистить историю
          </button>
        ) : null
      }
    >
      {runs.length === 0 ? (
        <EmptyState
          title="Ещё не было запусков"
          description="После выполнения пайплайна краткий отчёт появится здесь."
        />
      ) : (
        <div className="runs-list">
          {runs.map((run) => (
            <article key={run.id} className={`run-card run-${run.status}`}>
              <header>
                <h4>{run.pipelineName || 'Pipeline'}</h4>
                <span>{new Date(run.timestamp).toLocaleString('ru-RU')}</span>
              </header>
              <p>Статус: {run.status}</p>
              {run.projectName ? <p>Проект: {run.projectName}</p> : null}
              {run.summary ? <p>Сводка: {run.summary}</p> : null}
              {run.artifacts && run.artifacts.length > 0 ? (
                <p>Артефакты: {run.artifacts.join(', ')}</p>
              ) : (
                <p>Артефактов не было.</p>
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
  ),
  onClear: PropTypes.func.isRequired
};
