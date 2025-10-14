import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';

const DEFAULT_BRIEF = {
  goals: '',
  audience: '',
  offer: '',
  tone: '',
  keyMessages: '',
  callToAction: '',
  successMetrics: '',
  references: ''
};

export function BriefPage({ project = null, brief = DEFAULT_BRIEF, onUpdateBrief, onNotify }) {
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
    onNotify('Бриф обновлён', 'success');
  };

  const summary = useMemo(() => {
    const fields = [
      { label: 'Цели', value: formState.goals },
      { label: 'Аудитория', value: formState.audience },
      { label: 'Предложение', value: formState.offer },
      { label: 'Тон коммуникации', value: formState.tone },
      { label: 'Ключевые сообщения', value: formState.keyMessages },
      { label: 'Призыв к действию', value: formState.callToAction },
      { label: 'Метрики успеха', value: formState.successMetrics },
      { label: 'Референсы', value: formState.references }
    ];

    return fields.filter((field) => field.value?.trim()).map((field) => field.label);
  }, [formState]);

  return (
    <div className="page-grid brief-grid">
      <InfoCard
        title="Бриф"
        subtitle={
          project
            ? `Работаем с проектом «${project.name}». Эти данные будут доступны агентам и пайплайнам.`
            : 'Сначала выберите проект во вкладке «Проекты».'
        }
      >
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Цели кампании
            <textarea
              name="goals"
              rows={3}
              value={formState.goals}
              onChange={handleChange}
              placeholder="Повысить узнаваемость, сделать запуск продукта, получить лиды..."
            />
          </label>
          <label>
            Целевая аудитория
            <textarea
              name="audience"
              rows={3}
              value={formState.audience}
              onChange={handleChange}
              placeholder="Кто клиент? Какие боли, мотивация, возражения?"
            />
          </label>
          <label>
            Предложение / оффер
            <textarea
              name="offer"
              rows={2}
              value={formState.offer}
              onChange={handleChange}
              placeholder="Коротко о продукте, услуге или спецпредложении"
            />
          </label>
          <label>
            Тон и стиль
            <input
              name="tone"
              value={formState.tone}
              onChange={handleChange}
              placeholder="Дружелюбный, экспертный, дерзкий, деловой..."
            />
          </label>
          <label>
            Ключевые сообщения
            <textarea
              name="keyMessages"
              rows={3}
              value={formState.keyMessages}
              onChange={handleChange}
              placeholder="2-3 тезиса, которые обязательно нужно упомянуть"
            />
          </label>
          <label>
            Призыв к действию
            <input
              name="callToAction"
              value={formState.callToAction}
              onChange={handleChange}
              placeholder="Например, зарегистрируйтесь, оформите заказ, подпишитесь"
            />
          </label>
          <label>
            Метрики успеха
            <input
              name="successMetrics"
              value={formState.successMetrics}
              onChange={handleChange}
              placeholder="Конверсии, заявки, охват, продажи..."
            />
          </label>
          <label>
            Референсы / ссылки
            <textarea
              name="references"
              rows={2}
              value={formState.references}
              onChange={handleChange}
              placeholder="Полезные примеры, прошлые кампании, материалы"
            />
          </label>
          <button type="submit" className="primary-button" disabled={!project}>
            Сохранить бриф
          </button>
        </form>
      </InfoCard>

      <InfoCard
        title="Сводка для агентов"
        subtitle="Список заполняется автоматически — помогает быстро оценить полноту брифа."
      >
        <ul className="brief-summary">
          {summary.length === 0 ? (
            <li>Добавьте данные слева, чтобы сформировать сводку.</li>
          ) : (
            summary.map((item) => <li key={item}>{item}</li>)
          )}
        </ul>
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
  onNotify: PropTypes.func.isRequired
};
