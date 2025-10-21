import { createContext, useContext, useEffect, useMemo } from 'react';
import en from './en.json';
import ru from './ru.json';
import { usePersistentState } from '../hooks/usePersistentState.js';

const dictionaries = { en, ru };
const E2E_STORAGE_KEY = 'af:e2e:mode';
const E2E_BRIDGE_CHANNEL = 'af:e2e:bridge';

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

function isE2ETestMode() {
  try {
    return globalThis.sessionStorage?.getItem(E2E_STORAGE_KEY) === '1';
  } catch (error) {
    return false;
  }
}

export function I18nProvider({ children }) {
  const defaultLanguage = isE2ETestMode() ? 'en' : 'ru';
  const [language, setLanguage] = usePersistentState('af.language', defaultLanguage);

  useEffect(() => {
    if (!isE2ETestMode()) {
      return () => {};
    }

    const handler = (event) => {
      if (!isE2ETestMode()) {
        return;
      }

      const payload = event?.data;
      if (!payload || payload.bridge !== E2E_BRIDGE_CHANNEL) {
        return;
      }

      if (payload.type === 'SET_LANG') {
        const next = payload.lang === 'en' ? 'en' : 'ru';
        setLanguage(next);
      }
    };

    globalThis.addEventListener('message', handler);
    return () => globalThis.removeEventListener('message', handler);
  }, [setLanguage]);

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
