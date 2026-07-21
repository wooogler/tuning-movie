export function toShortScenarioFileLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;

  if (/^scn_t1_.*tutorial/i.test(normalized)) {
    return 'tutorial';
  }

  const scenarioMatch = normalized.match(/^scn_s(\d+)_t\d+_.*_(easy|hard)$/i);
  if (scenarioMatch) {
    const [, setNumber, difficulty] = scenarioMatch;
    return `S${setNumber}-${difficulty.toLowerCase()}`;
  }

  const titleMatch = normalized.match(/^S(\d+)-T\d+:.*\((Easy|Hard)\)$/i);
  if (titleMatch) {
    const [, setNumber, difficulty] = titleMatch;
    return `S${setNumber}-${difficulty.toLowerCase()}`;
  }

  return null;
}

export function toShortScenarioSetFileLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;

  if (/^scn_t1_.*tutorial/i.test(normalized)) {
    return 'tutorial';
  }

  const scenarioMatch = normalized.match(/^scn_s(\d+)_t\d+_/i);
  if (scenarioMatch) {
    const [, setNumber] = scenarioMatch;
    return `S${setNumber}`;
  }

  const titleMatch = normalized.match(/^S(\d+)-T\d+:/i);
  if (titleMatch) {
    const [, setNumber] = titleMatch;
    return `S${setNumber}`;
  }

  return null;
}
