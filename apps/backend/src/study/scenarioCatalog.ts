import fs from 'fs';
import path from 'path';
import type { ScenarioDefinition } from './types';

interface ScenarioCatalogFile {
  scenarios?: ScenarioDefinition[];
}

function getCatalogCandidates(): string[] {
  return [
    path.resolve(process.cwd(), 'apps/backend/scenarios/catalog.json'),
    path.resolve(process.cwd(), 'scenarios/catalog.json'),
    path.resolve(__dirname, '../../scenarios/catalog.json'),
  ];
}

export function resolveScenarioCatalogPath(): string {
  for (const candidate of getCatalogCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return getCatalogCandidates()[0];
}

export function resolveScenarioTemplateDir(): string {
  const catalogPath = resolveScenarioCatalogPath();
  return path.resolve(path.dirname(catalogPath), 'db-templates');
}

function validateScenario(raw: unknown): ScenarioDefinition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const story = typeof record.story === 'string' ? record.story.trim() : '';
  const templateDbFile =
    typeof record.templateDbFile === 'string' ? record.templateDbFile.trim() : '';
  const seedDataFile =
    typeof record.seedDataFile === 'string' ? record.seedDataFile.trim() : '';
  const narratorPreferenceTypes = Array.isArray(record.narratorPreferenceTypes)
    ? record.narratorPreferenceTypes.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
      )
    : [];

  if (!id || !title || !story || !templateDbFile || narratorPreferenceTypes.length === 0) {
    return null;
  }

  let seedFilters: ScenarioDefinition['seedFilters'] | undefined;
  const rawSeedFilters = record.seedFilters;
  if (rawSeedFilters && typeof rawSeedFilters === 'object' && !Array.isArray(rawSeedFilters)) {
    const seedRecord = rawSeedFilters as Record<string, unknown>;
    const includeMovieIds = Array.isArray(seedRecord.includeMovieIds)
      ? seedRecord.includeMovieIds.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : undefined;
    const includeTheaterIds = Array.isArray(seedRecord.includeTheaterIds)
      ? seedRecord.includeTheaterIds.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : undefined;
    seedFilters = {
      includeMovieIds,
      includeTheaterIds,
    };
  }

  return {
    id,
    title,
    story,
    narratorPreferenceTypes,
    templateDbFile,
    ...(seedDataFile ? { seedDataFile } : {}),
    seedFilters,
  };
}

function loadCatalogFromDisk(): ScenarioDefinition[] {
  const catalogPath = resolveScenarioCatalogPath();
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Scenario catalog not found: ${catalogPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf-8')) as ScenarioCatalogFile;
  const scenarios = Array.isArray(parsed.scenarios)
    ? parsed.scenarios.map(validateScenario).filter((item): item is ScenarioDefinition => item !== null)
    : [];

  if (scenarios.length === 0) {
    throw new Error(`Scenario catalog has no valid scenarios: ${catalogPath}`);
  }

  const duplicate = scenarios.find(
    (scenario, index) => scenarios.findIndex((candidate) => candidate.id === scenario.id) !== index
  );
  if (duplicate) {
    throw new Error(`Duplicate scenario id in catalog: ${duplicate.id}`);
  }

  return scenarios;
}

let cachedScenarios: ScenarioDefinition[] | null = null;

export function getScenarioCatalog(forceReload = false): ScenarioDefinition[] {
  if (!cachedScenarios || forceReload) {
    cachedScenarios = loadCatalogFromDisk();
  }
  return cachedScenarios;
}

export function getScenarioById(scenarioId: string): ScenarioDefinition | null {
  const normalized = scenarioId.trim();
  return getScenarioCatalog().find((scenario) => scenario.id === normalized) ?? null;
}

export function getScenarioTemplatePath(scenario: ScenarioDefinition): string {
  return path.resolve(resolveScenarioTemplateDir(), scenario.templateDbFile);
}
