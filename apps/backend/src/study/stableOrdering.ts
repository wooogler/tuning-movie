import { createHash } from 'crypto';

interface StudyRecordLike {
  scenarioId?: string;
}

interface StudyLike {
  record?: StudyRecordLike;
}

interface StudyRequestLike {
  study?: StudyLike;
}

function getOrderingSeed(request: StudyRequestLike): string {
  const configuredSeed = process.env.STUDY_UI_ORDER_SEED?.trim();
  if (configuredSeed) return configuredSeed;

  const scenarioId = request.study?.record?.scenarioId;
  if (typeof scenarioId === 'string' && scenarioId.trim()) {
    return `scenario:${scenarioId.trim()}`;
  }

  return 'study-ui-order-v1';
}

function stableRank(seed: string, scope: string, id: string): string {
  return createHash('sha256').update(`${seed}::${scope}::${id}`).digest('hex');
}

export function stableShuffleForSession<T>(
  request: StudyRequestLike,
  items: T[],
  scope: string,
  getId: (item: T) => string
): T[] {
  const seed = getOrderingSeed(request);

  return items
    .map((item, index) => ({
      item,
      index,
      rank: stableRank(seed, scope, getId(item)),
    }))
    .sort((left, right) => {
      const rankComparison = left.rank.localeCompare(right.rank);
      if (rankComparison !== 0) return rankComparison;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}
