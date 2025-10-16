import { useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  fetchLatestBrief,
  generateBriefPlan,
  getTelegramStatus,
  isAgentApiAvailable,
  listAgents,
  listPipelines,
  listProviderStatus,
  runPipeline,
  setTelegramToken,
  startTelegramBot,
  stopTelegramBot,
  upsertPipeline
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

const BRIEF_FIELDS = [
  'goals',
  'audience',
  'offer',
  'tone',
  'keyMessages',
  'callToAction',
  'successMetrics',
  'references'
];

function mapBriefDetails(details = {}) {
  return BRIEF_FIELDS.reduce((acc, key) => {
    acc[key] = details[key] ?? '';
    return acc;
  }, {});
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
  const [brief, setBrief] = usePersistentState('af.brief', {});
  const [runs, setRuns] = usePersistentState('af.runs', []);
  const [botStatus, setBotStatus] = useState(null);
  const [botBusy, setBotBusy] = useState(false);
  const [latestBrief, setLatestBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [planDraft, setPlanDraft] = useState({ text: '', updatedAt: null });
  const [planLoading, setPlanLoading] = useState(false);

  const { agentsData, providerStatus, providerUpdatedAt, refreshAgents } = useAgentResources();
  const { pipelines, refreshPipelines } = usePipelineResources();

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProject, setSelectedProjectId]);

  const refreshBotStatus = async () => {
    try {
      const status = await getTelegramStatus();
      setBotStatus(status);
    } catch (error) {
      console.error('Failed to load Telegram bot status', error);
    }
  };

  useEffect(() => {
    refreshBotStatus();
  }, []);

  useEffect(() => {
    setPlanDraft({ text: '', updatedAt: null });
    setLatestBrief(null);
  }, [selectedProjectId]);

  const handleRefreshBotStatus = async () => {
    await refreshBotStatus();
    showToast('Статус Telegram обновлён', 'info');
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    if (message) {
      setTimeout(() => setToast({ message: null, type: 'info' }), 4000);
    }
  };

  const handleCreateProject = (project) => {
    setProjects((prev) => {
      const filtered = prev.filter((item) => item.id !== project.id);
      filtered.push(project);
      return filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  };

  const handleUpdateBrief = (nextBrief) => {
    setBrief(nextBrief);
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

  const handleSaveBotToken = async (token) => {
    setBotBusy(true);

    try {
      const status = await setTelegramToken(token);
      setBotStatus(status);
      if (token?.trim()) {
        showToast('Токен Telegram сохранён', 'success');
      } else {
        showToast('Токен Telegram удалён', 'info');
      }
    } catch (error) {
      console.error('Failed to store Telegram token', error);
      showToast(error.message || 'Не удалось сохранить токен Telegram', 'error');
    } finally {
      setBotBusy(false);
    }
  };

  const handleStartBot = async () => {
    setBotBusy(true);

    try {
      const status = await startTelegramBot();
      setBotStatus(status);
      showToast('Telegram-бот запущен', 'success');
    } catch (error) {
      console.error('Failed to start Telegram bot', error);
      showToast(error.message || 'Не удалось запустить Telegram-бота', 'error');
    } finally {
      setBotBusy(false);
    }
  };

  const handleStopBot = async () => {
    setBotBusy(true);

    try {
      const status = await stopTelegramBot();
      setBotStatus(status);
      showToast('Telegram-бот остановлен', 'info');
    } catch (error) {
      console.error('Failed to stop Telegram bot', error);
      showToast(error.message || 'Не удалось остановить Telegram-бота', 'error');
    } finally {
      setBotBusy(false);
    }
  };

  const handleRefreshBriefFromBot = async () => {
    if (!selectedProject) {
      showToast('Выберите проект, чтобы получить бриф из Telegram', 'warn');
      return;
    }

    setBriefLoading(true);

    try {
      const briefData = await fetchLatestBrief(selectedProject.id);
      setLatestBrief(briefData);

      if (briefData) {
        showToast('Бриф из Telegram обновлён', 'success');
      } else {
        showToast('Для проекта пока нет новых брифов', 'info');
      }
    } catch (error) {
      console.error('Failed to load Telegram brief', error);
      showToast(error.message || 'Не удалось получить бриф из Telegram', 'error');
    } finally {
      setBriefLoading(false);
    }
  };

  const handleImportBriefFromBot = () => {
    if (!latestBrief?.details) {
      showToast('Нет данных для применения — обновите бриф из Telegram', 'warn');
      return;
    }

    const normalized = mapBriefDetails(latestBrief.details);
    setBrief(normalized);
    showToast('Форма брифа обновлена данными из Telegram', 'success');
  };

  const handleGeneratePlanFromBot = async () => {
    if (!selectedProject) {
      showToast('Выберите проект, чтобы сформировать план', 'warn');
      return;
    }

    setPlanLoading(true);

    try {
      const result = await generateBriefPlan(selectedProject.id);

      if (result?.plan) {
        setPlanDraft({ text: result.plan, updatedAt: new Date().toISOString() });

        if (result.brief) {
          setLatestBrief(result.brief);
        }

        showToast('План кампании готов', 'success');
      } else {
        showToast('Недостаточно данных для плана — заполните бриф', 'warn');
      }
    } catch (error) {
      console.error('Failed to generate campaign plan', error);
      showToast(error.message || 'Не удалось сформировать план кампании', 'error');
    } finally {
      setPlanLoading(false);
    }
  };

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
            latestBrief={latestBrief}
            planText={planDraft.text}
            telegramStatus={botStatus}
            onUpdateBrief={handleUpdateBrief}
            onNotify={showToast}
            onRefreshBrief={handleRefreshBriefFromBot}
            onImportBrief={handleImportBriefFromBot}
            onGeneratePlan={handleGeneratePlanFromBot}
            isRefreshing={briefLoading}
            isGenerating={planLoading}
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
            botStatus={botStatus}
            onSaveToken={handleSaveBotToken}
            onStartBot={handleStartBot}
            onStopBot={handleStopBot}
            onRefreshBot={handleRefreshBotStatus}
            botBusy={botBusy}
          />
        );
    }
  }, [
    activeSection,
    agentsData,
    brief,
    pipelines,
    projects,
    providerStatus,
    providerUpdatedAt,
    runs,
    selectedProject,
    selectedProjectId,
    botStatus,
    botBusy,
    latestBrief,
    planDraft,
    briefLoading,
    planLoading
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
