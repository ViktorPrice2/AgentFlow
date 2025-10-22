import { useState } from 'react';
import { useI18n } from '../hooks/useI18n.js';

interface WizardPageProps {
  onCreate(data: { title: string; goal: string; tone: string; contentTypes: string[] }): void;
}

export function WizardPage({ onCreate }: WizardPageProps) {
  const { t } = useI18n('ru');
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [tone, setTone] = useState('enthusiastic');
  const [contentTypes, setContentTypes] = useState<string[]>(['text']);

  const toggleContentType = (type: string) => {
    setContentTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-primary">{t('wizardTitle')}</h1>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm text-slate-500">Название кампании</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded border border-slate-200 p-2"
            placeholder="Весенняя распродажа"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-500">Цель</span>
          <textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            className="mt-1 w-full rounded border border-slate-200 p-2"
            rows={3}
            placeholder="Увеличить продажи на 30%"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-500">Тон</span>
          <select
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            className="mt-1 w-full rounded border border-slate-200 p-2"
          >
            <option value="enthusiastic">Энтузиазм</option>
            <option value="friendly">Дружелюбный</option>
            <option value="professional">Профессиональный</option>
          </select>
        </label>
        <fieldset className="rounded border border-slate-200 p-3">
          <legend className="text-sm text-slate-500">Типы контента</legend>
          {['text', 'image', 'video'].map((type) => (
            <label key={type} className="mr-4 inline-flex items-center space-x-2">
              <input
                type="checkbox"
                checked={contentTypes.includes(type)}
                onChange={() => toggleContentType(type)}
              />
              <span>{type}</span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 font-medium text-white"
          onClick={() => onCreate({ title, goal, tone, contentTypes })}
        >
          {t('start')}
        </button>
      </div>
    </div>
  );
}
