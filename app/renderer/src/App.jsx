import { useState } from 'react';
import './App.css';

const TABS = [
  { id: 'projects', label: 'Проекты' },
  { id: 'agents', label: 'Агенты' },
  { id: 'settings', label: 'Настройки' }
];

function App() {
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const activeLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? '';

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>AgentFlow Desktop</h1>
        <p>Модульная платформа для маркетинговой автоматизации (заглушка)</p>
      </header>

      <nav className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${tab.id === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        <h2>{activeLabel}</h2>
        <p>Здесь появится функциональность для раздела «{activeLabel}» в следующих фазах.</p>
        <p className="note">Фаза 1: интерфейс загружен, можно продолжать разработку.</p>
      </main>
    </div>
  );
}

export default App;
