import type {
  ScenarioDatasetShowing,
  ScenarioSeatOverride,
  ScenarioSeatTemplate,
} from '../study/scenarioDataset';

type SeatType = 'standard' | 'premium' | 'couple';
type SeatStatus = 'available' | 'occupied';

export interface ScenarioSeatRow {
  id: string;
  showingId: string;
  row: string;
  number: number;
  type: SeatType;
  price: number;
  status: SeatStatus;
}

interface SeatOverrideAccumulator {
  occupiedNumbers: Set<number>;
  availableNumbers: Set<number>;
}

function keyForOverride(showingId: string, row: string): string {
  return `${showingId}::${row}`;
}

function buildOverrideMap(overrides: ScenarioSeatOverride[]): Map<string, SeatOverrideAccumulator> {
  const map = new Map<string, SeatOverrideAccumulator>();

  for (const override of overrides) {
    const key = keyForOverride(override.showingId, override.row);
    const current = map.get(key) ?? {
      occupiedNumbers: new Set<number>(),
      availableNumbers: new Set<number>(),
    };

    for (const number of override.occupiedNumbers ?? []) {
      current.occupiedNumbers.add(number);
    }
    for (const number of override.availableNumbers ?? []) {
      current.availableNumbers.add(number);
    }

    map.set(key, current);
  }

  return map;
}

export function buildScenarioSeats(
  showings: ScenarioDatasetShowing[],
  seatTemplate: ScenarioSeatTemplate,
  seatOverrides: ScenarioSeatOverride[]
): ScenarioSeatRow[] {
  const rowRuleMap = new Map(
    (seatTemplate.rowRules ?? []).map((rule) => [rule.row, rule])
  );
  const overrideMap = buildOverrideMap(seatOverrides);
  const defaultStatus = seatTemplate.defaultStatus ?? 'available';
  const seatsPerShowing = seatTemplate.rows.length * seatTemplate.seatsPerRow;

  const seats: ScenarioSeatRow[] = [];

  for (const showing of showings) {
    if (showing.totalSeats !== seatsPerShowing) {
      throw new Error(
        `[${showing.id}] totalSeats=${showing.totalSeats} does not match template seats=${seatsPerShowing}`
      );
    }

    for (const row of seatTemplate.rows) {
      const rowRule = rowRuleMap.get(row);
      const type = (rowRule?.type ?? seatTemplate.defaultType) as SeatType;
      const price = rowRule?.price ?? seatTemplate.defaultPrice;
      const override = overrideMap.get(keyForOverride(showing.id, row));

      for (let number = 1; number <= seatTemplate.seatsPerRow; number++) {
        let status: SeatStatus = defaultStatus;

        if (override?.occupiedNumbers.has(number)) {
          status = 'occupied';
        }
        if (override?.availableNumbers.has(number)) {
          status = 'available';
        }

        seats.push({
          id: `${showing.id}-${row}${number}`,
          showingId: showing.id,
          row,
          number,
          type,
          price,
          status,
        });
      }
    }
  }

  return seats;
}
