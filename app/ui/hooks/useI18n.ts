import { useMemo, useState } from 'react';

type Locale = 'en' | 'ru';

type Dictionary = Record<Locale, Record<string, string>>;

const dictionary: Dictionary = {
  en: {
    wizardTitle: 'Create marketing task',
    planPreview: 'Plan preview',
    progress: 'Progress',
    results: 'Results',
    settings: 'Settings',
    start: 'Start',
    save: 'Save'
  },
  ru: {
    wizardTitle: 'Создать маркетинговую задачу',
    planPreview: 'Предпросмотр плана',
    progress: 'Прогресс',
    results: 'Результаты',
    settings: 'Настройки',
    start: 'Запустить',
    save: 'Сохранить'
  }
};

export function useI18n(initialLocale: Locale = 'en') {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = useMemo(() => {
    return (key: string) => dictionary[locale][key] ?? key;
  }, [locale]);

  return { locale, setLocale, t };
}
