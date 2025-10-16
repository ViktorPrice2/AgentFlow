import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { I18nProvider } from './i18n/useI18n.js';

if (typeof window !== 'undefined' && !window.__afErrorListenersAttached) {
  window.__afErrorListenersAttached = true;

  const report = (payload) => {
    if (window.ErrorAPI?.report) {
      window.ErrorAPI.report(payload);
    }
  };

  window.addEventListener('error', (event) => {
    report({
      level: 'error',
      message: event?.message || 'Renderer error',
      stack: event?.error?.stack,
      filename: event?.filename,
      lineno: event?.lineno,
      colno: event?.colno,
      type: 'window.onerror'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    report({
      level: 'error',
      message: reason?.message || 'Unhandled rejection',
      stack: reason?.stack,
      reason,
      type: 'window.unhandledrejection'
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
