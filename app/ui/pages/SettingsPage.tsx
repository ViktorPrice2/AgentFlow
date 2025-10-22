import { useState } from 'react';
import { useI18n } from '../hooks/useI18n.js';

interface SettingsPageProps {
  onSave(settings: { mockMode: boolean; locale: 'en' | 'ru'; askApproval: boolean }): void;
}

export function SettingsPage({ onSave }: SettingsPageProps) {
  const { locale, setLocale, t } = useI18n('en');
  const [mockMode, setMockMode] = useState(true);
  const [askApproval, setAskApproval] = useState(true);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-primary">{t('settings')}</h2>
      <div className="space-y-3">
        <label className="flex items-center justify-between">
          <span>Mock mode</span>
          <input type="checkbox" checked={mockMode} onChange={(event) => setMockMode(event.target.checked)} />
        </label>
        <label className="flex items-center justify-between">
          <span>Запрашивать подтверждение</span>
          <input
            type="checkbox"
            checked={askApproval}
            onChange={(event) => setAskApproval(event.target.checked)}
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-500">Locale</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as 'en' | 'ru')}
            className="mt-1 w-full rounded border border-slate-200 p-2"
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </label>
        <button
          className="rounded bg-primary px-4 py-2 font-medium text-white"
          onClick={() => onSave({ mockMode, locale, askApproval })}
        >
          {t('save')}
        </button>
      </div>
    </div>
  );
}
