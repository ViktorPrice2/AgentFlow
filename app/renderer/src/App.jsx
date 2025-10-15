diff --git a/app/renderer/src/App.jsx b/app/renderer/src/App.jsx
index 35c855835779de676838eb9e95ad002ca6a4f164..8abae496f5a4d686b57f74ed01fce084a9a7e89f 100644
--- a/app/renderer/src/App.jsx
+++ b/app/renderer/src/App.jsx
@@ -1,96 +1,121 @@
-import { useCallback, useEffect, useMemo, useState } from 'react';
+import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
 import './App.css';
 import {
   isAgentApiAvailable,
   listAgents,
   listPipelines,
   listProviderStatus,
   runPipeline,
   upsertPipeline,
   listProjects as fetchProjects,
   upsertProject as saveProject,
   listBriefs as fetchBriefs,
   upsertBrief as saveBrief,
   generateBriefPlan,
   getBotStatus,
   startBot as startBotApi,
   stopBot as stopBotApi,
   setBotToken as setBotTokenApi,
   onBriefUpdated
 } from './api/agentApi.js';
 import { Navigation } from './components/Navigation.jsx';
 import { Toast } from './components/Toast.jsx';
 import { ProjectsPage } from './pages/ProjectsPage.jsx';
 import { BriefPage, DEFAULT_BRIEF } from './pages/BriefPage.jsx';
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
 
+function mapProjectForUi(project) {
+  const metadata = project.metadata ?? {};
+
+  return {
+    ...project,
+    industry: metadata.industry ?? '',
+    channels: metadata.channels ?? '',
+    deeplink: metadata.deeplink ?? '',
+    updatedAt: project.updatedAt ?? project.createdAt
+  };
+}
+
+function mapBriefForUi(brief) {
+  const content = { ...DEFAULT_BRIEF, ...(brief.content ?? {}) };
+
+  return {
+    ...brief,
+    title: brief.title || 'Бриф',
+    content,
+    metadata: brief.metadata ?? {},
+    updatedAt: brief.updatedAt ?? brief.createdAt
+  };
+}
+
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
 
