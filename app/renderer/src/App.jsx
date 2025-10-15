import { useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  isAgentApiAvailable,
  listAgents,
  listPipelines,
  listProviderStatus,
  runPipeline,
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
    selectedProjectId
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
