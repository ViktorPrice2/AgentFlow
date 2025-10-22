import type { FC } from 'react';

export interface LogEntry {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface LogsPanelProps {
  logs: LogEntry[];
}

export const LogsPanel: FC<LogsPanelProps> = ({ logs }) => {
  return (
    <div className="h-48 overflow-auto rounded border border-slate-200 bg-white p-3 text-sm">
      {logs.length === 0 && <div className="text-slate-400">No logs available.</div>}
      {logs.map((log) => (
        <div key={log.id} className="border-b border-slate-100 py-1 last:border-none">
          <div className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</div>
          <div className="font-medium capitalize text-slate-600">{log.type}</div>
          <div className="text-slate-700">{log.message}</div>
        </div>
      ))}
    </div>
  );
};
