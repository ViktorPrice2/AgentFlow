import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  fetchLatestBrief,
  generateBriefPlan,
  getTelegramStatus,
  isAgentApiAvailable,
  listAgents,
  listPipelines,
  listProviderStatus,
  listSchedules,
  runPipeline,
  upsertSchedule,
  setTelegramToken,
  startTelegramBot,
  stopTelegramBot,
  upsertPipeline,
  deleteSchedule,
  toggleSchedule,
  runScheduleNow,
  getSchedulerStatus
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
import { SchedulerPage } from './pages/SchedulerPage.jsx';
import { usePersistentState } from './hooks/usePersistentState.js';
import { VersionHistoryModal } from './components/VersionHistoryModal.jsx';
import { useI18n } from './i18n/useI18n.js';

const SECTION_CONFIG = [
  { id: 'projects', labelKey: 'app.nav.projects' },
  { id: 'brief', labelKey: 'app.nav.brief' },
  { id: 'agents', labelKey: 'app.nav.agents' },
  { id: 'pipelines', labelKey: 'app.nav.pipelines' },
  { id: 'runs', labelKey: 'app.nav.runs' },
  { id: 'reports', labelKey: 'app.nav.reports' },
  { id: 'scheduler', labelKey: 'app.nav.scheduler' },
  { id: 'settings', labelKey: 'app.nav.settings' }
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

function buildPipelineInput(project, brief, defaults) {
  return {
    project,
    brief,
    topic: brief?.goals?.split(/[.!?]/)[0]?.trim() || project?.name || defaults.topic,
    tone: brief?.tone || defaults.tone,
    message: brief?.keyMessages || defaults.message,
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

function useAgentResources(locale) {
  const [agentsData, setAgentsData] = useState({ plugins: [], configs: [] });
  const [providerStatus, setProviderStatus] = useState([]);
  const [providerUpdatedAt, setProviderUpdatedAt] = useState(null);

  const refreshAgents = useCallback(async () => {
    try {
      const [agents, providers] = await Promise.all([listAgents(), listProviderStatus()]);
      setAgentsData(agents);
      setProviderStatus(providers);
      const timestamp = new Date();
      setProviderUpdatedAt(timestamp.toLocaleString(locale));
    } catch (error) {
      console.error('Failed to load agent resources', error);
    }
  }, [locale]);

  useEffect(() => {
    refreshAgents();
  }, [refreshAgents]);

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
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
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
  const [schedules, setSchedules] = useState([]);
  const [schedulerStatusState, setSchedulerStatusState] = useState(null);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [versionModal, setVersionModal] = useState({
    open: false,
    entityType: null,
    entityId: null,
    entityName: ''
  });

  const sections = useMemo(
    () => SECTION_CONFIG.map((section) => ({ id: section.id, label: t(section.labelKey) })),
    [t]
  );

  const pipelineDefaults = useMemo(
    () => ({
      topic: t('app.defaults.topic'),
      tone: t('app.defaults.tone'),
      message: t('app.defaults.message')
    }),
    [t]
  );

  const { agentsData, providerStatus, providerUpdatedAt, refreshAgents } = useAgentResources(locale);
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

  useEffect(() => {
    loadSchedulerStatus().catch(() => {});
  }, []);

  useEffect(() => {
    loadSchedules(selectedProjectId).catch((error) => {
      showToast(error.message || t('app.toasts.schedulesLoadError'), 'error');
    });
  }, [selectedProjectId]);

  const handleRefreshBotStatus = async () => {
    await refreshBotStatus();
    showToast(t('app.toasts.telegramStatusUpdated'), 'info');
  };

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    if (message) {
      setTimeout(() => setToast({ message: null, type: 'info' }), 4000);
    }
  }, []);

  useEffect(() => {
    if (!window?.ErrorAPI?.subscribe) {
      return undefined;
    }

    const unsubscribe = window.ErrorAPI.subscribe((entry = {}) => {
      const level = entry.level || 'info';
      const fallbackKey =
        level === 'error' ? 'genericError' : level === 'warn' ? 'genericWarn' : 'genericInfo';
      const message = entry.message || t(`app.toasts.${fallbackKey}`);
      const toastType = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
      showToast(message, toastType);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [showToast, t]);

  const loadSchedulerStatus = async () => {
    try {
      const status = await getSchedulerStatus();
      setSchedulerStatusState(status);
      return status;
    } catch (error) {
      console.error('Failed to load scheduler status', error);
      throw error;
    }
  };

  const loadSchedules = async (projectId = selectedProjectId) => {
    setSchedulesLoading(true);

    try {
      const scheduleList = await listSchedules(projectId);
      setSchedules(scheduleList);
      return scheduleList;
    } catch (error) {
      console.error('Failed to load schedules', error);
      throw error;
    } finally {
      setSchedulesLoading(false);
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
      showToast(t('app.toasts.pipelineSaveError'), 'error');
    }
  };

  const handleRunPipeline = async (pipeline, context) => {
    try {
      const inputPayload = buildPipelineInput(context.project, context.brief, pipelineDefaults);
      const response = await runPipeline(pipeline, inputPayload);

      if (!response.ok) {
        throw new Error('Pipeline run failed');
      }

      const record = generateRunRecord(pipeline, response.result, context.project);
      setRuns((prev) => [record, ...prev].slice(0, 20));
      showToast(t('app.toasts.pipelineRun', { name: pipeline.name, status: record.status }), 'success');
    } catch (error) {
      console.error('Pipeline execution error', error);
      showToast(t('app.toasts.pipelineRunError'), 'error');
    }
  };

  const handleClearRuns = () => {
    setRuns([]);
    showToast(t('app.toasts.runsCleared'), 'info');
  };

  const closeVersionModal = () => {
    setVersionModal({ open: false, entityType: null, entityId: null, entityName: '' });
  };

  const handleShowAgentHistory = (agent) => {
    if (!agent?.id) {
      return;
    }

    setVersionModal({
      open: true,
      entityType: 'agent',
      entityId: agent.id,
      entityName: agent.name || agent.id
    });
  };

  const handleShowPipelineHistory = (pipeline) => {
    if (!pipeline?.id) {
      return;
    }

    setVersionModal({
      open: true,
      entityType: 'pipeline',
      entityId: pipeline.id,
      entityName: pipeline.name || pipeline.id
    });
  };

  const handleSaveBotToken = async (token) => {
    setBotBusy(true);

    try {
      const status = await setTelegramToken(token);
      setBotStatus(status);
      if (token?.trim()) {
        showToast(t('app.toasts.telegramTokenSaved'), 'success');
      } else {
        showToast(t('app.toasts.telegramTokenRemoved'), 'info');
      }
    } catch (error) {
      console.error('Failed to store Telegram token', error);
      showToast(error.message || t('app.toasts.telegramTokenError'), 'error');
    } finally {
      setBotBusy(false);
    }
  };

  const handleStartBot = async () => {
    setBotBusy(true);

    try {
      const status = await startTelegramBot();
      setBotStatus(status);
      showToast(t('app.toasts.telegramStarted'), 'success');
    } catch (error) {
      console.error('Failed to start Telegram bot', error);
      showToast(error.message || t('app.toasts.telegramStartError'), 'error');
    } finally {
      setBotBusy(false);
    }
  };

  const handleStopBot = async () => {
    setBotBusy(true);

    try {
      const status = await stopTelegramBot();
      setBotStatus(status);
      showToast(t('app.toasts.telegramStopped'), 'info');
    } catch (error) {
      console.error('Failed to stop Telegram bot', error);
      showToast(error.message || t('app.toasts.telegramStopError'), 'error');
    } finally {
      setBotBusy(false);
    }
  };

  const handleRefreshBriefFromBot = async () => {
    if (!selectedProject) {
      showToast(t('app.toasts.telegramProjectRequired'), 'warn');
      return;
    }

    setBriefLoading(true);

    try {
      const briefData = await fetchLatestBrief(selectedProject.id);
      setLatestBrief(briefData);

      if (briefData) {
        showToast(t('app.toasts.telegramBriefUpdated'), 'success');
      } else {
        showToast(t('app.toasts.telegramNoBrief'), 'info');
      }
    } catch (error) {
      console.error('Failed to load Telegram brief', error);
      showToast(error.message || t('app.toasts.telegramBriefError'), 'error');
    } finally {
      setBriefLoading(false);
    }
  };

  const handleImportBriefFromBot = () => {
    if (!latestBrief?.details) {
      showToast(t('app.toasts.telegramApplyEmpty'), 'warn');
      return;
    }

    const normalized = mapBriefDetails(latestBrief.details);
    setBrief(normalized);
    showToast(t('app.toasts.telegramApplied'), 'success');
  };

  const handleGeneratePlanFromBot = async () => {
    if (!selectedProject) {
      showToast(t('app.toasts.planProjectRequired'), 'warn');
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

        showToast(t('app.toasts.planReady'), 'success');
      } else {
        showToast(t('app.toasts.planMissingData'), 'warn');
      }
    } catch (error) {
      console.error('Failed to generate campaign plan', error);
      showToast(error.message || t('app.toasts.planError'), 'error');
    } finally {
      setPlanLoading(false);
    }
  };

  const handleRefreshSchedules = async () => {
    await Promise.all([loadSchedules(selectedProjectId), loadSchedulerStatus()]);
  };

  const handleSaveSchedule = async (schedule) => {
    try {
      const stored = await upsertSchedule(schedule);
      await handleRefreshSchedules();
      return stored;
    } catch (error) {
      await loadSchedulerStatus().catch(() => {});
      throw error;
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    try {
      await deleteSchedule(scheduleId);
      await handleRefreshSchedules();
    } catch (error) {
      await loadSchedulerStatus().catch(() => {});
      throw error;
    }
  };

  const handleToggleSchedule = async (scheduleId, enabled) => {
    try {
      await toggleSchedule(scheduleId, enabled);
      await handleRefreshSchedules();
    } catch (error) {
      await loadSchedulerStatus().catch(() => {});
      throw error;
    }
  };

  const handleRunScheduleNow = async (scheduleId) => {
    try {
      await runScheduleNow(scheduleId);
      await loadSchedulerStatus();
    } catch (error) {
      throw error;
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
            onShowHistory={handleShowAgentHistory}
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
            onShowHistory={handleShowPipelineHistory}
          />
        );
      case 'runs':
        return <RunsPage runs={runs} onClear={handleClearRuns} />;
      case 'reports':
        return <ReportsPage runs={runs} />;
      case 'scheduler':
        return (
          <SchedulerPage
            project={selectedProject}
            pipelines={pipelines}
            schedules={schedules}
            status={schedulerStatusState}
            onRefresh={handleRefreshSchedules}
            onSubmit={handleSaveSchedule}
            onDelete={handleDeleteSchedule}
            onToggle={handleToggleSchedule}
            onRunNow={handleRunScheduleNow}
            isLoading={schedulesLoading}
            onNotify={showToast}
          />
        );
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
    planLoading,
    schedules,
    schedulerStatusState,
    schedulesLoading
  ]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>{t('app.title')}</h1>
          <p>{t('app.tagline')}</p>
        </div>
      </header>

      <Navigation sections={sections} activeId={activeSection} onChange={setActiveSection} />

      <main className="app-main">{currentSection}</main>

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: null, type: 'info' })}
      />

      <VersionHistoryModal
        isOpen={versionModal.open}
        entityType={versionModal.entityType}
        entityId={versionModal.entityId}
        entityName={versionModal.entityName}
        onClose={closeVersionModal}
      />
    </div>
  );
}

export default App;
