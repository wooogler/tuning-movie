# Set 1 Hard Breakdown

## Scenario

- Friends want an action movie on Saturday night
- User starts from high rating + closest theater
- Main recovery pattern: theater switch fails, then movie branch collapse

## Hard Preferences

- Action genre
- Saturday only
- Cannot arrive before 5:30 PM
- Must end by 10:30 PM
- IMAX required
- 2 adjacent seats required
- Avoid front rows

## Soft Preferences

- Highest rating first
- Closest theater checked first
- Better amenities acceptable if distance increases

## Step-by-step Interpretation

1. `Movie`: choose the first action candidate using `rating` and `duration`
2. `Theater`: choose the closest theater first
3. `Date`: choose Saturday
4. `Showtime`: choose the only plausible time after applying the 5:30 PM arrival constraint, 10:30 PM end-time limit, and the hard IMAX requirement
5. `Seat`: fail because acceptable adjacent seats are unavailable
6. `Showtime` backtrack: confirm there is no better time in the same theater/date
7. `Date` backtrack: confirm the fixed Saturday branch
8. `Theater` backtrack: move to a farther amenity-better theater
9. `Date`: reselect Saturday
10. `Showtime`: discover one Standard time that fits the schedule, but no time that satisfies the hard IMAX requirement
11. `Date` backtrack: confirm the Saturday branch is exhausted there too
12. `Theater` backtrack: conclude theater change is not enough
13. `Movie`: switch to a shorter second action movie
14. `Theater`: choose a theater again
15. `Date`: choose Saturday again
16. `Showtime`: choose the later IMAX time because the earlier IMAX option is a decoy that starts before the 5:30 PM arrival cutoff
17. `Seat`: find acceptable seats
18. `Confirm`: complete booking

## First Failure Evidence

- Stage: `Seat`
- Observable evidence: only front-row or separated seats remain
- Why backtrack happens: first repair tries another showtime, then another theater, before giving up on the movie itself

## DB Composition Guidance

### Movies

- Include at least 2 action titles
- Movie A: higher rated, but structurally impossible across theater branches
- Movie B: slightly lower rated or shorter, but ultimately solvable

### Theaters

- Theater 1: closest, but target showing fails at seat stage
- Theater 2: farther, better amenities, but target movie fails at showtime stage
- Optional Theater 3 can be a non-viable decoy

### Dates

- Saturday is the only intended date

### Showings

- Movie A at Theater 1/Saturday: two IMAX options should be visible, but only one fits the time window and leads to seat failure
- Movie A at Theater 2/Saturday: one Standard time should fit the schedule, but no IMAX option should remain viable
- Movie B at one theater/Saturday: one successful IMAX time plus one earlier IMAX decoy that fails the arrival cutoff

### Seats

- Movie A / Theater 1 / target showtime: no acceptable adjacent seats
- Movie B / target showtime: at least one acceptable adjacent pair outside front rows

### Assertions

- Closest theater failure should be seat-driven
- Alternate theater failure should be showtime-driven
- Successful path must require movie change
