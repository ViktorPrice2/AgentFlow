interface ArtifactView {
  id: string;
  type: 'text' | 'image' | 'video';
  path: string;
  metadata?: Record<string, unknown>;
}

interface ResultsPageProps {
  text?: string;
  artifacts: ArtifactView[];
}

export function ResultsPage({ text, artifacts }: ResultsPageProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-primary">Results</h2>
      {text && (
        <section className="rounded border border-slate-200 bg-white p-3">
          <h3 className="text-lg font-medium">Text</h3>
          <pre className="whitespace-pre-wrap text-sm text-slate-700">{text}</pre>
        </section>
      )}
      <section className="grid gap-4 md:grid-cols-2">
        {artifacts.map((artifact) => (
          <div key={artifact.id} className="rounded border border-slate-200 bg-white p-3">
            <div className="text-sm font-semibold capitalize">{artifact.type}</div>
            <div className="text-xs text-slate-500">{artifact.path}</div>
            {artifact.type === 'image' && (
              <div className="mt-2">
                <img src={artifact.path} alt="Generated" className="h-32 w-full rounded object-cover" />
              </div>
            )}
            {artifact.type === 'video' && (
              <video controls className="mt-2 h-40 w-full rounded">
                <source src={artifact.path} type="video/mp4" />
              </video>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
