import { describe, expect, it, vi, afterEach } from 'vitest';

function resetEnvironment() {
  vi.resetModules();
  vi.unstubAllGlobals();
}

describe('renderer agentApi reports fallbacks', () => {
  afterEach(() => {
    resetEnvironment();
  });

  it('returns bundled fallback reports when IPC is unavailable', async () => {
    vi.stubGlobal('window', undefined);

    const { listReports, getReport } = await import('../../app/renderer/src/api/agentApi.js');
    const reports = await listReports();

    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);

    const report = await getReport(reports[0].id);
    expect(report).toEqual(expect.objectContaining({ id: reports[0].id }));
    expect(Array.isArray(report.artifacts)).toBe(true);
  });

  it('falls back to offline data when IPC calls fail', async () => {
    const listReportsMock = vi.fn().mockRejectedValue(new Error('ipc failure'));
    const getReportMock = vi.fn().mockRejectedValue(new Error('ipc failure'));

    vi.stubGlobal('window', {
      AgentAPI: {
        listReports: listReportsMock,
        getReport: getReportMock
      }
    });

    const { listReports, getReport } = await import('../../app/renderer/src/api/agentApi.js');

    const reports = await listReports();
    expect(listReportsMock).toHaveBeenCalledTimes(1);
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);

    const result = await getReport('missing-report');
    expect(getReportMock).toHaveBeenCalledWith('missing-report');
    expect(result).toBeNull();
  });
});
