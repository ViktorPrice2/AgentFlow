import type { FC } from 'react';

export interface PlanNodeView {
  id: string;
  agent: string;
  status?: string;
  dependsOn?: string[];
}

interface PlanGraphProps {
  nodes: PlanNodeView[];
}

export const PlanGraph: FC<PlanGraphProps> = ({ nodes }) => {
  return (
    <div className="space-y-2">
      {nodes.map((node) => (
        <div key={node.id} className="rounded border border-slate-200 p-3">
          <div className="font-medium text-primary">{node.agent}</div>
          <div className="text-xs text-slate-500">{node.id}</div>
          {node.status && <div className="mt-1 text-sm">Status: {node.status}</div>}
          {node.dependsOn && node.dependsOn.length > 0 && (
            <div className="text-xs text-slate-400">Depends on: {node.dependsOn.join(', ')}</div>
          )}
        </div>
      ))}
    </div>
  );
};
