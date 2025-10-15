import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  isAgentApiAvailable,
  listAgents,
  listPipelines,
  listProviderStatus,
  runPipeline,
  upsertPipeline,
  getTelegramStatus,
  setTelegramToken,
  startTelegramBot,
  stopTelegramBot,
  onBriefUpdated,
  fetchLatestBrief
} from './api/agentApi.js';
import { Navigation } from './components/Navigation.jsx';
import { Toast } from './components/Toast.jsx';
import { ProjectsPage } from './pages/ProjectsPage.jsx';
import { BriefPage } from './pages/BriefPage.jsx';
import { AgentsPage } from './pages/AgentsPage.jsx';
import { PipelinesPage } from './pages/PipelinesPage.jsx';
import { RunsPage } from './pages/RunsPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { usePersistentState } from './hooks/usePersistentState.js';

const SECTIONS = [
  { id: 'projects', label: 'Проекты' },
  { id: 'brief', label: 'Бриф' },
  { id: 'agents', label: 'Агенты' },
  { id: 'pipelines', label: 'Пайплайны' },
  { id: 'runs', label: 'Запуски' },
  { id: 'reports', label: 'Отчёты' },
  { id: 'settings', label: 'Настройки' }
];

const AGENT_ONLINE = isAgentApiAvailable();

