# Set 3 Hard Breakdown

## Scenario

- Sibling outing with B-movie comedy taste
- User prefers Friday first and a smaller theater
- Main recovery pattern: first movie fails across Friday/Saturday, second movie succeeds only after an extra seat retry

## Hard Preferences

- Must be within the Friday/Saturday night window
- Must use the single-screen theater
- Must start after 6:00 PM and end by 10:00 PM
- Must provide adjacent seats in an acceptable region

## Soft Preferences

- B-movie / cult-comedy feeling preferred
- `genre` and `synopsis` matter more than raw rating
- The rougher, much lower-rated option is actually preferred over the cleaner higher-rated one
- Getting home a bit earlier is preferable if everything else is similar
- Friday preferred over Saturday

## Step-by-step Interpretation

1. `Movie`: choose the first B-movie-like comedy candidate by `genre`, `synopsis`, `duration`, and an explicit preference for the rougher lower-rated option
2. `Theater`: choose the single-screen theater
3. `Date`: choose Friday first
4. `Showtime`: choose the best-looking Friday time
5. `Seat`: fail because acceptable adjacent seats are unavailable
6. `Showtime` backtrack: confirm no better Friday time remains
7. `Date` backtrack: switch to Saturday
8. `Showtime`: discover Saturday time options are either too early or end after 10:00 PM
9. `Date` backtrack: the first movie is exhausted across both dates
10. `Theater` backtrack: pass through the theater stage again, but the single-screen requirement stays fixed
11. `Movie`: switch to a second B-movie-like candidate
12. `Theater`: keep the same single-screen theater
13. `Date`: choose the better date for the second movie
14. `Showtime`: choose a plausible time
15. `Seat`: fail once on seat region/quality
16. `Showtime` backtrack: inspect another time
17. `Seat`: find the acceptable final seat pattern
18. `Confirm`: finish booking

## First Failure Evidence

- Stage: `Seat`
- Observable evidence: no acceptable adjacent seats in the allowed region on the first Friday attempt
- Why backtrack happens: movie mood and theater style are still acceptable, so the user first repairs within showtime/date before changing movie

## DB Composition Guidance

### Movies

- Include at least 2 B-movie/cult-comedy candidates
- Movie A: stronger synopsis fit but impossible across both dates
- Movie B: similar vibe but ultimately solvable

### Theaters

- One intended theater should have `screenCount = 1`
- Larger-theater decoys may still be visible, but the hard preference should force the single-screen choice

### Dates

- Friday and Saturday must both be visible and meaningful

### Showings

- Movie A / Friday: plausible showing reaches seat failure
- Movie A / Saturday: no acceptable showing under the 6:00 PM start and 10:00 PM end window
- Movie B: at least 2 plausible showings on the chosen date so an extra seat retry is possible

### Seats

- Movie A / Friday: no acceptable adjacent seats
- Movie B / first showtime: seat-region failure
- Movie B / second showtime: success

### Assertions

- User must keep the single-screen theater requirement when switching from Movie A to Movie B
- Movie change should happen only after both Friday and Saturday are exhausted for Movie A
