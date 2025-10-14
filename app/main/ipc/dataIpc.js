import {
  listProjects,
  upsertProject,
  getProject
} from '../../db/repositories/projectsRepository.js';
import {
  listBriefsByProject,
  upsertBrief,
  getBrief
} from '../../db/repositories/briefsRepository.js';
import { buildPlan } from '../../services/tg-bot/survey.js';

export function registerDataIpcHandlers(ipcMain) {
  if (!ipcMain) {
    throw new Error('ipcMain is required to register data handlers');
  }

  ipcMain.handle('AgentFlow:projects:list', async () => {
    return listProjects();
  });

  ipcMain.handle('AgentFlow:projects:upsert', async (_event, payload) => {
    return upsertProject(payload);
  });

  ipcMain.handle('AgentFlow:projects:get', async (_event, projectId) => {
    if (!projectId) {
      return null;
    }

    return getProject(projectId);
  });

  ipcMain.handle('AgentFlow:briefs:list', async (_event, projectId) => {
    if (!projectId) {
      return [];
    }

    return listBriefsByProject(projectId);
  });

  ipcMain.handle('AgentFlow:briefs:get', async (_event, briefId) => {
    if (!briefId) {
      return null;
    }

    return getBrief(briefId);
  });

  ipcMain.handle('AgentFlow:briefs:upsert', async (_event, payload) => {
    if (!payload?.projectId) {
      throw new Error('PROJECT_ID_REQUIRED');
    }

    return upsertBrief(payload);
  });

  ipcMain.handle('AgentFlow:briefs:plan', async (_event, { answers, projectId }) => {
    const project = projectId ? await getProject(projectId) : null;
    return buildPlan(answers ?? {}, project);
  });

  return () => {
    ipcMain.removeHandler('AgentFlow:projects:list');
    ipcMain.removeHandler('AgentFlow:projects:upsert');
    ipcMain.removeHandler('AgentFlow:projects:get');
    ipcMain.removeHandler('AgentFlow:briefs:list');
    ipcMain.removeHandler('AgentFlow:briefs:get');
    ipcMain.removeHandler('AgentFlow:briefs:upsert');
    ipcMain.removeHandler('AgentFlow:briefs:plan');
  };
}
