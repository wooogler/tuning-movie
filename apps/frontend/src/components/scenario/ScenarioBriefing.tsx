import {
  buildPreferenceRows,
  getStoryHighlightPhrases,
  getPreferenceStageOrder,
  getPreferenceStepMeta,
  type PreferencePriority,
  type PreferenceRow,
  type PreferenceStage,
} from '../../study/preferences';
import type { ReactNode } from 'react';

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

interface PreferenceStepGroup {
  stage: PreferenceStage;
  step: number;
  label: string;
  rows: PreferenceRow[];
}

function normalizeHighlightPhrases(phrases: string[]): string[] {
  return [...new Set(phrases.map((phrase) => phrase.trim()).filter((phrase) => phrase.length > 0))]
    .sort((a, b) => b.length - a.length);
}

function findNextHighlight(
  text: string,
  startIndex: number,
  phrases: string[]
): { start: number; end: number } | null {
  const source = text.toLocaleLowerCase();
  let bestStart = -1;
  let bestLength = 0;

  for (const phrase of phrases) {
    const candidate = phrase.toLocaleLowerCase();
    const index = source.indexOf(candidate, startIndex);
    if (index < 0) continue;
    if (bestStart < 0 || index < bestStart || (index === bestStart && candidate.length > bestLength)) {
      bestStart = index;
      bestLength = candidate.length;
    }
  }

  if (bestStart < 0) return null;
  return { start: bestStart, end: bestStart + bestLength };
}

function renderStoryTextWithHighlights(text: string, phrases: string[]): ReactNode[] {
  if (text.length === 0) return [text];

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let partIndex = 0;

  while (cursor < text.length) {
    const match = findNextHighlight(text, cursor, phrases);
    if (!match) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (match.start > cursor) {
      nodes.push(text.slice(cursor, match.start));
    }

    nodes.push(
      <strong key={`story-highlight-${partIndex}`} className="font-semibold text-fg-strong">
        {text.slice(match.start, match.end)}
      </strong>
    );
    cursor = match.end;
    partIndex += 1;
  }

  return nodes;
}

function groupRowsByStep(preferenceTypes: string[]): PreferenceStepGroup[] {
  const rows = buildPreferenceRows(preferenceTypes);
  const grouped = new Map<PreferenceStage, PreferenceRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.stage) ?? [];
    existing.push(row);
    grouped.set(row.stage, existing);
  }

  return getPreferenceStageOrder()
    .map((stage) => {
      const meta = getPreferenceStepMeta(stage);
      return {
        stage,
        step: meta.step,
        label: meta.label,
        rows: grouped.get(stage) ?? [],
      };
    })
    .filter((group) => group.rows.length > 0);
}

function PreferenceByStep({ preferenceTypes }: { preferenceTypes: string[] }) {
  const groups = groupRowsByStep(preferenceTypes);

  if (groups.length === 0) {
    return <div className="text-sm text-fg-muted">No preferences provided.</div>;
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section key={group.stage} className="overflow-hidden rounded-lg border border-dark-border">
          <div className="flex items-center justify-between gap-2 border-b border-dark-border bg-dark-light/70 px-3 py-2">
            <h4 className="text-sm font-semibold text-fg-strong">
              Step {group.step}. {group.label}
            </h4>
            <span className="text-xs text-fg-muted">{group.rows.length} items</span>
          </div>
          <ul className="divide-y divide-dark-border">
            {group.rows.map((row, index) => (
              <li
                key={`${row.id}-${index}`}
                className="flex items-start justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-fg-strong">{row.label}</p>
                  {row.description ? (
                    <p className="text-xs leading-5 text-fg-muted">{row.description}</p>
                  ) : null}
                </div>
                <span
                  className={`mt-0.5 inline-flex rounded border px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(row.priority)}`}
                >
                  {priorityLabel(row.priority)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ScenarioBriefingBody({
  title,
  story,
  narratorPreferenceTypes,
}: Omit<ScenarioBriefingProps, 'compact'>) {
  const highlightPhrases = normalizeHighlightPhrases(
    getStoryHighlightPhrases(narratorPreferenceTypes)
  );
  const storyLines = story.split('\n');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-fg-strong">{title}</h2>
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Story</h3>
        <p className="text-sm leading-6 whitespace-pre-line text-fg">
          {storyLines.map((line, index) => (
            <span key={`story-line-${index}`}>
              {renderStoryTextWithHighlights(line, highlightPhrases)}
              {index < storyLines.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Preferences by Step
        </h3>
        <PreferenceByStep preferenceTypes={narratorPreferenceTypes} />
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
