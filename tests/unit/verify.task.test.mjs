import { describe, it, expect, vi, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';

const verifyModule = await import('../../scripts/tasks/verify.mjs');
const { writeReport, writeJson, verifyScheduler, verifyI18n, REPORT_MD, REPORT_JSON } = verifyModule;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verify task report writers', () => {
  it('produces stable markdown output', async () => {
    const spy = vi.spyOn(fs, 'writeFile').mockResolvedValue();

    await writeReport({
      scheduler: { status: 'ok', reason: 'Scheduler heartbeat recorded within the 3 minute threshold' },
      telegram: { status: 'pending', reason: 'Telegram tokens not provided (TG_TOKEN and TG_CHAT_ID)' },
      i18n: { status: 'ok', reason: 'Localization files loaded (en.json, ru.json)' }
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [target, content] = spy.mock.calls[0];
    expect(target).toBe(REPORT_MD);
    expect(content.trim()).toBe(`# Verification Report
- [x] Scheduler: cron */1 * * * * — Scheduler heartbeat recorded within the 3 minute threshold
- [ ] Telegram: IPC handlers — Telegram tokens not provided (TG_TOKEN and TG_CHAT_ID)
- [x] i18n: RU/EN dictionaries — Localization files loaded (en.json, ru.json)`);
  });

  it('writes machine readable summary', async () => {
    const spy = vi.spyOn(fs, 'writeFile').mockResolvedValue();
    const summary = {
      scheduler: { status: 'ok', reason: 'synthetic', meta: {} },
      telegram: { status: 'pending', reason: 'tokens missing', meta: {} },
      i18n: { status: 'ok', reason: 'loaded', meta: {} }
    };

    await writeJson(summary);

    expect(spy).toHaveBeenCalledWith(REPORT_JSON, JSON.stringify(summary, null, 2), 'utf8');
  });
});

describe('verifyScheduler', () => {
  it('returns ok for fresh heartbeat', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.spyOn(fs, 'readFile').mockResolvedValue(
      `${JSON.stringify({ ts: new Date(now - 60 * 1000).toISOString() })}\n`
    );

    const result = await verifyScheduler();
    expect(result.status).toBe('ok');
    expect(result.reason).toBe('Scheduler heartbeat recorded within the 3 minute threshold');
    expect(result.meta.secondsSince).toBe(60);
  });

  it('fails when heartbeat is stale', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.spyOn(fs, 'readFile').mockResolvedValue(
      `${JSON.stringify({ ts: new Date(now - 10 * 60 * 1000).toISOString() })}\n`
    );

    const result = await verifyScheduler();
    expect(result.status).toBe('fail');
    expect(result.reason).toBe('Scheduler heartbeat is older than 3 minutes');
  });
});

describe('verifyI18n', () => {
  it('reports failure when localization files are empty', async () => {
    vi.spyOn(fs, 'readFile').mockResolvedValue('{}');

    const result = await verifyI18n();
    expect(result.status).toBe('fail');
    expect(result.reason).toContain('Empty localization files');
  });
});
