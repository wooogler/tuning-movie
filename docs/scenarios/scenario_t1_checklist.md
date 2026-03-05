# Scenario T1 Validation Checklist

## Preconditions
- `FIXED_CURRENT_DATE=2026-03-11`
- Backend seeded with scenario templates:
  - `npm run db:seed:scenarios`
- T1 verification passes:
  - `npm run db:verify:scenario:t1`

## Setup Checks
- Setup page shows exactly one scenario:
  - `T1: College Weekend Group Booking`
- Start session with any study mode, including `Baseline`.

## Data Checks (UI/API)
- Movie list includes:
  - `Desk for Two`, `Love Punchline`, `Cosmic Laughs`, `Happy Feet Friday`
- Theater list includes out-of-range theater:
  - `Hilltop Screening Room` with `12` miles

## Attempt Path Checks (C2~C8)

### Attempt 1: Cosmic Laughs at Theater A
- Date options for `Cosmic Laughs + Theater A`:
  - includes opening `2026-03-15` (Sunday) and following weekdays
  - in the target weekend (`2026-03-14`~`2026-03-15`), only Sunday is available
- Time options include:
  - `10:30`, `13:00`, `15:30`, `20:00`
- Seat row B adjacency:
  - `13:00`: no 3 adjacent (C2)
  - `15:30`: no 3 adjacent (C3)
  - `20:00`: 3 adjacent exists (C4 candidate, but late-ending runtime conflict)

### Attempt 2: Cosmic Laughs at Theater B
- Date options for `Cosmic Laughs + Theater B`:
  - `2026-03-16` and later only
  - no weekend date (C5)

### Attempt 3: Love Punchline
- Date options for `Love Punchline + Theater A`:
  - through `2026-03-13` only (C6)
- Date options for `Love Punchline + Theater C`:
  - includes `2026-03-14` (Saturday), excludes Sunday
- Saturday time options at Theater C:
  - `10:00`, `14:00`, `16:30`, `19:00`
- Seat row B adjacency:
  - `14:00`: no 3 adjacent (C7)
  - `16:30`: no 3 adjacent (C8)
  - `19:00`: 3 adjacent exists (final success path)

## Acceptance
- All checks above pass without manual DB edits.
- `npm run db:verify:scenario:t1` exits with status code `0`.
