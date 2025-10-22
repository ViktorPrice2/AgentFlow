import { LogsPanel } from '../components/LogsPanel.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface RunView {
  id: string;
  nodeId: string;
  agentName: string;
  status: string;
}

interface ProgressPageProps {
  runs: RunView[];
  logs: Array<{ id: string; type: string; message: string; timestamp: string }>;
  onPause(): void;
  onResume(): void;
}

export function ProgressPage({ runs, logs, onPause, onResume }: ProgressPageProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-primary">Execution progress</h2>
        <div className="space-x-2">
          <button className="rounded bg-slate-200 px-3 py-1" onClick={onPause}>
            Pause
          </button>
          <button className="rounded bg-primary px-3 py-1 text-white" onClick={onResume}>
            Resume
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="rounded border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-700">{run.agentName}</div>
                  <div className="text-xs text-slate-400">Node: {run.nodeId}</div>
                </div>
                <StatusBadge status={run.status} />
              </div>
            </div>
          ))}
        </div>
        <LogsPanel logs={logs} />
      </div>
    </div>
  );
}
