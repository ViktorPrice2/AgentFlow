import { createContext, useContext, useMemo } from 'react';
import en from './en.json';
import ru from './ru.json';
import { usePersistentState } from '../hooks/usePersistentState.js';

const dictionaries = { en, ru };

const I18nContext = createContext(null);

function resolveTranslation(dictionary, keyPath) {
  return keyPath.split('.').reduce((acc, segment) => {
    if (acc && typeof acc === 'object') {
      return acc[segment];
    }

    return undefined;
  }, dictionary);
}

function formatTemplate(template, values = {}) {
  if (typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, token) => {
    if (Object.prototype.hasOwnProperty.call(values, token)) {
      const value = values[token];
      return value === undefined || value === null ? '' : String(value);
    }

    return match;
  });
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = usePersistentState('af.language', 'ru');

  const value = useMemo(() => {
    const dictionary = dictionaries[language] || dictionaries.ru;

    const translate = (key, values, fallback) => {
      const resolved = key ? resolveTranslation(dictionary, key) : undefined;
      const template = resolved ?? fallback ?? key;
      return formatTemplate(template, values);
    };

    const changeLanguage = (nextLanguage) => {
      const normalized = nextLanguage === 'en' ? 'en' : 'ru';
      setLanguage(normalized);
    };

    return {
      language: language === 'en' ? 'en' : 'ru',
      setLanguage: changeLanguage,
      t: translate
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }

  return context;
}
