import {
  buildPreferenceStepSummaries,
} from '../../study/preferences';
import type { StudyScenarioStepBriefs } from '../../study/sessionStorage';

interface ScenarioBriefingProps {
  title: string;
  background?: string;
  story: string;
  stepBriefs?: StudyScenarioStepBriefs;
  narratorPreferenceTypes: string[];
  seatRows?: string[];
  compact?: boolean;
}

const STEP_ORDER: Array<keyof StudyScenarioStepBriefs> = [
  'movie',
  'theater',
  'date',
  'time',
  'seat',
  'confirm',
];

const STAGE_LABELS: Record<keyof StudyScenarioStepBriefs, string> = {
  movie: 'Movie',
  theater: 'Theater',
  date: 'Date',
  time: 'Showtime',
  seat: 'Seat',
  confirm: 'Confirm',
};

function buildStepContent(
  stepBriefs: StudyScenarioStepBriefs | undefined,
  preferenceTypes: string[],
  seatRows?: string[]
) {
  const hardcoded = STEP_ORDER
    .map((stage, index) => {
      const text = stepBriefs?.[stage]?.trim() ?? '';
      if (!text) return null;
      return {
        stage,
        step: index + 1,
        stageLabel: STAGE_LABELS[stage],
        sentence: text,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (hardcoded.length > 0) return hardcoded;
  return buildPreferenceStepSummaries(preferenceTypes, { seatRows });
}

function PreferenceByStep({
  stepBriefs,
  preferenceTypes,
  seatRows,
}: {
  stepBriefs?: StudyScenarioStepBriefs;
  preferenceTypes: string[];
  seatRows?: string[];
}) {
  const summaries = buildStepContent(stepBriefs, preferenceTypes, seatRows);

  if (summaries.length === 0) {
    return <div className="text-sm text-fg-muted">No preferences provided.</div>;
  }

  return (
    <div className="space-y-3">
      {summaries.map((summary) => (
        <section key={summary.stage} className="overflow-hidden rounded-lg border border-dark-border">
          <div className="border-b border-dark-border bg-dark-light/70 px-3 py-2">
            <h4 className="text-sm font-semibold text-fg-strong">
              Step {summary.step}. {summary.stageLabel} stage
            </h4>
          </div>
          <div className="px-3 py-3">
            <p className="text-sm leading-6 text-fg">{summary.sentence}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

function ScenarioBriefingBody({
  title,
  background,
  story,
  stepBriefs,
  narratorPreferenceTypes,
  seatRows,
}: Omit<ScenarioBriefingProps, 'compact'>) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-fg-strong">{title}</h2>
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Background</h3>
        <p className="text-sm leading-6 text-fg">{background || story}</p>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          By Step (Stage Order)
        </h3>
        <PreferenceByStep
          stepBriefs={stepBriefs}
          preferenceTypes={narratorPreferenceTypes}
          seatRows={seatRows}
        />
      </section>
    </div>
  );
}

export function ScenarioBriefing({
  title,
  background,
  story,
  stepBriefs,
  narratorPreferenceTypes,
  seatRows,
  compact = false,
}: ScenarioBriefingProps) {
  if (compact) {
    return (
      <details className="rounded-lg border border-dark-border bg-dark p-3">
        <summary className="cursor-pointer text-sm font-semibold text-fg-strong">
          Scenario briefing
        </summary>
        <div className="mt-3 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
          <ScenarioBriefingBody
            title={title}
            background={background}
            story={story}
            stepBriefs={stepBriefs}
            narratorPreferenceTypes={narratorPreferenceTypes}
            seatRows={seatRows}
          />
        </div>
      </details>
    );
  }

  return (
    <div className="rounded-xl border border-dark-border bg-dark p-4">
      <ScenarioBriefingBody
        title={title}
        background={background}
        story={story}
        stepBriefs={stepBriefs}
        narratorPreferenceTypes={narratorPreferenceTypes}
        seatRows={seatRows}
      />
    </div>
  );
}
