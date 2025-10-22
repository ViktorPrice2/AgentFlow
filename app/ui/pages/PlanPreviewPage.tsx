import type { PlanNodeView } from '../components/PlanGraph.js';
import { PlanGraph } from '../components/PlanGraph.js';
import { useI18n } from '../hooks/useI18n.js';

interface PlanPreviewPageProps {
  nodes: PlanNodeView[];
  onAccept(): void;
}

export function PlanPreviewPage({ nodes, onAccept }: PlanPreviewPageProps) {
  const { t } = useI18n('en');
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-primary">{t('planPreview')}</h2>
        <button
          type="button"
          className="rounded bg-secondary px-3 py-1 text-white"
          onClick={onAccept}
        >
          Continue
        </button>
      </div>
      <PlanGraph nodes={nodes} />
    </div>
  );
}