const EMPTY_BRIEF = {
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

function buildPlanFromBrief(briefData = {}) {
  const lines = [];

  if (briefData.goals) {
    lines.push(`Цели: ${briefData.goals}`);
  }
  if (briefData.audience) {
    lines.push(`Аудитория: ${briefData.audience}`);
  }
  if (briefData.offer) {
    lines.push(`Оффер: ${briefData.offer}`);
  }
  if (briefData.keyMessages) {
    lines.push(`Ключевые сообщения: ${briefData.keyMessages}`);
  }
  if (briefData.callToAction) {
    lines.push(`Призыв к действию: ${briefData.callToAction}`);
  }
  if (briefData.successMetrics) {
    lines.push(`Метрики: ${briefData.successMetrics}`);
  }
  if (briefData.references) {
    lines.push(`Референсы: ${briefData.references}`);
  }
  if (briefData.budget) {
    lines.push(`Бюджет: ${briefData.budget}`);
  }

  return lines.join('\n');
}

const DEFAULT_TELEGRAM_STATUS = {
  ok: true,
  status: {
    status: 'idle',
    startedAt: null,
    username: null,
    botId: null,
    lastError: null,
    sessions: 0,
    restartPlanned: false
  },
  hasToken: false
};

function generateRunRecord(pipeline, result, project) {
  const timestamp = new Date().toISOString();
  const artifacts = Array.isArray(result.payload?._artifacts) ? result.payload._artifacts : [];
  const summary =
    result.nodes?.find((node) => node.status === 'completed' && node.outputSummary)?.outputSummary ||
    result.payload?.summary ||
    '';

  return {
    id: result.runId || `${pipeline.id}-${timestamp}`,
    pipelineName: pipeline.name,
    projectName: project?.name || null,
    status: result.status || 'unknown',
    artifacts,
    summary,
    timestamp
  };
}

function buildPipelineInput(project, brief) {
  return {
    project,
    brief,
    topic: brief?.goals?.split(/[.!?]/)[0]?.trim() || project?.name || 'Маркетинговая активность',
    tone: brief?.tone || 'Нейтральный',
    message: brief?.keyMessages || 'Сообщения не заданы',
    audience: brief?.audience || '',
    callToAction: brief?.callToAction || ''
  };
}

function useAgentResources() {
  const [agentsData, setAgentsData] = useState({ plugins: [], configs: [] });
  const [providerStatus, setProviderStatus] = useState([]);
  const [providerUpdatedAt, setProviderUpdatedAt] = useState(null);

  const refreshAgents = async () => {
    try {
      const [agents, providers] = await Promise.all([listAgents(), listProviderStatus()]);
      setAgentsData(agents);
      setProviderStatus(providers);
      setProviderUpdatedAt(new Date().toLocaleString('ru-RU'));
    } catch (error) {
      console.error('Failed to load agent resources', error);
    }
  };

  useEffect(() => {
    refreshAgents();
  }, []);

  return {
    agentsData,
    providerStatus,
    providerUpdatedAt,
    refreshAgents
  };
}

function usePipelineResources() {
  const [pipelines, setPipelines] = useState([]);

  const refreshPipelines = async () => {
    try {
      const serverPipelines = await listPipelines();
      setPipelines(serverPipelines);
    } catch (error) {
      console.error('Failed to load pipelines', error);
    }
  };

  useEffect(() => {
    refreshPipelines();
  }, []);

  return {
    pipelines,
    refreshPipelines
  };
}

function App() {
  const [activeSection, setActiveSection] = useState('projects');
  const [toast, setToast] = useState({ message: null, type: 'info' });

  const [projects, setProjects] = usePersistentState('af.projects', []);
  const [selectedProjectId, setSelectedProjectId] = usePersistentState('af.selectedProject', null);
  const [brief, setBrief] = usePersistentState('af.brief', EMPTY_BRIEF);
  const [runs, setRuns] = usePersistentState('af.runs', []);
  const [telegramStatus, setTelegramStatus] = useState(DEFAULT_TELEGRAM_STATUS);
  const [telegramBrief, setTelegramBrief] = useState(null);
  const [planText, setPlanText] = useState('');

  const { agentsData, providerStatus, providerUpdatedAt, refreshAgents } = useAgentResources();
  const { pipelines, refreshPipelines } = usePipelineResources();

  const refreshTelegramStatus = useCallback(async () => {
    if (!AGENT_ONLINE) {
      setTelegramStatus(DEFAULT_TELEGRAM_STATUS);
      return;
    }

    try {
      const response = await getTelegramStatus();
      setTelegramStatus(response);
    } catch (error) {
      console.error('Failed to load Telegram status', error);
    }
  }, []);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProject, setSelectedProjectId]);

  useEffect(() => {
    refreshTelegramStatus();
  }, [refreshTelegramStatus]);

  useEffect(() => {
    if (!AGENT_ONLINE) {
      return () => {};
    }

    const unsubscribe = onBriefUpdated(async (payload) => {
      if (payload?.projectId !== selectedProjectId) {
        return;
      }

      await syncTelegramBrief(true);
      showToast('Бриф из Telegram обновлён', 'info');
    });

    return unsubscribe;
  }, [selectedProjectId, showToast, syncTelegramBrief]);

  useEffect(() => {
    if (!selectedProjectId) {
      setTelegramBrief(null);
      return;
    }

    syncTelegramBrief(true);
  }, [selectedProjectId, syncTelegramBrief]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    if (message) {
      setTimeout(() => setToast({ message: null, type: 'info' }), 4000);
    }
  }, []);

  const handleCreateProject = (project) => {
    setProjects((prev) => {
      const filtered = prev.filter((item) => item.id !== project.id);
      filtered.push(project);
      return filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  };

  const handleUpdateBrief = (nextBrief) => {
    setBrief({ ...EMPTY_BRIEF, ...nextBrief });
  };

  const handleCreatePipeline = async (pipeline) => {
    if (!pipeline) {
      return;
    }

    try {
      await upsertPipeline(pipeline);
      await refreshPipelines();
    } catch (error) {
      console.error('Failed to create pipeline', error);
      showToast('Не удалось сохранить пайплайн', 'error');
    }
  };

  const handleRunPipeline = async (pipeline, context) => {
    try {
      const inputPayload = buildPipelineInput(context.project, context.brief);
      const response = await runPipeline(pipeline, inputPayload);

      if (!response.ok) {
        throw new Error('Pipeline run failed');
      }

      const record = generateRunRecord(pipeline, response.result, context.project);
      setRuns((prev) => [record, ...prev].slice(0, 20));
      showToast(`Пайплайн «${pipeline.name}» выполнен (${record.status})`, 'success');
    } catch (error) {
      console.error('Pipeline execution error', error);
      showToast('Ошибка запуска пайплайна', 'error');
    }
  };

  const handleClearRuns = () => {
    setRuns([]);
    showToast('История запусков очищена', 'info');
  };

  const syncTelegramBrief = useCallback(
    async (silent = false) => {
      if (!selectedProjectId) {
        setTelegramBrief(null);
        if (!silent) {
          showToast('Выберите проект, чтобы получить бриф из Telegram', 'info');
        }
        return { ok: false };
      }

      try {
        const response = await fetchLatestBrief(selectedProjectId);
        if (response?.brief) {
          const answers = response.brief.payload?.answers || {};
          setBrief({ ...EMPTY_BRIEF, ...answers });
          setTelegramBrief(response.brief);
          if (!silent) {
            showToast('Бриф обновлён из Telegram', 'success');
          }
          return { ok: true, brief: response.brief };
        }

        setTelegramBrief(null);
        if (!silent) {
          showToast('Для выбранного проекта ещё нет брифа из Telegram', 'info');
        }
        return { ok: false };
      } catch (error) {
        console.error('Failed to fetch Telegram brief', error);
        if (!silent) {
          showToast('Не удалось получить бриф из Telegram', 'error');
        }
        return { ok: false, error };
      }
    },
    [selectedProjectId, setBrief, setTelegramBrief, showToast]
  );

  const handleRefreshTelegramBrief = useCallback(() => {
    syncTelegramBrief(false);
  }, [syncTelegramBrief]);

  const handleGeneratePlan = useCallback(
    (source) => {
      const base = source?.answers || source || brief;
      const merged = { ...EMPTY_BRIEF, ...base };
      const plan = buildPlanFromBrief(merged);
      setPlanText(plan);
      showToast('План сформирован', 'success');
    },
    [brief, showToast]
  );

  const handleTelegramTokenSave = useCallback(
    async (token) => {
      try {
        await setTelegramToken(token);
        await refreshTelegramStatus();
        showToast(token ? 'Токен сохранён' : 'Токен очищен', 'success');
      } catch (error) {
        console.error('Failed to store Telegram token', error);
        showToast('Не удалось сохранить токен Telegram', 'error');
      }
    },
    [refreshTelegramStatus, showToast]
  );

  const handleTelegramStart = useCallback(async () => {
    try {
      await startTelegramBot();
      await refreshTelegramStatus();
      showToast('Telegram-бот запущен', 'success');
    } catch (error) {
      console.error('Failed to start Telegram bot', error);
      showToast('Ошибка запуска Telegram-бота', 'error');
    }
  }, [refreshTelegramStatus, showToast]);

  const handleTelegramStop = useCallback(async () => {
    try {
      await stopTelegramBot();
      await refreshTelegramStatus();
      showToast('Telegram-бот остановлен', 'info');
    } catch (error) {
      console.error('Failed to stop Telegram bot', error);
      showToast('Не удалось остановить Telegram-бот', 'error');
    }
  }, [refreshTelegramStatus, showToast]);

  const handleCopyDeeplink = useCallback(async () => {
    const username = telegramStatus?.status?.username;
    if (!username || !selectedProjectId) {
      showToast('Запустите бота и выберите проект для deeplink', 'info');
      return;
    }

    const deeplink = `https://t.me/${username}?start=${encodeURIComponent(`project=${selectedProjectId}`)}`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(deeplink);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      showToast('Ссылка скопирована в буфер обмена', 'success');
    } catch (error) {
      console.warn('Clipboard copy failed', error);
      window.prompt('Скопируйте ссылку вручную', deeplink);
    }
  }, [selectedProjectId, showToast, telegramStatus]);

  const currentSection = useMemo(() => {
    switch (activeSection) {
      case 'projects':
        return (
          <ProjectsPage
            projects={projects}
            selectedProjectId={selectedProjectId}
            onCreateProject={handleCreateProject}
            onSelectProject={setSelectedProjectId}
            onNotify={showToast}
          />
        );
      case 'brief':
        return (
          <BriefPage
            project={selectedProject}
            brief={brief}
            onUpdateBrief={handleUpdateBrief}
            onNotify={showToast}
            telegramBrief={telegramBrief}
            onRefreshTelegramBrief={handleRefreshTelegramBrief}
            onGeneratePlan={handleGeneratePlan}
            planText={planText}
          />
        );
      case 'agents':
        return (
          <AgentsPage
            agentsData={agentsData}
            providerStatus={providerStatus}
            onRefresh={refreshAgents}
            lastUpdated={providerUpdatedAt}
          />
        );
      case 'pipelines':
        return (
          <PipelinesPage
            pipelines={pipelines}
            project={selectedProject}
            brief={brief}
            onCreatePipeline={handleCreatePipeline}
            onRunPipeline={handleRunPipeline}
            onRefresh={refreshPipelines}
            isAgentOnline={AGENT_ONLINE}
            onNotify={showToast}
          />
        );
      case 'runs':
        return <RunsPage runs={runs} onClear={handleClearRuns} />;
      case 'reports':
        return <ReportsPage runs={runs} />;
      case 'settings':
      default:
        return (
          <SettingsPage
            providerStatus={providerStatus}
            apiAvailable={AGENT_ONLINE}
            onRefresh={refreshAgents}
            telegramStatus={telegramStatus}
            onTelegramTokenSave={handleTelegramTokenSave}
            onTelegramStart={handleTelegramStart}
            onTelegramStop={handleTelegramStop}
            onCopyDeeplink={handleCopyDeeplink}
            selectedProjectId={selectedProjectId}
          />
        );
    }
  }, [
    activeSection,
    agentsData,
    brief,
    handleCopyDeeplink,
    handleGeneratePlan,
    handleRefreshTelegramBrief,
    handleTelegramStart,
    handleTelegramStop,
    handleTelegramTokenSave,
    pipelines,
    projects,
    providerStatus,
    providerUpdatedAt,
    runs,
    selectedProject,
    selectedProjectId,
    telegramBrief,
    telegramStatus,
    planText
  ]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>AgentFlow Desktop</h1>
          <p>Модульная платформа для AI-маркетинга. Все настройки выполняются через интерфейс.</p>
        </div>
      </header>

      <Navigation sections={SECTIONS} activeId={activeSection} onChange={setActiveSection} />

      <main className="app-main">{currentSection}</main>

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: null, type: 'info' })}
      />
    </div>
  );
}

export default App;
