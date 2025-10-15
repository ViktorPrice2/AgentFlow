import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { InfoCard } from '../components/InfoCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

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

const SOURCE_LABELS = {
  telegram: 'Telegram',
  manual: 'Ручной'
};

export function BriefPage({
  project = null,
  briefs = [],
  selectedBrief = null,
  onSelectBrief,
  onRefresh,
  onSaveBrief,
  onGeneratePlan,
  onNotify
}) {
  const [title, setTitle] = useState('');
  const [formState, setFormState] = useState({ ...DEFAULT_BRIEF });
  const [planPreview, setPlanPreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (selectedBrief) {
      setTitle(selectedBrief.title || `Бриф проекта ${project?.name || ''}`.trim());
      setFormState({ ...DEFAULT_BRIEF, ...(selectedBrief.content ?? {}) });
      setPlanPreview(selectedBrief.metadata?.plan || '');
    } else {
      setTitle(project ? `Бриф проекта ${project.name}` : 'Новый бриф');
      setFormState({ ...DEFAULT_BRIEF });
      setPlanPreview('');
    }
  }, [selectedBrief, project]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!project) {
      onNotify('Выберите проект, чтобы сохранить бриф', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await onSaveBrief({
        id: selectedBrief?.id ?? null,
        title: title.trim(),
        content: formState
      });

      setPlanPreview(saved.metadata?.plan || planPreview);
      onSelectBrief(saved.id);
    } catch (error) {
      console.error('Failed to save brief form', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!project) {
      onNotify('Выберите проект, чтобы сформировать план', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const plan = await onGeneratePlan(formState);
      setPlanPreview(plan);
      onNotify('План сформирован', 'success');
    } catch (error) {
      console.error('Failed to generate plan', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateNew = () => {
    onSelectBrief(null);
  };

  const renderBriefList = () => {
    if (!project) {
      return (
        <EmptyState
          title="Выберите проект"
          description="Сначала создайте проект, затем сформируйте бриф."
        />
      );
    }

    if (briefs.length === 0) {
      return (
        <EmptyState
          title="Брифов пока нет"
          description="Сохраните первый бриф вручную или через Telegram-бота."
        />
      );
    }

    return (
      <ul className="brief-list">
        {briefs.map((item) => {
          const isActive = selectedBrief?.id === item.id;
          const sourceLabel = SOURCE_LABELS[item.source] || 'Неизвестно';

          return (
            <li key={item.id}>
              <button
                type="button"
                className={`brief-list__item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectBrief(item.id)}
              >
                <div className="brief-list__primary">
                  <h4>{item.title}</h4>
                  <p>{new Date(item.updatedAt).toLocaleString('ru-RU')}</p>
                </div>
                <span className={`status-label ${item.source === 'telegram' ? 'info' : 'ok'}`}>
                  {sourceLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="page-grid brief-grid">
      <InfoCard
        title="Брифы проекта"
        subtitle="Список сохраняется в базе и пополняется через Telegram-бота или вручную."
        footer={
          <div className="brief-actions">
            <button type="button" className="secondary-button" onClick={onRefresh}>
              Обновить
            </button>
            <button type="button" className="secondary-button" onClick={handleCreateNew} disabled={!project}>
              Новый бриф
            </button>
          </div>
        }
      >
        {renderBriefList()}
      </InfoCard>

      <InfoCard
        title="Редактор брифа"
        subtitle={
          project
            ? `Работаем с проектом «${project.name}». Эти поля попадут в пайплайны.`
            : 'Выберите проект, чтобы редактировать бриф.'
        }
      >
        <form className="form" onSubmit={handleSave}>
          <label>
            Название брифа
            <input
              name="briefTitle"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например, Запуск весенней кампании"
            />
          </label>
          <label>
            Цели кампании
            <textarea
              name="goals"
              rows={3}
              value={formState.goals}
              onChange={handleFieldChange}
              placeholder="Повысить узнаваемость, получить лиды, протестировать гипотезу..."
            />
          </label>
          <label>
            Целевая аудитория
            <textarea
              name="audience"
              rows={3}
              value={formState.audience}
              onChange={handleFieldChange}
              placeholder="Кто клиент, какие боли и мотивация?"
            />
          </label>
          <label>
            Предложение / оффер
            <textarea
              name="offer"
              rows={2}
              value={formState.offer}
              onChange={handleFieldChange}
              placeholder="Что предлагаем и чем отличаемся"
            />
          </label>
          <label>
            Тон и стиль
            <input
              name="tone"
              value={formState.tone}
              onChange={handleFieldChange}
              placeholder="Экспертный, дружелюбный, дерзкий..."
            />
          </label>
          <label>
            Ключевые сообщения
            <textarea
              name="keyMessages"
              rows={3}
              value={formState.keyMessages}
              onChange={handleFieldChange}
              placeholder="Главные тезисы, которые нужно донести"
            />
          </label>
          <label>
            Призыв к действию
            <input
              name="callToAction"
              value={formState.callToAction}
              onChange={handleFieldChange}
              placeholder="Оставить заявку, перейти в чат-бота, оформить заказ..."
            />
          </label>
          <label>
            Метрики успеха
            <input
              name="successMetrics"
              value={formState.successMetrics}
              onChange={handleFieldChange}
              placeholder="Лиды, продажи, CPL, CTR..."
            />
          </label>
          <label>
            Референсы / ссылки
            <textarea
              name="references"
              rows={2}
              value={formState.references}
              onChange={handleFieldChange}
              placeholder="Примеры кампаний, ссылки на материалы"
            />
          </label>
          <div className="brief-form__actions">
            <button type="submit" className="primary-button" disabled={!project || isSaving}>
              {isSaving ? 'Сохранение…' : 'Сохранить бриф'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleGeneratePlan}
              disabled={!project || isGenerating}
            >
              {isGenerating ? 'Формирование…' : 'Сформировать план'}
            </button>
          </div>
        </form>
      </InfoCard>

      <InfoCard
        title="План кампании"
        subtitle="Автоматически создаётся из заполненных ответов."
      >
        {planPreview ? (
          <pre className="brief-plan">{planPreview}</pre>
        ) : (
          <EmptyState
            title="План пока не сформирован"
            description="Нажмите «Сформировать план», чтобы получить последовательность шагов."
          />
        )}
        {selectedBrief?.metadata?.user ? (
          <p className="brief-meta">
            Источник: @{selectedBrief.metadata.user.username || selectedBrief.metadata.user.firstName || 'участник'}
          </p>
        ) : null}
      </InfoCard>
    </div>
  );
}

BriefPage.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string
  }),
  briefs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string,
      updatedAt: PropTypes.string,
      source: PropTypes.string,
      content: PropTypes.object,
      metadata: PropTypes.object
    })
  ),
  selectedBrief: PropTypes.shape({
    id: PropTypes.string,
    title: PropTypes.string,
    content: PropTypes.object,
    metadata: PropTypes.object
  }),
  onSelectBrief: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  onSaveBrief: PropTypes.func.isRequired,
  onGeneratePlan: PropTypes.func.isRequired,
  onNotify: PropTypes.func.isRequired
};
