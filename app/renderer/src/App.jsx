import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  fetchLatestBrief,
  subscribeToBriefUpdates,
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
  tailTelegramLog,
  getTelegramProxyConfig,
  setTelegramProxyConfig,
  subscribeToTelegramStatus,
  normalizeBotStatus,
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
import { useI18n } from './i18n/useI18n.jsx';
import { useTheme } from './theme/ThemeProvider.jsx';
import { LogsPanel } from './components/LogsPanel.jsx';

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
  const answers = details && typeof details.answers === 'object' ? details.answers : {};

  return BRIEF_FIELDS.reduce((acc, key) => {
    const value =
      details[key] !== undefined && details[key] !== null
        ? details[key]
        : answers[key] !== undefined && answers[key] !== null
          ? answers[key]
          : '';

    acc[key] = value;
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
  const { theme, setTheme } = useTheme();
  const locale = language === 'en' ? 'en-US' : 'ru-RU';
  const [activeSection, setActiveSection] = useState('projects');
  const [toast, setToast] = useState({ message: null, type: 'info' });
  const [logEntries, setLogEntries] = useState([]);
  const [isLogPanelOpen, setLogPanelOpen] = usePersistentState('af.logs.open', false);
  const [unreadLogs, setUnreadLogs] = useState(0);
  const toastTimerRef = useRef(null);

  const [projects, setProjects] = usePersistentState('af.projects', []);
  const [selectedProjectId, setSelectedProjectId] = usePersistentState('af.selectedProject', null);
  const [brief, setBrief] = usePersistentState('af.brief', {});
  const [projectTokens, setProjectTokens] = usePersistentState('af.telegramTokens', {});
  const [runs, setRuns] = usePersistentState('af.runs', []);
  const [botStatus, setBotStatus] = useState(null);
  const [botBusy, setBotBusy] = useState(false);
  const botBusyRef = useRef(false);
  const lastErrorRef = useRef(null);
  const lastStatusRef = useRef(null);
  const statusChangeOriginRef = useRef('external');
  const restoreTokenRef = useRef(false);
  const [botLogEntries, setBotLogEntries] = useState([]);
  const [botLogLoading, setBotLogLoading] = useState(false);
  const [proxyValue, setProxyValue] = useState('');
  const [proxyBusy, setProxyBusy] = useState(false);
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (isLogPanelOpen) {
      setUnreadLogs(0);
    }
  }, [isLogPanelOpen]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    },
    []
  );

  const pushLogEntry = useCallback(
    (entry) => {
      setLogEntries((previous) => {
        const normalized = {
          id: entry.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          level: entry.level || 'info',
          message: entry.message || '',
          source: entry.source || 'ui',
          details: entry.details ?? null,
          timestamp: entry.timestamp || new Date().toISOString()
        };

        const next = [normalized, ...previous];
        return next.slice(0, 200);
      });

      setUnreadLogs((count) => (isLogPanelOpen ? 0 : Math.min(count + 1, 999)));
    },
    [isLogPanelOpen]
  );

  const resolveMessage = useCallback(
    (message) => t(message, undefined, message),
    [t]
  );

  const showToast = useCallback(
    (message, type = 'info', meta) => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }

      setToast({ message, type });

      if (message) {
        toastTimerRef.current = setTimeout(() => {
          setToast({ message: null, type: 'info' });
          toastTimerRef.current = null;
        }, 4000);

        pushLogEntry({
          level: type,
          message,
          source: meta?.source || 'ui',
          details: meta?.details ?? meta ?? null,
          timestamp: new Date().toISOString()
        });
      }
    },
    [pushLogEntry]
  );

  const loadProxyConfig = useCallback(async () => {
    try {
      const config = await getTelegramProxyConfig();
      const normalized = typeof config?.httpsProxy === 'string' ? config.httpsProxy.trim() : '';
      setProxyValue(normalized);
      return normalized;
    } catch (error) {
      console.error('Failed to load Telegram proxy config', error);
      showToast(resolveMessage(error.message) || t('app.toasts.telegramProxyLoadError'), 'error', {
        source: 'telegram',
        details: { scope: 'proxy', message: error?.message }
      });
      setProxyValue('');
      return '';
    }
  }, [resolveMessage, showToast, t]);

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

  const setBotBusyState = useCallback((busy) => {
    botBusyRef.current = busy;
    setBotBusy(busy);
  }, []);

  const refreshBotStatus = useCallback(async (origin = 'external') => {
    try {
      const status = await getTelegramStatus();
      statusChangeOriginRef.current = origin;
      setBotStatus(status);
    } catch (error) {
      console.error('Failed to load Telegram bot status', error);
    }
  }, [getTelegramStatus]);

  useEffect(() => {
    refreshBotStatus();
    loadProxyConfig().catch(() => {});
  }, [refreshBotStatus, loadProxyConfig]);

  useEffect(() => {
    const unsubscribe = subscribeToTelegramStatus((payload = {}) => {
      const snapshot = normalizeBotStatus(payload);
      statusChangeOriginRef.current = 'external';
      setBotStatus(snapshot);

      if (snapshot.status === 'starting') {
        setBotBusyState(true);
      } else if (botBusyRef.current) {
        setBotBusyState(false);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [setBotBusyState, subscribeToTelegramStatus, normalizeBotStatus]);

  useEffect(() => {
    if (!botStatus) {
      lastErrorRef.current = null;
      lastStatusRef.current = null;
      return;
    }

    const origin = statusChangeOriginRef.current;
    const currentError = botStatus.lastError || null;
    if (currentError && currentError !== lastErrorRef.current && origin === 'external') {
      showToast(resolveMessage(currentError), 'error', {
        source: 'telegram',
        details: { status: botStatus.status, error: currentError }
      });
    }

    if (botStatus.status !== lastStatusRef.current && lastStatusRef.current && origin === 'external') {
      if (botStatus.status === 'running' && lastStatusRef.current && lastStatusRef.current !== 'running') {
        showToast(t('app.toasts.telegramStarted'), 'success', {
          source: 'telegram',
          details: { status: botStatus.status }
        });
      } else if (botStatus.status === 'stopped' && lastStatusRef.current && lastStatusRef.current !== 'stopped') {
        showToast(t('app.toasts.telegramStopped'), 'info', {
          source: 'telegram',
          details: { status: botStatus.status }
        });
      }
    }

    lastErrorRef.current = currentError;
    lastStatusRef.current = botStatus.status;
    statusChangeOriginRef.current = 'external';
  }, [botStatus, resolveMessage, showToast, t]);

  useEffect(() => {
    setPlanDraft({ text: '', updatedAt: null });
    setLatestBrief(null);
  }, [selectedProjectId]);

  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeToBriefUpdates(async (payload = {}) => {
      if (payload?.error) {
        showToast(
          resolveMessage(payload.message) || t('app.toasts.telegramBriefError'),
          'error',
          { source: 'telegram', details: payload }
        );
        return;
      }

      const { projectId } = payload;

      if (selectedProjectId && projectId === selectedProjectId) {
        setBriefLoading(true);
        try {
          const briefData = await fetchLatestBrief(projectId);
          if (active) {
            setLatestBrief(briefData);
          }
        } catch (error) {
          if (active) {
            console.error('Failed to refresh brief after Telegram update', error);
          }
        } finally {
          if (active) {
            setBriefLoading(false);
          }
        }
      }

      showToast(t('app.toasts.telegramBriefUpdated'), 'success', {
        source: 'telegram',
        details: payload
      });
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [selectedProjectId, showToast, fetchLatestBrief, subscribeToBriefUpdates, t, resolveMessage]);

  useEffect(() => {
    loadSchedulerStatus().catch(() => {});
  }, []);

  useEffect(() => {
    loadSchedules(selectedProjectId).catch((error) => {
      showToast(error.message || t('app.toasts.schedulesLoadError'), 'error');
    });
  }, [selectedProjectId]);

  const handleRefreshBotStatus = async () => {
    await refreshBotStatus('external');
    await loadProxyConfig();
    showToast(t('app.toasts.telegramStatusUpdated'), 'info');
  };

  const handleSaveProxy = useCallback(
    async (proxy) => {
      setProxyBusy(true);

      try {
        const nextConfig = await setTelegramProxyConfig({ httpsProxy: proxy ?? '' });
        const normalized = nextConfig?.httpsProxy ?? '';
        setProxyValue(normalized);

        const trimmed = (proxy ?? '').trim();
        showToast(
          trimmed
            ? t('app.toasts.telegramProxySaved')
            : t('app.toasts.telegramProxyCleared'),
          'success'
        );
      } catch (error) {
        console.error('Failed to save Telegram proxy config', error);
        showToast(resolveMessage(error.message) || t('app.toasts.telegramProxyError'), 'error');
      } finally {
        setProxyBusy(false);
      }
    },
    [resolveMessage, showToast, t]
  );

  const handleTailBotLog = useCallback(async () => {
    setBotLogLoading(true);

    try {
      const lines = await tailTelegramLog(20);
      setBotLogEntries(Array.isArray(lines) ? lines : []);

      if (!lines || lines.length === 0) {
        showToast(t('app.toasts.telegramLogEmpty'), 'info');
      }
    } catch (error) {
      console.error('Failed to load Telegram bot log', error);
      showToast(resolveMessage(error.message) || t('app.toasts.telegramLogError'), 'error');
    } finally {
      setBotLogLoading(false);
    }
  }, [resolveMessage, showToast, t, tailTelegramLog]);

  const handleToggleLogs = useCallback(() => {
    setLogPanelOpen((previous) => {
      const next = !previous;
      if (next) {
        setUnreadLogs(0);
      }
      return next;
    });
  }, [setLogPanelOpen]);

  const handleClearLogs = useCallback(() => {
    setLogEntries([]);
    setUnreadLogs(0);
  }, []);

  const handleCloseLogs = useCallback(() => {
    setLogPanelOpen(false);
    setUnreadLogs(0);
  }, [setLogPanelOpen]);

  const handleThemeChange = useCallback(
    (nextTheme) => {
      const normalized = nextTheme === 'dark' ? 'dark' : 'light';
      setTheme(normalized);
      showToast(t('app.toasts.themeChanged', { theme: t(`app.theme.${normalized}`) }), 'info', {
        source: 'ui',
        details: { theme: normalized }
      });
    },
    [setTheme, showToast, t]
  );

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
      showToast(message, toastType, { source: 'error-bus', details: entry });
      if (level === 'error') {
        setLogPanelOpen(true);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [showToast, t, setLogPanelOpen]);
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

  const handleSaveBotToken = useCallback(
    async (token, options = {}) => {
      const { remember = true, silent = false } = options;
      const trimmed = token?.trim() ?? '';
      setBotBusyState(true);

      try {
        const status = await setTelegramToken(trimmed);
        statusChangeOriginRef.current = 'local';
        setBotStatus(status);

        if (remember) {
          setProjectTokens((previous) => {
            const next = { ...previous };

            if (selectedProjectId) {
              if (trimmed) {
                next[selectedProjectId] = trimmed;
              } else {
                delete next[selectedProjectId];
              }
            }

            if (trimmed) {
              next.__last = trimmed;
            } else {
              delete next.__last;
            }

            return next;
          });
        }

        if (!silent) {
          if (trimmed) {
            showToast(t('app.toasts.telegramTokenSaved'), 'success');
          } else {
            showToast(t('app.toasts.telegramTokenRemoved'), 'info');
          }
        }
      } catch (error) {
        console.error('Failed to store Telegram token', error);
        if (!silent) {
          showToast(resolveMessage(error.message) || t('app.toasts.telegramTokenError'), 'error');
        }
        await refreshBotStatus('local');
      } finally {
        setBotBusyState(false);
      }
    },
    [
      selectedProjectId,
      setBotBusyState,
      setBotStatus,
      setProjectTokens,
      showToast,
      t,
      resolveMessage,
      refreshBotStatus
    ]
  );

  const handleStartBot = async () => {
    setBotBusyState(true);

    try {
      const status = await startTelegramBot();
      statusChangeOriginRef.current = 'local';
      setBotStatus(status);
      showToast(t('app.toasts.telegramStarted'), 'success');
    } catch (error) {
      console.error('Failed to start Telegram bot', error);
      showToast(resolveMessage(error.message) || t('app.toasts.telegramStartError'), 'error');
      await refreshBotStatus('local');
    } finally {
      setBotBusyState(false);
    }
  };

  const handleStopBot = async () => {
    setBotBusyState(true);

    try {
      const status = await stopTelegramBot();
      statusChangeOriginRef.current = 'local';
      setBotStatus(status);
      showToast(t('app.toasts.telegramStopped'), 'info');
    } catch (error) {
      console.error('Failed to stop Telegram bot', error);
      showToast(resolveMessage(error.message) || t('app.toasts.telegramStopError'), 'error');
      await refreshBotStatus('local');
    } finally {
      setBotBusyState(false);
    }
  };

  useEffect(() => {
    if (botStatus?.tokenStored) {
      restoreTokenRef.current = false;
      return;
    }

    const candidate = (
      (selectedProjectId && projectTokens[selectedProjectId]) ||
      projectTokens.__last ||
      ''
    ).trim();

    if (!candidate || restoreTokenRef.current) {
      return;
    }

    restoreTokenRef.current = true;

    (async () => {
      try {
        await handleSaveBotToken(candidate, { remember: false, silent: true });
      } finally {
        restoreTokenRef.current = false;
      }
    })();
  }, [botStatus?.tokenStored, projectTokens, selectedProjectId, handleSaveBotToken]);

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
            onTailLog={handleTailBotLog}
            proxyValue={proxyValue}
            proxyBusy={proxyBusy}
            onSaveProxy={handleSaveProxy}
            botLogEntries={botLogEntries}
            botLogLoading={botLogLoading}
            botBusy={botBusy}
            theme={theme}
            onThemeChange={handleThemeChange}
            currentProject={selectedProject}
            storedToken={
              selectedProjectId && projectTokens[selectedProjectId]
                ? projectTokens[selectedProjectId]
                : ''
            }
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
    projectTokens,
    botStatus,
    botBusy,
    latestBrief,
    planDraft,
    briefLoading,
    planLoading,
    schedules,
    schedulerStatusState,
    schedulesLoading,
    theme,
    handleThemeChange,
    botLogEntries,
    botLogLoading,
    handleTailBotLog
  ]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header__info">
          <h1>{t('app.title')}</h1>
          <p>{t('app.tagline')}</p>
        </div>
        <div className="app-header__actions">
          <button
            type="button"
            className="header-button"
            onClick={handleToggleLogs}
            aria-pressed={isLogPanelOpen}
          >
            {t(isLogPanelOpen ? 'app.actions.closeLogs' : 'app.actions.openLogs')}
            {unreadLogs > 0 ? (
              <span className="header-button__badge">{Math.min(unreadLogs, 99)}</span>
            ) : null}
          </button>
        </div>
      </header>

      <div className="app-content">
        <div className="app-main-column">
          <Navigation sections={sections} activeId={activeSection} onChange={setActiveSection} />
          <main className="app-main">{currentSection}</main>
        </div>
        <LogsPanel
          entries={logEntries}
          open={isLogPanelOpen}
          onClose={handleCloseLogs}
          onClear={handleClearLogs}
        />
      </div>

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