-function buildPipelineInput(project, brief) {
+function buildPipelineInput(project, briefContent) {
   return {
     project,
-    brief,
-    topic: brief?.goals?.split(/[.!?]/)[0]?.trim() || project?.name || 'Маркетинговая активность',
-    tone: brief?.tone || 'Нейтральный',
-    message: brief?.keyMessages || 'Сообщения не заданы',
-    audience: brief?.audience || '',
-    callToAction: brief?.callToAction || ''
+    brief: briefContent,
+    topic:
+      briefContent?.goals?.split(/[.!?]/)[0]?.trim() || project?.name || 'Маркетинговая активность',
+    tone: briefContent?.tone || 'Нейтральный',
+    message: briefContent?.keyMessages || 'Сообщения не заданы',
+    audience: briefContent?.audience || '',
+    callToAction: briefContent?.callToAction || ''
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
@@ -103,194 +128,496 @@ function useAgentResources() {
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
+  const toastTimerRef = useRef(null);
 
-  const [projects, setProjects] = usePersistentState('af.projects', []);
-  const [selectedProjectId, setSelectedProjectId] = usePersistentState('af.selectedProject', null);
-  const [brief, setBrief] = usePersistentState('af.brief', {});
+  const [projects, setProjects] = useState([]);
+  const [selectedProjectId, setSelectedProjectId] = useState(null);
+  const [briefs, setBriefs] = useState([]);
+  const [selectedBriefId, setSelectedBriefId] = useState(null);
   const [runs, setRuns] = usePersistentState('af.runs', []);
 
   const { agentsData, providerStatus, providerUpdatedAt, refreshAgents } = useAgentResources();
   const { pipelines, refreshPipelines } = usePipelineResources();
 
+  const [botStatus, setBotStatus] = useState(null);
+
+  const showToast = useCallback((message, type = 'info') => {
+    setToast({ message, type });
+
+    if (toastTimerRef.current) {
+      clearTimeout(toastTimerRef.current);
+    }
+
+    if (message) {
+      toastTimerRef.current = setTimeout(() => {
+        setToast({ message: null, type: 'info' });
+        toastTimerRef.current = null;
+      }, 4000);
+    }
+  }, []);
+
+  useEffect(() => {
+    return () => {
+      if (toastTimerRef.current) {
+        clearTimeout(toastTimerRef.current);
+      }
+    };
+  }, []);
+
   const selectedProject = useMemo(
     () => projects.find((item) => item.id === selectedProjectId) || null,
     [projects, selectedProjectId]
   );
 
   useEffect(() => {
-    if (projects.length > 0 && !selectedProject) {
+    if (projects.length === 0) {
+      setSelectedProjectId(null);
+      return;
+    }
+
+    if (!selectedProject || !projects.some((item) => item.id === selectedProjectId)) {
       setSelectedProjectId(projects[0].id);
     }
-  }, [projects, selectedProject, setSelectedProjectId]);
+  }, [projects, selectedProject, selectedProjectId]);
 
-  const showToast = (message, type = 'info') => {
-    setToast({ message, type });
-    if (message) {
-      setTimeout(() => setToast({ message: null, type: 'info' }), 4000);
+  const refreshProjects = useCallback(async () => {
+    try {
+      const list = await fetchProjects();
+      const mapped = list.map(mapProjectForUi).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
+      setProjects(mapped);
+      return mapped;
+    } catch (error) {
+      console.error('Failed to load projects', error);
+      showToast('Не удалось загрузить проекты', 'error');
+      return [];
     }
-  };
+  }, [showToast]);
+
+  const refreshBriefs = useCallback(
+    async (projectId) => {
+      if (!projectId) {
+        setBriefs([]);
+        setSelectedBriefId(null);
+        return [];
+      }
+
+      try {
+        const list = await fetchBriefs(projectId);
+        const mapped = list.map(mapBriefForUi).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
+        setBriefs(mapped);
+        setSelectedBriefId((prev) => {
+          if (prev && mapped.some((item) => item.id === prev)) {
+            return prev;
+          }
+
+          return mapped[0]?.id ?? null;
+        });
+
+        return mapped;
+      } catch (error) {
+        console.error('Failed to load briefs', error);
+        showToast('Не удалось загрузить брифы', 'error');
+        return null;
+      }
+    },
+    [showToast]
+  );
+
+  const refreshBotStatus = useCallback(async () => {
+    try {
+      const status = await getBotStatus();
+      setBotStatus(status);
+      return status;
+    } catch (error) {
+      console.error('Failed to fetch bot status', error);
+      showToast('Не удалось получить статус бота', 'error');
+      return null;
+    }
+  }, [showToast]);
+
+  useEffect(() => {
+    refreshProjects();
+    refreshBotStatus();
+  }, [refreshProjects, refreshBotStatus]);
+
+  useEffect(() => {
+    if (selectedProjectId) {
+      refreshBriefs(selectedProjectId);
+    } else {
+      setBriefs([]);
+      setSelectedBriefId(null);
+    }
+  }, [selectedProjectId, refreshBriefs]);
 
-  const handleCreateProject = (project) => {
-    setProjects((prev) => {
-      const filtered = prev.filter((item) => item.id !== project.id);
-      filtered.push(project);
-      return filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
+  useEffect(() => {
+    const unsubscribe = onBriefUpdated(({ projectId }) => {
+      if (projectId === selectedProjectId) {
+        refreshBriefs(projectId);
+      }
     });
+
+    return () => {
+      if (typeof unsubscribe === 'function') {
+        unsubscribe();
+      }
+    };
+  }, [selectedProjectId, refreshBriefs]);
+
+  const handleCreateProject = async (projectDraft) => {
+    try {
+      const payload = {
+        id: projectDraft.id,
+        name: projectDraft.name,
+        description: projectDraft.description,
+        status: 'active',
+        metadata: {
+          industry: projectDraft.industry,
+          channels: projectDraft.channels,
+          deeplink: projectDraft.deeplink
+        }
+      };
+
+      const saved = await saveProject(payload);
+      const normalized = mapProjectForUi(saved);
+
+      setProjects((prev) => {
+        const filtered = prev.filter((item) => item.id !== normalized.id);
+        filtered.push(normalized);
+        return filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
+      });
+
+      setSelectedProjectId(normalized.id);
+      showToast('Проект сохранён', 'success');
+
+      return normalized;
+    } catch (error) {
+      console.error('Failed to save project', error);
+      showToast('Не удалось сохранить проект', 'error');
+      throw error;
+    }
+  };
+
+  const handleSelectProject = (projectId) => {
+    setSelectedProjectId(projectId);
+  };
+
+  const handleSaveBrief = async ({ id, title, content }) => {
+    if (!selectedProject) {
+      showToast('Сначала выберите проект', 'info');
+      throw new Error('PROJECT_NOT_SELECTED');
+    }
+
+    try {
+      const existing = id ? briefs.find((item) => item.id === id) : null;
+      const payload = {
+        id,
+        projectId: selectedProject.id,
+        title: title || `Бриф ${new Date().toLocaleString('ru-RU')}`,
+        status: 'draft',
+        source: 'manual',
+        content,
+        metadata: existing?.metadata ?? {}
+      };
+
+      const saved = await saveBrief(payload);
+      const normalized = mapBriefForUi(saved);
+
+      setBriefs((prev) => {
+        const filtered = prev.filter((item) => item.id !== normalized.id);
+        filtered.push(normalized);
+        return filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
+      });
+
+      setSelectedBriefId(normalized.id);
+      showToast('Бриф сохранён', 'success');
+
+      return normalized;
+    } catch (error) {
+      console.error('Failed to save brief', error);
+      showToast('Не удалось сохранить бриф', 'error');
+      throw error;
+    }
   };
 
-  const handleUpdateBrief = (nextBrief) => {
-    setBrief(nextBrief);
+  const handleGeneratePlan = async (answers) => {
+    if (!selectedProject) {
+      showToast('Выберите проект для генерации плана', 'info');
+      throw new Error('PROJECT_NOT_SELECTED');
+    }
+
+    try {
+      const plan = await generateBriefPlan({ answers, projectId: selectedProject.id });
+      return plan;
+    } catch (error) {
+      console.error('Failed to generate brief plan', error);
+      showToast('Не удалось сформировать план', 'error');
+      throw error;
+    }
   };
 
+  const handleSelectBrief = (briefId) => {
+    setSelectedBriefId(briefId);
+  };
+
+  const handleRefreshBriefs = async () => {
+    const result = await refreshBriefs(selectedProject?.id);
+    if (result !== null) {
+      showToast('Список брифов обновлён', 'info');
+    }
+  };
+
+  const handleStartBot = async () => {
+    try {
+      const status = await startBotApi();
+      setBotStatus(status);
+      showToast('Telegram-бот запущен', 'success');
+      return status;
+    } catch (error) {
+      console.error('Failed to start bot', error);
+      showToast('Не удалось запустить Telegram-бота', 'error');
+      throw error;
+    }
+  };
+
+  const handleStopBot = async () => {
+    try {
+      const status = await stopBotApi();
+      setBotStatus(status);
+      showToast('Telegram-бот остановлен', 'info');
+      return status;
+    } catch (error) {
+      console.error('Failed to stop bot', error);
+      showToast('Не удалось остановить Telegram-бота', 'error');
+      throw error;
+    }
+  };
+
+  const handleUpdateBotToken = async (token) => {
+    try {
+      const status = await setBotTokenApi(token);
+      setBotStatus(status);
+      showToast(token ? 'Токен Telegram сохранён' : 'Токен Telegram удалён', 'success');
+      return status;
+    } catch (error) {
+      console.error('Failed to update bot token', error);
+      showToast('Не удалось сохранить токен Telegram', 'error');
+      throw error;
+    }
+  };
+
+  const handleRefreshBotStatusClick = async () => {
+    const status = await refreshBotStatus();
+    if (status) {
+      showToast('Статус Telegram-бота обновлён', 'info');
+    }
+  };
+
+  const handleCopyDeeplink = async () => {
+    if (!botStatus?.deeplinkBase) {
+      showToast('Сначала запустите Telegram-бота', 'info');
+      return;
+    }
+
+    if (!selectedProject) {
+      showToast('Выберите проект, чтобы сгенерировать deeplink', 'info');
+      return;
+    }
+
+    const deeplink = `${botStatus.deeplinkBase}${selectedProject.id}`;
+
+    try {
+      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
+        await navigator.clipboard.writeText(deeplink);
+      } else {
+        const textarea = document.createElement('textarea');
+        textarea.value = deeplink;
+        textarea.setAttribute('readonly', '');
+        textarea.style.position = 'absolute';
+        textarea.style.left = '-9999px';
+        document.body.appendChild(textarea);
+        textarea.select();
+        document.execCommand('copy');
+        document.body.removeChild(textarea);
+      }
+
+      showToast('Deeplink скопирован в буфер обмена', 'success');
+    } catch (error) {
+      console.error('Failed to copy deeplink', error);
+      showToast('Не удалось скопировать deeplink', 'error');
+    }
+  };
+
+  const selectedBrief = useMemo(
+    () => briefs.find((item) => item.id === selectedBriefId) || null,
+    [briefs, selectedBriefId]
+  );
+
   const handleCreatePipeline = async (pipeline) => {
     if (!pipeline) {
-      return;
+      return null;
     }
 
     try {
-      await upsertPipeline(pipeline);
+      const response = await upsertPipeline(pipeline);
+      const saved = response?.pipeline ?? response;
       await refreshPipelines();
+      showToast(`Версия ${pipeline.version || '0.0.1'} для «${pipeline.name}» сохранена`, 'success');
+      return saved;
     } catch (error) {
       console.error('Failed to create pipeline', error);
       showToast('Не удалось сохранить пайплайн', 'error');
+      throw error;
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
-            onSelectProject={setSelectedProjectId}
+            onSelectProject={handleSelectProject}
             onNotify={showToast}
           />
         );
       case 'brief':
         return (
           <BriefPage
             project={selectedProject}
-            brief={brief}
-            onUpdateBrief={handleUpdateBrief}
+            briefs={briefs}
+            selectedBrief={selectedBrief}
+            onSelectBrief={handleSelectBrief}
+            onRefresh={handleRefreshBriefs}
+            onSaveBrief={handleSaveBrief}
+            onGeneratePlan={handleGeneratePlan}
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
-            brief={brief}
+            brief={selectedBrief?.content || DEFAULT_BRIEF}
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
+            botStatus={botStatus}
+            onRefreshBot={handleRefreshBotStatusClick}
+            onStartBot={handleStartBot}
+            onStopBot={handleStopBot}
+            onUpdateToken={handleUpdateBotToken}
+            onCopyDeeplink={handleCopyDeeplink}
+            selectedProject={selectedProject}
           />
         );
     }
   }, [
     activeSection,
     agentsData,
-    brief,
+    briefs,
     pipelines,
     projects,
     providerStatus,
     providerUpdatedAt,
     runs,
+    selectedBrief,
     selectedProject,
-    selectedProjectId
+    selectedProjectId,
+    botStatus
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