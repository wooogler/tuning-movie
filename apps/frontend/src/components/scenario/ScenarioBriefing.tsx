import { buildPreferenceRows, type PreferencePriority } from '../../study/preferences';

interface ScenarioBriefingProps {
  title: string;
  story: string;
  narratorPreferenceTypes: string[];
  compact?: boolean;
}

function priorityLabel(priority: PreferencePriority): string {
  if (priority === 'hard') return 'Hard';
  if (priority === 'soft') return 'Soft';
  return 'Unknown';
}

function priorityBadgeClass(priority: PreferencePriority): string {
  if (priority === 'hard') {
    return 'border-red-500/50 bg-red-500/10 text-red-300';
  }
  if (priority === 'soft') {
    return 'border-sky-500/50 bg-sky-500/10 text-sky-300';
  }
  return 'border-dark-border bg-dark text-fg-muted';
}

function PreferenceTable({ preferenceTypes }: { preferenceTypes: string[] }) {
  const rows = buildPreferenceRows(preferenceTypes);

  if (rows.length === 0) {
    return <div className="text-sm text-fg-muted">No preferences provided.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-dark-border">
      <table className="min-w-full text-left text-xs sm:text-sm">
        <thead className="bg-dark-light/70 text-fg-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Preference</th>
            <th className="px-3 py-2 font-semibold">Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-dark-border">
              <td className="px-3 py-2 text-fg-strong">{row.label}</td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(row.priority)}`}
                >
                  {priorityLabel(row.priority)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScenarioBriefingBody({
  title,
  story,
  narratorPreferenceTypes,
}: Omit<ScenarioBriefingProps, 'compact'>) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-fg-strong">{title}</h2>
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Story</h3>
        <p className="text-sm leading-6 whitespace-pre-line text-fg">{story}</p>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Preferences</h3>
        <PreferenceTable preferenceTypes={narratorPreferenceTypes} />
      </section>
    </div>
  );
}

export function ScenarioBriefing({
  title,
  story,
  narratorPreferenceTypes,
  compact = false,
}: ScenarioBriefingProps) {
  if (compact) {
    return (
      <details className="rounded-lg border border-dark-border bg-dark p-3">
        <summary className="cursor-pointer text-sm font-semibold text-fg-strong">
          Scenario briefing
        </summary>
        <div className="mt-3">
          <ScenarioBriefingBody
            title={title}
            story={story}
            narratorPreferenceTypes={narratorPreferenceTypes}
          />
        </div>
      </details>
    );
  }

  return (
    <div className="rounded-xl border border-dark-border bg-dark p-4">
      <ScenarioBriefingBody
        title={title}
        story={story}
        narratorPreferenceTypes={narratorPreferenceTypes}
      />
    </div>
  );
}
