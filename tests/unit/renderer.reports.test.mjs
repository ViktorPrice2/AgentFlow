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

  it('returns reports from AgentAPI envelope responses', async () => {
    const sampleReport = {
      id: 'api-report-1',
      projectId: 'project-123',
      pipelineId: 'pipeline-xyz',
      status: 'completed',
      title: 'Pipeline result',
      summary: 'Report generated from pipeline run',
      artifacts: ['artifact.txt'],
      createdAt: '2024-11-06T09:30:00.000Z',
      updatedAt: '2024-11-06T09:35:00.000Z'
    };

    const listReportsMock = vi.fn().mockResolvedValue({ ok: true, reports: [sampleReport] });
    const getReportMock = vi.fn().mockResolvedValue({ ok: true, report: sampleReport });

    vi.stubGlobal('window', {
      AgentAPI: {
        listReports: listReportsMock,
        getReport: getReportMock
      }
    });

    const { listReports, getReport } = await import('../../app/renderer/src/api/agentApi.js');

    const reports = await listReports();
    expect(listReportsMock).toHaveBeenCalledWith({});
    expect(Array.isArray(reports)).toBe(true);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(expect.objectContaining({ id: sampleReport.id, title: sampleReport.title }));
    expect(reports[0]).not.toBe(sampleReport);

    const report = await getReport(sampleReport.id);
    expect(getReportMock).toHaveBeenCalledWith(sampleReport.id);
    expect(report).toEqual(expect.objectContaining({ id: sampleReport.id, summary: sampleReport.summary }));
    expect(report).not.toBe(sampleReport);
  });
});
