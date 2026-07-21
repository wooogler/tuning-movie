# Set 4 Hard Breakdown

## Scenario

- Last movie before a trip, with date and theater effectively fixed
- User requires a comedy and initially prefers the more mature R-rated option
- Main recovery pattern: first movie fails across its showtime branch; second movie succeeds only after multiple seat/showtime retries

## Hard Preferences

- Must be a comedy
- Must be on Friday, March 13
- Theater must have `Reserved Seating` and `Free Parking`
- Must start after 4:00 PM and end by 10:00 PM
- Must be a standard showing, not an expensive premium-format one
- Must have two seats together, ideally in the more centered area around seats 3, 4, 5, or 6

## Soft Preferences

- Prefer the more mature R-rated option if available
- If several showtimes fit, an earlier start is preferred

## Step-by-step Interpretation

1. `Movie`: choose the first comedy candidate, with a soft preference for the more mature R-rated option
2. `Theater`: choose the theater that satisfies both `Reserved Seating` and `Free Parking`
3. `Date`: choose Friday, March 13
4. `Showtime`: all but one showing are eliminated by the after-4:00-PM start window or by the hard standard-format requirement
5. `Seat`: the remaining showing fails because no acceptable pair of seats together is available in the preferred area
6. `Showtime` backtrack: confirm no more viable showtimes remain for Movie A
7. `Date` backtrack: fixed date is exhausted for Movie A
8. `Theater` backtrack: theater itself remains valid
9. `Movie`: switch to Movie B
10. `Theater`: keep the same theater because the amenity requirements still fit
11. `Date`: reselect Friday, March 13
12. `Showtime`: choose the first plausible time for Movie B, favoring the earlier start
13. `Seat`: fail once because no acceptable pair of seats together is available
14. `Showtime` backtrack: inspect another time
15. `Seat`: fail again because no acceptable pair of seats together is available
16. `Showtime` backtrack: inspect the last plausible time
17. `Seat`: succeed
18. `Confirm`: finish booking

## First Failure Evidence

- Stage: `Showtime` followed by `Seat`
- Observable evidence: too-early or premium-format showings are ruled out first; the only remaining showing fails once the seat map is opened
- Why backtrack happens: the user first exhausts the showtime branch before abandoning Movie A

## DB Composition Guidance

### Movies

- Include at least 2 comedy candidates
- Movie A: the comedy that also matches the R-rated preference, but impossible across its entire showtime branch
- Movie B: the fallback comedy that is less preferred at first, but solvable after repeated retries

### Theaters

- One intended theater with `Reserved Seating` and `Free Parking`
- At least one decoy theater can exist in the data, but it should fail the parking requirement
- Theater should stay fixed throughout the successful path

### Dates

- One fixed date: Friday, March 13

### Showings

- Movie A: several showings, but all except one should be filtered out by start-time / hard standard-format logic; the remaining one reaches seat failure
- Movie B: at least 3 plausible times so repeated seat/showtime retries are meaningful

### Seats

- Movie A / surviving showtime: seat failure because no acceptable adjacent pair remains in the preferred area
- Movie B / first showtime: seat failure because no acceptable adjacent pair remains in the preferred area
- Movie B / second showtime: seat failure because no acceptable adjacent pair remains in the preferred area
- Movie B / third showtime: an acceptable adjacent pair is available

### Assertions

- Movie A must fail only after both showtime filtering and one seat check
- Movie B must require more than one seat/showtime repair before success
