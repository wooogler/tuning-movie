# Set 1 Easy Breakdown

## Scenario

- Child playdate aftercare outing on Sunday, with the playdate ending around 11:00 AM
- User wants a family movie that is short and age-appropriate
- Main recovery pattern: same movie, same theater, same date, different showtime

## Hard Preferences

- Must be rated G or PG
- Sunday only
- Must end by 6:00 PM
- Must allow 3 adjacent seats
- Avoid front rows

## Soft Preferences

- Family-friendly recommendation
- Short runtime preferred
- Avoid a long gap after the playdate
- Lower seat price preferred

## Step-by-step Interpretation

1. `Movie`: choose a family movie using `genre`, `ageRating`, `duration`, `synopsis`
2. `Theater`: choose the closest theater
3. `Date`: choose Sunday
4. `Showtime`: choose the earliest plausible time so there is not a long gap after the playdate
5. `Seat`: discover that acceptable 3-seat adjacency does not exist
6. `Showtime` backtrack: inspect another time at the same theater/date
7. `Seat`: find an acceptable 3-seat block at a reasonable row/price
8. `Confirm`: complete booking

## First Failure Evidence

- Stage: `Seat`
- Observable evidence: only front-row seats or non-adjacent seats remain
- Why backtrack happens: the failure is seat-specific, so changing showtime is the smallest valid repair

## DB Composition Guidance

### Movies

- Include 3-4 family-oriented titles
- One target movie should clearly fit the required `G/PG` rating and short runtime
- Other titles may be slightly longer, older, or less suitable by synopsis/ageRating

### Theaters

- One closest theater should be the intended path
- Optional decoy theaters can exist, but theater should not become the main alternative stage

### Dates

- Sunday should be the only intended date
- Other dates may exist, but Sunday should be the clearly valid choice

### Showings

- For the target movie at the chosen theater on Sunday, provide at least 2 plausible showtimes
- First showtime should look valid on time grounds and be attractive because it keeps the day moving after the playdate
- Second showtime should also satisfy time constraints and be the successful branch

### Seats

- First showtime: no acceptable 3-seat block once front rows are excluded
- Second showtime: at least one 3-seat block in a non-front row
- Price variation by row should make cheaper rows slightly preferable without blocking success

### Assertions

- First showtime fails due to seat pattern only
- Second showtime succeeds without changing movie/theater/date
