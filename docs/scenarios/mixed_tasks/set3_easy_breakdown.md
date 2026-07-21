# Set 3 Easy Breakdown

## Scenario

- Couple date movie with a hard mystery preference on a limited weekend window (Saturday/Sunday in current design)
- User needs a theater with reclining seats
- Main recovery pattern: first date fails on showtime, second date succeeds

## Hard Preferences

- Must be a mystery movie
- Must use a theater with reclining seats
- Must fit the available weekend date window
- On Saturday, must start after 7:00 PM and end by 10:00 PM
- On Sunday, must end by 6:00 PM

## Soft Preferences

- Not too low-rated
- Couple/back-row seats preferred if affordable

## Step-by-step Interpretation

1. `Movie`: choose a mystery movie, using rating as a secondary tie-breaker
2. `Theater`: choose the theater that has reclining seats
3. `Date`: choose Saturday first
4. `Showtime`: discover no Saturday showing both starts after 7:00 PM and ends by 10:00 PM
5. `Date` backtrack: switch to Sunday
6. `Showtime`: inspect Sunday options
7. `Seat`: find acceptable seats
8. `Confirm`: finish booking

## First Failure Evidence

- Stage: `Showtime`
- Observable evidence: Saturday showings are either too early for the evening plan or run past 10:00 PM
- Why backtrack happens: the theater remains acceptable, so date is the minimal repair

## DB Composition Guidance

### Movies

- Include at least one viable mystery title and a few decoys outside the target genre

### Theaters

- One intended theater should clearly offer reclining seats
- Two decoy theaters can still show the movie, but they should lack reclining seats so theater choice remains easy

### Dates

- Saturday and Sunday should both exist at the intended theater

### Showings

- Saturday: only showings that are too early for the evening plan or end after 10:00 PM
- Sunday: at least one showing that fits the schedule

### Seats

- Sunday successful showing should have acceptable couple/back-row options

### Assertions

- Failure should happen at Saturday showtime inspection, not at theater choice
- Sunday should succeed without changing movie or theater
