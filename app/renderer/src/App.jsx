import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  fetchLatestBrief,
  subscribeToBriefUpdates,
  generateBriefPlan,
  getTelegramStatus,
  isAgentApiAvailable,
  listAgents,
  listProjects,
  listPresets,
  upsertAgent,
  deleteAgent,
  listPipelines,
  getProject,
  listProviderStatus,
  listSchedules,
  listRuns,
  runPipeline,
  upsertSchedule,
  upsertProject,
  setTelegramToken,
  startTelegramBot,
  stopTelegramBot,
  tailTelegramLog,
  getTelegramProxyConfig,
  setTelegramProxyConfig,
  subscribeToTelegramStatus,
  normalizeBotStatus,
  upsertPipeline,
  deletePipeline,
  deleteSchedule,
  toggleSchedule,
  runScheduleNow,
  getSchedulerStatus,
  listReports,
  diffPreset,
  applyPreset,
  listTelegramContacts,
  saveTelegramContact,
  sendTelegramInvite
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

function formatRunSummary(run) {
  if (!run) {
    return null;
  }

  const pipeline = run.input?.pipeline || {};
  const outputPayload = run.output?.payload || {};
  const inputPayload = run.input?.payload || {};
  const artifacts = Array.isArray(outputPayload._artifacts)
    ? outputPayload._artifacts
    : Array.isArray(run.output?._artifacts)
      ? run.output._artifacts
      : [];
  const nodeSummary = Array.isArray(run.output?.nodes)
    ? run.output.nodes.find((node) => node.status === 'completed' && node.outputSummary)?.outputSummary
    : null;
  const summary = nodeSummary || outputPayload.summary || run.output?.summary || '';
  const status = run.status || run.output?.status || 'unknown';
  const projectName =
    pipeline.project?.name ||
    inputPayload.project?.name ||
    outputPayload.project?.name ||
    null;
  const pipelineName = pipeline.name || run.output?.pipeline?.name || pipeline.id || run.pipelineId || '';
  const timestamp = run.finishedAt || run.startedAt || run.createdAt || new Date().toISOString();

  return {
    id: run.id,
    pipelineName,
    projectName,
    status,
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

function buildPlanFromDetails(details = {}, t) {
  const normalized = mapBriefDetails(details);
  const fields = [
    { key: 'goals', label: t('brief.labels.goals') },
    { key: 'audience', label: t('brief.labels.audience') },
    { key: 'offer', label: t('brief.labels.offer') },
    { key: 'keyMessages', label: t('brief.labels.keyMessages') },
    { key: 'callToAction', label: t('brief.labels.callToAction') },
    { key: 'successMetrics', label: t('brief.labels.successMetrics') },
    { key: 'references', label: t('brief.labels.references') }
  ];

  const items = fields.map((field, index) => {
    const value = normalized[field.key]?.trim();
    return `${index + 1}. ${field.label}: ${value || t('common.notAvailable')}`;
  });

  return items.join('\n');
}

function sortProjectsByUpdatedAt(projects) {
  return projects
    .slice()
    .sort((a, b) => {
      const timeA = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });
}

function normalizeInviteLogEntry(entry, fallbackKey = 0) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const event = typeof entry.event === 'string' ? entry.event : '';

  if (!event.startsWith('telegram.invite')) {
    return null;
  }

  const data = entry.data && typeof entry.data === 'object' ? entry.data : {};
  const nestedPayload = data.payload && typeof data.payload === 'object' ? data.payload : {};
  const projectId = data.projectId ?? nestedPayload.projectId ?? null;
  const chatId = data.chatId ?? nestedPayload.chatId ?? null;
  const link = data.link ?? nestedPayload.link ?? null;
  const message = data.message ?? nestedPayload.message ?? null;
  const error = data.error ?? nestedPayload.error ?? null;
  const timestamp = entry.ts || data.ts || null;
  const parsedTimestamp = timestamp ? Date.parse(timestamp) : Number.NaN;
  const timestampMs = Number.isNaN(parsedTimestamp) ? null : parsedTimestamp;
  const normalizedProjectId =
    projectId !== undefined && projectId !== null ? String(projectId) : null;
  const normalizedChatId =
    chatId !== undefined && chatId !== null ? String(chatId) : null;
  const status =
    event === 'telegram.invite.sent'
      ? 'sent'
      : event === 'telegram.invite.send_error'
        ? 'send_error'
        : 'error';

  return {
    id: `${event}:${timestamp || fallbackKey}:${normalizedChatId ?? ''}`,
    event,
    status,
    projectId: normalizedProjectId,
    chatId: normalizedChatId,
    link: link ?? null,
    message: message ?? null,
    error: error ?? null,
    timestamp: timestamp ?? null,
    timestampMs,
    level: entry.level || 'info'
  };
}

function buildInviteHistoryFromLog(entries, projectId) {
  if (!projectId || !Array.isArray(entries)) {
    return [];
  }

  const normalizedProjectId = String(projectId);

  return entries
    .map((entry, index) => normalizeInviteLogEntry(entry, index))
    .filter((item) => item && item.projectId === normalizedProjectId)
    .sort((a, b) => {
      const timeA = typeof a.timestampMs === 'number' ? a.timestampMs : 0;
      const timeB = typeof b.timestampMs === 'number' ? b.timestampMs : 0;
      return timeB - timeA;
    });
}

function inviteHistoriesEqual(a = [], b = []) {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];

    if (!right) {
      return false;
    }

    if (
      left.id !== right.id ||
      left.status !== right.status ||
      left.timestamp !== right.timestamp ||
      left.chatId !== right.chatId ||
      left.link !== right.link ||
      left.message !== right.message ||
      left.error !== right.error
    ) {
      return false;
    }
  }

  return true;
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

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = usePersistentState('af.selectedProject', null);
  const [brief, setBrief] = usePersistentState('af.brief', {});
  const [runs, setRuns] = useState([]);
  const [reports, setReports] = useState([]);
  const [telegramContacts, setTelegramContacts] = useState([]);
  const [telegramContactsLoading, setTelegramContactsLoading] = useState(false);
  const [inviteHistoryMap, setInviteHistoryMap] = useState({});
  const [presets, setPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetDiffState, setPresetDiffState] = useState(null);
  const [presetDiffLoading, setPresetDiffLoading] = useState(false);
  const [presetActionBusy, setPresetActionBusy] = useState(false);
  const [botStatus, setBotStatus] = useState(null);
  const [botBusy, setBotBusy] = useState(false);
  const botBusyRef = useRef(false);
  const lastErrorRef = useRef(null);
  const lastStatusRef = useRef(null);
  const statusChangeOriginRef = useRef('external');
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

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const refreshRuns = useCallback(async () => {
    try {
      const records = await listRuns();
      const summaries = records
        .map((run) => formatRunSummary(run))
        .filter((item) => item !== null);
      setRuns(summaries);
    } catch (error) {
      console.error('Failed to load run history', error);
    }
  }, [setRuns]);

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

  const refreshProjects = useCallback(async () => {
    try {
      const projectList = await listProjects();
      const normalized = Array.isArray(projectList) ? projectList : [];
      const sorted = sortProjectsByUpdatedAt(normalized);
      setProjects(sorted);
      return sorted;
    } catch (error) {
      console.error('Failed to load projects', error);
      throw error;
    }
  }, [setProjects]);

  const loadPresetOptions = useCallback(async () => {
    setPresetsLoading(true);

    try {
      const presetList = await listPresets();
      const normalized = Array.isArray(presetList) ? presetList : [];
      const seen = new Set();

      const entries = normalized
        .map((preset) => {
          const meta = preset && typeof preset.meta === 'object' ? preset.meta : {};
          const id = preset?.id || meta?.id || 'generic';

          return {
            id,
            name: preset?.name || meta?.name || id,
            description: preset?.description || meta?.description || '',
            version: preset?.version || meta?.version || null,
            checksum: preset?.checksum || null,
            industry: preset?.industry || meta?.industry || null,
            updatedAt: preset?.updatedAt || meta?.updatedAt || null,
            tags: Array.isArray(preset?.tags)
              ? preset.tags
              : Array.isArray(meta?.tags)
                ? meta.tags
                : []
          };
        })
        .filter((entry) => {
          if (!entry.id) {
            return false;
          }

          if (seen.has(entry.id)) {
            return false;
          }

          seen.add(entry.id);
          return true;
        });

      if (!seen.has('generic')) {
        entries.push({
          id: 'generic',
          name: t('projects.presets.genericName'),
          description: t('projects.presets.genericDescription'),
          version: '0.0.0',
          checksum: null,
          industry: null,
          updatedAt: null,
          tags: []
        });
      }

      entries.sort((a, b) => a.name.localeCompare(b.name, language === 'ru' ? 'ru' : 'en'));
      setPresets(entries);
      return entries;
    } catch (error) {
      console.error('Failed to load preset options', error);
      const fallbackEntry = {
        id: 'generic',
        name: t('projects.presets.genericName'),
        description: t('projects.presets.genericDescription'),
        version: '0.0.0',
        checksum: null,
        industry: null,
        updatedAt: null,
        tags: []
      };
      setPresets([fallbackEntry]);
      return [fallbackEntry];
    } finally {
      setPresetsLoading(false);
    }
  }, [language, t]);

  const loadTelegramContacts = useCallback(
    async (projectId = selectedProjectId) => {
      if (!projectId) {
        setTelegramContacts([]);
        return [];
      }

      setTelegramContactsLoading(true);

      try {
        const contactList = await listTelegramContacts(projectId);
        const normalized = Array.isArray(contactList) ? contactList : [];
        setTelegramContacts(normalized);
        return normalized;
      } catch (error) {
        console.error('Failed to load Telegram contacts', error);
        showToast(t('projects.toast.contactsLoadError'), 'error', {
          source: 'telegram',
          details: { projectId, message: error?.message }
        });
        setTelegramContacts([]);
        throw error;
      } finally {
        setTelegramContactsLoading(false);
      }
    },
    [selectedProjectId, showToast, t]
  );

  const loadInviteHistory = useCallback(
    async (projectId) => {
      if (!projectId) {
        return [];
      }

      try {
        const lines = await tailTelegramLog(100);
        const history = buildInviteHistoryFromLog(Array.isArray(lines) ? lines : [], projectId);

        setInviteHistoryMap((previous) => {
          const current = previous[projectId] || [];

          if (inviteHistoriesEqual(current, history)) {
            return previous;
          }

          return { ...previous, [projectId]: history };
        });

        return history;
      } catch (error) {
        console.error('Failed to load invite history', error);
        return [];
      }
    },
    [tailTelegramLog]
  );

  const handleRefreshInviteHistory = useCallback(
    async (projectId = selectedProjectId) => {
      if (!projectId) {
        return [];
      }

      return loadInviteHistory(projectId);
    },
    [selectedProjectId, loadInviteHistory]
  );

  const handleSaveTelegramContact = useCallback(
    async (contactDraft) => {
      if (!selectedProjectId) {
        showToast(t('projects.toast.projectRequired'), 'error', { source: 'telegram' });
        return null;
      }

      try {
        const payload = {
          ...contactDraft,
          projectId: contactDraft?.projectId ?? selectedProjectId
        };
        const saved = await saveTelegramContact(payload);
        await loadTelegramContacts(selectedProjectId).catch(() => {});
        if (saved?.chatId) {
          showToast(t('projects.toast.contactSaved'), 'success', {
            source: 'telegram',
            details: { chatId: saved.chatId }
          });
        }
        return saved;
      } catch (error) {
        console.error('Failed to save Telegram contact', error);
        showToast(t('projects.toast.contactSaveError'), 'error', {
          source: 'telegram',
          details: { message: error?.message }
        });
        return null;
      }
    },
    [selectedProjectId, loadTelegramContacts, showToast, t]
  );

  const handleSendTelegramInvite = useCallback(
    async (chatId) => {
      if (!selectedProjectId) {
        showToast(t('projects.toast.projectRequired'), 'error', { source: 'telegram' });
        return { ok: false, error: 'project_required' };
      }

      const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : chatId;

      if (!normalizedChatId) {
        showToast(t('projects.toast.chatIdRequired'), 'error', { source: 'telegram' });
        return { ok: false, error: 'chat_id_required' };
      }

      try {
        const response = await sendTelegramInvite(selectedProjectId, normalizedChatId);
        await Promise.all([
          refreshProjects().catch(() => {}),
          loadTelegramContacts(selectedProjectId).catch(() => {}),
          loadInviteHistory(selectedProjectId).catch(() => {})
        ]);
        showToast(t('projects.toast.inviteSent'), 'success', {
          source: 'telegram',
          details: { chatId: response?.chatId, link: response?.link }
        });
        return {
          ok: true,
          response: {
            ...response,
            chatId: response?.chatId ?? normalizedChatId
          }
        };
      } catch (error) {
        console.error('Failed to send Telegram invite', error);
        const inlineMessage = resolveMessage(error.message) || t('projects.toast.inviteError');
        showToast(inlineMessage, 'error', {
          source: 'telegram',
          details: { chatId: normalizedChatId, message: error?.message }
        });
        await loadInviteHistory(selectedProjectId).catch(() => {});
        return {
          ok: false,
          error: error?.message || 'invite_failed',
          code: error?.code ?? null,
          message: inlineMessage
        };
      }
    },
  [
    selectedProjectId,
    loadTelegramContacts,
    refreshProjects,
    loadInviteHistory,
    resolveMessage,
    showToast,
    t
  ]
);

  const { agentsData, providerStatus, providerUpdatedAt, refreshAgents } = useAgentResources(locale);
  const { pipelines, refreshPipelines } = usePipelineResources();

  const refreshPresetDiff = useCallback(
    async (projectOverride) => {
      const project = projectOverride || selectedProject;

      if (!project) {
        setPresetDiffState(null);
        return null;
      }

      const targetPresetId = project.presetId || 'generic';
      setPresetDiffLoading(true);

      try {
        const diff = await diffPreset(targetPresetId, project.presetVersion ?? null);
        setPresetDiffState(diff);
        return diff;
      } catch (error) {
        console.error('Failed to diff preset', error);
        setPresetDiffState(null);
        showToast(t('projects.toast.presetDiffError'), 'error', {
          source: 'preset',
          details: { projectId: project.id, message: error?.message }
        });
        return null;
      } finally {
        setPresetDiffLoading(false);
      }
    },
    [selectedProject, showToast, t]
  );

  const handleApplyPreset = useCallback(
    async (projectId, presetId, options = {}) => {
      const targetProjectId = projectId || selectedProjectId;
      const targetPresetId = presetId || selectedProject?.presetId || 'generic';

      if (!targetProjectId) {
        showToast(t('projects.toast.projectRequired'), 'error', { source: 'preset' });
        return false;
      }

      setPresetActionBusy(true);

      try {
        const response = await applyPreset(targetProjectId, targetPresetId);

        if (response?.ok === false) {
          throw new Error(response?.error || 'Preset apply failed');
        }

        if (options?.clearDraft) {
          try {
            await upsertProject({ id: targetProjectId, presetDraft: {} });
          } catch (draftError) {
            console.warn('Failed to clear preset draft after apply', draftError);
          }
        }

        await Promise.all([refreshProjects(), refreshAgents(), refreshPipelines()]);

        const appliedVersion =
          response?.project?.presetVersion || response?.preset?.version || selectedProject?.presetVersion || null;

        await refreshPresetDiff({
          id: targetProjectId,
          presetId: targetPresetId,
          presetVersion: appliedVersion
        }).catch(() => {});

        const presetMeta = response?.preset?.meta || {};
        const presetName =
          presetMeta.name || presets.find((preset) => preset.id === targetPresetId)?.name || targetPresetId;

        showToast(
          t('projects.toast.presetApplied', {
            name: presetName,
            version: appliedVersion || t('projects.presets.versionUnknown')
          }),
          'success',
          { source: 'preset' }
        );

        return true;
      } catch (error) {
        console.error('Failed to apply preset', error);
        showToast(t('projects.toast.presetApplyError'), 'error', {
          source: 'preset',
          details: { message: error?.message }
        });
        return false;
      } finally {
        setPresetActionBusy(false);
      }
    },
    [
      selectedProjectId,
      selectedProject,
      presets,
      refreshProjects,
      refreshAgents,
      refreshPipelines,
      refreshPresetDiff,
      showToast,
      t
    ]
  );

  const handleClearPresetDraft = useCallback(
    async (projectId) => {
      const targetProjectId = projectId || selectedProjectId;

      if (!targetProjectId) {
        showToast(t('projects.toast.projectRequired'), 'error', { source: 'preset' });
        return false;
      }

      try {
        const response = await upsertProject({ id: targetProjectId, presetDraft: {} });

        if (response?.ok === false) {
          throw new Error(response?.error || 'Preset draft clear failed');
        }

        await refreshProjects();
        await refreshPresetDiff({
          id: targetProjectId,
          presetId: response?.project?.presetId || selectedProject?.presetId || 'generic',
          presetVersion: response?.project?.presetVersion || selectedProject?.presetVersion || null
        }).catch(() => {});

        showToast(t('projects.toast.presetDraftCleared'), 'info', { source: 'preset' });
        return true;
      } catch (error) {
        console.error('Failed to clear preset draft', error);
        showToast(t('projects.toast.presetDraftClearError'), 'error', {
          source: 'preset',
          details: { message: error?.message }
        });
        return false;
      }
    },
    [selectedProjectId, selectedProject, refreshProjects, refreshPresetDiff, showToast, t]
  );

  const handleApproveBrief = useCallback(async () => {
    if (!selectedProjectId) {
      showToast(t('projects.toast.projectRequired'), 'error', { source: 'brief' });
      return false;
    }

    try {
      const response = await upsertProject({ id: selectedProjectId, briefStatus: 'approved', briefProgress: 1 });

      if (response?.ok === false) {
        throw new Error(response?.error || 'Brief approval failed');
      }

      await refreshProjects();
      showToast(t('projects.toast.briefApproved'), 'success', { source: 'brief' });
      return true;
    } catch (error) {
      console.error('Failed to approve brief', error);
      showToast(t('projects.toast.briefApproveError'), 'error', {
        source: 'brief',
        details: { message: error?.message }
      });
      return false;
    }
  }, [selectedProjectId, refreshProjects, showToast, t]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (isLogPanelOpen) {
      setUnreadLogs(0);
    }
  }, [isLogPanelOpen]);

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    refreshProjects().catch((error) => {
      console.error('Failed to hydrate projects', error);
    });
  }, [refreshProjects]);

  useEffect(() => {
    loadPresetOptions().catch(() => {});
  }, [loadPresetOptions]);

  useEffect(() => {
    if (!selectedProjectId) {
      setTelegramContacts([]);
      return;
    }

    loadTelegramContacts(selectedProjectId).catch(() => {});
  }, [selectedProjectId, loadTelegramContacts]);

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

  const sections = useMemo(() => {
    const activeProject = projects.find((item) => item.id === selectedProjectId) || null;

    return SECTION_CONFIG.map((section) => {
      const entry = { id: section.id, label: t(section.labelKey) };

      if (section.id === 'brief') {
        entry.disabled = !activeProject;
      }

      return entry;
    });
  }, [projects, selectedProjectId, t]);

  const pipelineDefaults = useMemo(
    () => ({
      topic: t('app.defaults.topic'),
      tone: t('app.defaults.tone'),
      message: t('app.defaults.message')
    }),
    [t]
  );

  const agentOptions = useMemo(() => {
    const pluginOptions = Array.isArray(agentsData?.plugins)
      ? agentsData.plugins.map((agent) => ({
          id: agent.id,
          label: agent.name || agent.id,
          source: agent.source || 'plugin'
        }))
      : [];

    const configOptions = Array.isArray(agentsData?.configs)
      ? agentsData.configs.map((agent) => ({
          id: agent.id,
          label: agent.name || agent.id,
          source: agent.source || 'local'
        }))
      : [];

    return [...pluginOptions, ...configOptions];
  }, [agentsData]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    loadInviteHistory(selectedProjectId).catch(() => {});
  }, [selectedProjectId, selectedProject?.tgLastInvitation, loadInviteHistory]);

  useEffect(() => {
    if (!selectedProject) {
      setPresetDiffState(null);
      return;
    }

    refreshPresetDiff(selectedProject).catch(() => {});
  }, [selectedProject?.id, selectedProject?.presetId, selectedProject?.presetVersion, refreshPresetDiff]);

  useEffect(() => {
    if (projects.length === 0) {
      if (selectedProjectId !== null) {
        setSelectedProjectId(null);
      }
      return;
    }

    if (!selectedProject) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProject, selectedProjectId, setSelectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    let cancelled = false;

    const syncSelectedProject = async () => {
      try {
        const projectRecord = await getProject(selectedProjectId);

        if (cancelled) {
          return;
        }

        if (!projectRecord) {
          setProjects((prev) => {
            if (!prev.some((item) => item.id === selectedProjectId)) {
              return prev;
            }

            return prev.filter((item) => item.id !== selectedProjectId);
          });
          return;
        }

        setProjects((prev) => {
          const index = prev.findIndex((item) => item.id === projectRecord.id);

          if (index >= 0) {
            const prevRecord = prev[index];
            const hasChanged = Object.keys({ ...prevRecord, ...projectRecord }).some(
              (key) => prevRecord[key] !== projectRecord[key]
            );

            if (!hasChanged) {
              return prev;
            }

            const next = [...prev];
            next[index] = projectRecord;
            return sortProjectsByUpdatedAt(next);
          }

          return sortProjectsByUpdatedAt([...prev, projectRecord]);
        });
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to sync project', error);
        }
      }
    };

    syncSelectedProject();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, setProjects]);

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

      if (payload?.statusUpdate) {
        if (projectId) {
          refreshProjects().catch(() => {});
          if (projectId === selectedProjectId) {
            loadTelegramContacts(projectId).catch(() => {});
          }
        }
        return;
      }

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
  }, [
    selectedProjectId,
    showToast,
    fetchLatestBrief,
    subscribeToBriefUpdates,
    t,
    resolveMessage,
    refreshProjects,
    loadTelegramContacts
  ]);

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

  const loadReports = useCallback(
    async (projectId = selectedProjectId) => {
      const filter = projectId ? { projectId } : {};

      try {
        const reportList = await listReports(filter);
        setReports(Array.isArray(reportList) ? reportList : []);
        return reportList;
      } catch (error) {
        console.error('Failed to load reports', error);
        showToast(t('app.toasts.reportsLoadError'), 'error', {
          source: 'reports',
          details: { projectId, message: error?.message }
        });
        setReports([]);
        throw error;
      }
    },
    [selectedProjectId, showToast, t]
  );

  useEffect(() => {
    loadReports().catch(() => {});
  }, [loadReports]);
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

  const handleCreateProject = useCallback(
    async (projectDraft) => {
      try {
        const response = await upsertProject(projectDraft);

        if (response?.ok === false) {
          throw new Error(response?.error || 'Project save failed');
        }

        const savedProject = response?.project ?? response ?? null;

        await refreshProjects();

        if (savedProject?.id) {
          setSelectedProjectId(savedProject.id);
        }

        return savedProject;
      } catch (error) {
        console.error('Failed to save project', error);
        throw error;
      }
    },
    [refreshProjects, setSelectedProjectId]
  );

  const handleUpdateBrief = (nextBrief) => {
    setBrief(nextBrief);
  };

  const handleSaveAgent = async (agentDraft) => {
    if (!agentDraft) {
      return false;
    }

    try {
      const response = await upsertAgent(agentDraft);

      if (response?.ok === false) {
        throw new Error(response?.error || 'Agent save failed');
      }

      await refreshAgents();
      showToast(t('app.toasts.agentSaved', { name: response?.agent?.name || agentDraft.name || agentDraft.id }), 'success');
      return true;
    } catch (error) {
      console.error('Failed to save agent', error);
      showToast(t('app.toasts.agentSaveError'), 'error');
      return false;
    }
  };

  const handleDeleteAgent = async (agentId) => {
    if (!agentId) {
      return false;
    }

    const agentRecord = agentsData.configs?.find((agent) => agent.id === agentId);
    const agentName = agentRecord?.name || agentId;

    try {
      const response = await deleteAgent(agentId);

      if (response?.ok === false) {
        throw new Error(response?.error || 'Agent delete failed');
      }

      await refreshAgents();
      showToast(t('app.toasts.agentDeleted', { name: agentName }), 'info');
      return true;
    } catch (error) {
      console.error('Failed to delete agent', error);
      showToast(t('app.toasts.agentDeleteError'), 'error');
      return false;
    }
  };

  const handleSavePipeline = async (pipeline) => {
    if (!pipeline) {
      return false;
    }

    try {
      const response = await upsertPipeline(pipeline);

      if (response?.ok === false) {
        throw new Error(response?.error || 'Pipeline save failed');
      }

      await refreshPipelines();
      await refreshAgents();

      const savedName = response?.pipeline?.name || pipeline.name || pipeline.id;
      showToast(t('app.toasts.pipelineSaved', { name: savedName }), 'success');
      return true;
    } catch (error) {
      console.error('Failed to save pipeline', error);
      showToast(t('app.toasts.pipelineSaveError'), 'error');
      return false;
    }
  };

  const handleDeletePipeline = async (pipelineId) => {
    if (!pipelineId) {
      return false;
    }

    const pipelineRecord = pipelines.find((item) => item.id === pipelineId);
    const pipelineName = pipelineRecord?.name || pipelineId;

    try {
      const response = await deletePipeline(pipelineId);

      if (response?.ok === false) {
        throw new Error(response?.error || 'Pipeline delete failed');
      }

      await refreshPipelines();
      await refreshAgents();
      showToast(t('app.toasts.pipelineDeleted', { name: pipelineName }), 'info');
      return true;
    } catch (error) {
      console.error('Failed to delete pipeline', error);
      showToast(t('app.toasts.pipelineDeleteError'), 'error');
      return false;
    }
  };

  const handleRunPipeline = async (pipeline, context) => {
    try {
      const inputPayload = buildPipelineInput(context.project, context.brief, pipelineDefaults);
      const response = await runPipeline(pipeline, inputPayload);

      if (!response.ok) {
        throw new Error('Pipeline run failed');
      }

      if (response.run) {
        const summary = formatRunSummary(response.run);

        if (summary) {
          setRuns((prev) => {
            const filtered = prev.filter((item) => item.id !== summary.id);
            return [summary, ...filtered].slice(0, 50);
          });
        } else {
          await refreshRuns();
        }
      } else {
        await refreshRuns();
      }
      await loadReports(context?.project?.id ?? selectedProjectId).catch(() => {});
      const status =
        response.run?.status || response.result?.status || response.result?.output?.status || 'unknown';
      showToast(t('app.toasts.pipelineRun', { name: pipeline.name, status }), 'success');
    } catch (error) {
      console.error('Pipeline execution error', error);
      showToast(t('app.toasts.pipelineRunError'), 'error');
    }
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
    async (token) => {
      setBotBusyState(true);

      try {
        const status = await setTelegramToken(token);
        statusChangeOriginRef.current = 'local';
        setBotStatus(status);
        if (token?.trim()) {
          showToast(t('app.toasts.telegramTokenSaved'), 'success');
        } else {
          showToast(t('app.toasts.telegramTokenRemoved'), 'info');
        }
      } catch (error) {
        console.error('Failed to store Telegram token', error);
        showToast(resolveMessage(error.message) || t('app.toasts.telegramTokenError'), 'error');
        await refreshBotStatus('local');
      } finally {
        setBotBusyState(false);
      }
    },
    [setBotBusyState, setBotStatus, showToast, t, resolveMessage, refreshBotStatus]
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
      const sourceDetails =
        result?.brief?.details ??
        latestBrief?.details ??
        {
          ...brief,
          answers: brief
        };
      const builtPlan = buildPlanFromDetails(sourceDetails, t);
      const isTemplatePlan =
        typeof result?.plan === 'string' && /цель кампании:\s*уточнить/i.test(result.plan);
      const planTextValue =
        result?.plan && !isTemplatePlan ? result.plan : builtPlan?.trim() ? builtPlan : '';

      if (planTextValue) {
        setPlanDraft({ text: planTextValue, updatedAt: new Date().toISOString() });

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
      await loadReports(selectedProjectId).catch(() => {});
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
            selectedProject={selectedProject}
            onCreateProject={handleCreateProject}
            onSelectProject={setSelectedProjectId}
            onNotify={showToast}
            botStatus={botStatus}
            botBusy={botBusy}
            onStartBot={handleStartBot}
            onStopBot={handleStopBot}
            onRefreshBot={handleRefreshBotStatus}
            contacts={telegramContacts}
            contactsLoading={telegramContactsLoading}
            onRefreshContacts={loadTelegramContacts}
            onSaveContact={handleSaveTelegramContact}
            onSendInvite={handleSendTelegramInvite}
            onApproveBrief={handleApproveBrief}
            inviteHistory={inviteHistoryMap[selectedProjectId] || []}
            onRefreshInviteHistory={handleRefreshInviteHistory}
            presetOptions={presets}
            presetsLoading={presetsLoading}
            presetDiff={presetDiffState}
            presetBusy={presetActionBusy}
            presetDiffLoading={presetDiffLoading}
            onApplyPreset={handleApplyPreset}
            onClearPresetDraft={handleClearPresetDraft}
            onRefreshPresetDiff={refreshPresetDiff}
            onOpenBrief={() => setActiveSection('brief')}
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
            onSaveAgent={handleSaveAgent}
            onDeleteAgent={handleDeleteAgent}
            onNotify={showToast}
          />
        );
      case 'pipelines':
        return (
          <PipelinesPage
            pipelines={pipelines}
            project={selectedProject}
            brief={brief}
            onSavePipeline={handleSavePipeline}
            onDeletePipeline={handleDeletePipeline}
            onRunPipeline={handleRunPipeline}
            onRefresh={refreshPipelines}
            agentOptions={agentOptions}
            isAgentOnline={AGENT_ONLINE}
            onNotify={showToast}
            onShowHistory={handleShowPipelineHistory}
          />
        );
      case 'runs':
        return <RunsPage runs={runs} />;
      case 'reports':
        return <ReportsPage reports={reports} />;
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
    reports,
    selectedProjectId,
    selectedProject,
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
    handleTailBotLog,
    agentOptions,
    handleSaveAgent,
    handleDeleteAgent,
    handleSavePipeline,
    handleDeletePipeline,
    handleRunPipeline,
    refreshAgents,
    refreshPipelines,
    handleShowAgentHistory,
    handleShowPipelineHistory,
    showToast,
    inviteHistoryMap,
    handleRefreshInviteHistory
  ]);

  return (
    <div className="app-container" data-testid="app-root">
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





