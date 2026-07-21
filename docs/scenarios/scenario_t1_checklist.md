# Scenario T1 Validation Checklist

## Preconditions

- `FIXED_CURRENT_DATE=2026-03-11`
- Backend seeded with scenario templates:
  - `npm run db:seed:scenarios`
- T1 verification passes:
  - `npm run db:verify:scenario:t1`

## Setup Checks

- Setup page shows the tutorial scenario:
  - `Tutorial: Solo Weekend 3D`
- The tutorial scenario appears before the numbered `S*-T*` scenarios.

## Data Checks (UI/API)

- Movie list includes `Cosmic Laughs`.
- Theater list includes:
  - `Skyline Multiplex` at `3` miles
  - `Cedar Point Cinema` at `8` miles
  - `North County Screen Center` at `12.4` miles

## Attempt Path Checks

### Attempt 1: Skyline Multiplex

- Valid weekend dates are limited to:
  - `2026-03-14`
  - `2026-03-15`
- For `Cosmic Laughs + Skyline Multiplex`, 3D showtimes include:
  - `15:00`
  - `17:30`
  - `19:30`
- Only `15:00` can satisfy the before-7-PM constraint.
- At `15:00`, centered seats are not available in the acceptable middle area.

### Attempt 2: Cedar Point Cinema

- `Cedar Point Cinema` is still within the 10-mile limit.
- For `Cosmic Laughs + Cedar Point Cinema`, `15:00` 3D is available.
- At `15:00`, a centered seat is available and the booking path can complete.

## Acceptance

- `npm run db:verify:scenario:t1` exits with status code `0`.
- Creating a study session with `scn_t1_solo_weekend_3d_tutorial` succeeds.
