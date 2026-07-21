# Set 4 Easy Breakdown

## Scenario

- Family outing where one theater clearly stands out because it has both key amenities
- After the easy theater choice, the remaining recovery should happen inside the same theater/date branch
- Main recovery pattern: first showtime fails at seat stage, second showtime succeeds

## Hard Preferences

- Fixed date
- Must end before 2:00 PM
- Need 4 adjacent seats

## Soft Preferences

- Short runtime should be a visible tie-breaker at movie choice
- Theater with `Free Parking` and `Family Lounge`

## Step-by-step Interpretation

1. `Movie`: choose a family-friendly movie, leaning toward the shorter one if multiple titles fit
2. `Theater`: choose the theater that has both `Free Parking` and `Family Lounge`
3. `Date`: choose the fixed date
4. `Showtime`: choose the earliest plausible showing that still ends before 2:00 PM
5. `Seat`: discover there is no four-seat block, only smaller clusters
6. `Showtime` backtrack: try the next candidate time
7. `Seat`: find an easy four-seat block
8. `Confirm`: finish booking

## First Failure Evidence

- Stage: `Seat`
- Observable evidence: only edge/front seats remain for the earliest showing
- Why backtrack happens: theater/date remain valid, so another showtime is the smallest repair

## DB Composition Guidance

### Movies

- Include 2-3 light family titles
- One target movie should be clearly shorter than the other family-friendly options

### Theaters

- One intended theater with both `Free Parking` and `Family Lounge`
- Add two easy decoys: one with only `Free Parking`, one with only `Family Lounge`

### Dates

- One fixed date should drive the path

### Showings

- At least 2 plausible times on the fixed date
- Intended successful times should end before 2:00 PM
- First time should fail at seat stage
- Second time should succeed

### Seats

- First showtime: no four-seat block, even though smaller adjacent clusters still exist
- Second showtime: at least two different four-seat blocks should be available

### Assertions

- Success must happen without changing movie/theater/date
- Failure should be attributable to seat layout, not time viability
