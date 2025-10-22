import { describe, it, expect, beforeEach, vi } from 'vitest';

let storeMock;
let createEntityStoreSpy;

function createStoreMock() {
  const projects = new Map();

  return {
    getProjectById: vi.fn((id) => projects.get(id) || null),
    saveProject: vi.fn((project) => {
      if (!project || !project.id) {
        throw new Error('project.id is required');
      }

      const existing = projects.get(project.id) || {};
      const presetDraft =
        project.presetDraft !== undefined ? project.presetDraft : existing.presetDraft || {};
      const saved = {
        ...existing,
        ...project,
        id: project.id,
        name: project.name,
        presetDraft,
        channels: project.channels || existing.channels || []
      };

      projects.set(project.id, saved);
      return saved;
    }),
    listTelegramContacts: vi.fn(() => []),
    saveTelegramContact: vi.fn(),
    getTelegramContactByChatId: vi.fn(() => null),
    saveBrief: vi.fn(),
    getLatestBrief: vi.fn(() => null)
  };
}

vi.mock('electron', () => ({
  default: {
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn()
    }
  }
}));

vi.mock('telegraf', () => ({
  Telegraf: class {
    constructor() {
      this.telegram = {
        setMyCommands: vi.fn(),
        sendMessage: vi.fn()
      };
    }

    launch() {
      return Promise.resolve();
    }

    stop() {}
    use() {}
    command() {
      return this;
    }
    hears() {
      return this;
    }
    on() {
      return this;
    }
  }
}));

vi.mock('global-agent', () => ({
  bootstrap: vi.fn()
}));

vi.mock('../../app/core/agents/BriefMaster/index.js', () => ({
  execute: vi.fn(() => ({}))
}));

vi.mock('../../app/core/storage/entityStore.js', () => {
  createEntityStoreSpy = vi.fn(() => storeMock);
  return {
    createEntityStore: createEntityStoreSpy
  };
});

let ipcTest;

beforeEach(async () => {
  storeMock = createStoreMock();
  vi.resetModules();
  if (createEntityStoreSpy) {
    createEntityStoreSpy.mockImplementation(() => storeMock);
  }
  ({ __test__: ipcTest } = await import('../../app/main/ipcBot.js'));
});

describe('ipcBot follow-up helpers', () => {
  it('prefers fallback project name when record missing', () => {
    const result = ipcTest.deriveProjectNameForUpdate(null, 'project-1', 'Acme Inc');
    expect(result).toBe('Acme Inc');
  });

  it('preserves existing project name when present', () => {
    const result = ipcTest.deriveProjectNameForUpdate({ name: 'Existing' }, 'project-2', 'Acme');
    expect(result).toBe('Existing');
  });

  it('overrides placeholder name with inferred value', () => {
    const result = ipcTest.deriveProjectNameForUpdate({ name: 'project-3' }, 'project-3', 'New Name');
    expect(result).toBe('New Name');
  });

  it('falls back to project id when nothing else is available', () => {
    const result = ipcTest.deriveProjectNameForUpdate(null, 'project-4');
    expect(result).toBe('project-4');
  });

  it('infers project name for company questions', () => {
    const question = { id: 'company_name', prompt: 'What is the name of your company or product?' };
    const inferred = ipcTest.inferProjectNameFromFollowUp(question, 'Acme Labs');
    expect(inferred).toBe('Acme Labs');
  });

  it('returns null for non-name follow-up questions', () => {
    const question = { id: 'campaign_goal', prompt: 'What is the main goal?' };
    const inferred = ipcTest.inferProjectNameFromFollowUp(question, 'Grow leads');
    expect(inferred).toBeNull();
  });

  it('creates placeholder project when saving follow-up without existing record', async () => {
    const question = { id: 'company_name', prompt: 'What is the name of your company or product?' };

    const result = await ipcTest.saveFollowUpAnswer('project-x', question, {
      answer: 'New Project',
      source: 'telegram'
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].answer).toBe('New Project');

    const savedRecord = storeMock.getProjectById('project-x');
    expect(savedRecord).toBeTruthy();
    expect(savedRecord.name).toBe('New Project');
    expect(savedRecord.presetDraft.additionalQuestions[0].answer).toBe('New Project');
  });

  it('uses project id as fallback name when answer is skipped', async () => {
    const question = { id: 'follow_up', prompt: 'Provide any other notes' };

    await ipcTest.saveFollowUpAnswer('project-y', question, {
      answer: '',
      skipped: true,
      source: 'telegram'
    });

    const savedRecord = storeMock.getProjectById('project-y');
    expect(savedRecord).toBeTruthy();
    expect(savedRecord.name).toBe('project-y');
    expect(savedRecord.presetDraft.additionalQuestions[0].answer).toBe('');
  });
});
