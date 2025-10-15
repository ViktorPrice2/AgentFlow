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
  references: '',
  budget: ''
};

const DEFAULT_LABELS = {
  goals: 'Цели',
  audience: 'Аудитория',
  offer: 'Предложение',
  tone: 'Тон',
  keyMessages: 'Ключевые сообщения',
  callToAction: 'Призыв',
  successMetrics: 'Метрики',
  references: 'Референсы',
  budget: 'Бюджет'
};

export function BriefPage({
  project = null,
  brief = DEFAULT_BRIEF,
  telegramBrief = null,
  onUpdateBrief,
  onNotify,
  onRefreshTelegramBrief,
  onGeneratePlan,
  planText = ''
}) {
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
      { label: 'Референсы', value: formState.references },
      { label: 'Бюджет', value: formState.budget }
    ];

    return fields.filter((field) => field.value?.trim()).map((field) => field.label);
  }, [formState]);

  const telegramAnswers = useMemo(() => telegramBrief?.payload?.answers || null, [telegramBrief]);
  const telegramUpdatedAt = useMemo(() => {
    if (!telegramBrief?.updatedAt) {
      return null;
    }

    try {
      return new Date(telegramBrief.updatedAt).toLocaleString('ru-RU');
    } catch (error) {
      return telegramBrief.updatedAt;
    }
  }, [telegramBrief]);

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
            Бюджет кампании
            <input
              name="budget"
              value={formState.budget}
              onChange={handleChange}
              placeholder="Например, 500 000 ₽ или диапазон"
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
        title="Телеграм-опрос"
        subtitle="Получайте данные от команды через бота и синхронизируйте бриф."
        footer={
          <div className="tg-brief__actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onRefreshTelegramBrief}
              disabled={!project}
            >
              Обновить
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => onGeneratePlan(telegramBrief || formState)}
              disabled={!project}
            >
              Сформировать план
            </button>
          </div>
        }
      >
        {telegramBrief ? (
          <div className="tg-brief__meta">
            <p>
              Статус:{' '}
              <span className="status-label ok">получен</span>
            </p>
            {telegramUpdatedAt && <p className="hint">Обновлено: {telegramUpdatedAt}</p>}
          </div>
        ) : (
          <p className="hint">
            Нет сохранённых ответов Telegram-бота. Отправьте команду /setup и /finish, чтобы собрать бриф.
          </p>
        )}

        {telegramAnswers ? (
          <dl className="tg-brief__list">
            {Object.entries(telegramAnswers)
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <div key={key} className="tg-brief__item">
                  <dt>{DEFAULT_LABELS[key] || key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p>Ответы появятся здесь после завершения опроса.</p>
        )}
      </InfoCard>

      <InfoCard
        title="Сводка и план"
        subtitle="Список заполняется автоматически — помогает быстро оценить полноту брифа."
      >
        <div className="brief-summary__grid">
          <div>
            <h4>Сводка</h4>
            <ul className="brief-summary">
              {summary.length === 0 ? (
                <li>Добавьте данные слева, чтобы сформировать сводку.</li>
              ) : (
                summary.map((item) => <li key={item}>{item}</li>)
              )}
            </ul>
          </div>
          <div className="plan-output">
            <h4>План кампании</h4>
            <textarea
              readOnly
              value={planText}
              placeholder="Нажмите «Сформировать план», чтобы получить готовый скелет кампании."
            />
          </div>
        </div>
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
    references: PropTypes.string,
    budget: PropTypes.string
  }),
  telegramBrief: PropTypes.shape({
    id: PropTypes.string,
    projectId: PropTypes.string,
    summary: PropTypes.string,
    updatedAt: PropTypes.string,
    payload: PropTypes.shape({
      answers: PropTypes.object
    })
  }),
  onUpdateBrief: PropTypes.func.isRequired,
  onNotify: PropTypes.func.isRequired,
  onRefreshTelegramBrief: PropTypes.func.isRequired,
  onGeneratePlan: PropTypes.func.isRequired,
  planText: PropTypes.string
};
