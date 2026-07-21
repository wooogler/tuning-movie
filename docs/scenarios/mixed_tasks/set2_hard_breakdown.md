# Set 2 Hard Breakdown

## Scenario

- Parents' anniversary gift on the weekend
- User prefers Saturday, but Sunday is also possible under tighter time constraints
- Main recovery pattern: Saturday fails on showtime, Sunday fails on seat, theater change reopens Saturday, then Sunday finally succeeds

## Hard Preferences

- Must be a romance movie
- Nothing harsher than `PG-13` should be considered
- Must be on the weekend
- On Saturday, must start after 4:00 PM and end by 9:00 PM
- If Sunday is chosen, it must be a morning showing
- Premium adjacent seats required
- Seat quality/position must be acceptable

## Soft Preferences

- Saturday preferred over Sunday
- Closest theater preferred
- Familiar, comfortable romance tone preferred
- Broad rom-com tone is less preferred
- Better amenities are desirable

## Step-by-step Interpretation

1. `Movie`: choose the one title that satisfies the hard romance requirement and the hard `PG-13-or-below` screen, then use `genre`, `synopsis`, `rating`, `duration`, and `ageRating` to prefer the most familiar and comfortable fit while excluding the `R`-rated comedy candidate outright
2. `Theater`: choose the closest theater first
3. `Date`: choose Saturday first because it is closer to the real anniversary
4. `Showtime`: discover Saturday has no option that both starts after 4:00 PM and still ends by 9:00 PM
5. `Date` backtrack: switch to Sunday
6. `Showtime`: choose the only true Sunday morning showing
7. `Seat`: fail because acceptable premium adjacent seats are unavailable
8. `Showtime` backtrack: confirm the other Sunday options are evening slots and therefore invalid for the Sunday morning-only preference
9. `Date` backtrack: Sunday branch is exhausted at that theater
10. `Theater` backtrack: move to a better theater because weekend date/time structure may differ
11. `Date`: re-apply the original Saturday preference first at the new theater
12. `Showtime`: find one Saturday option that now fits the evening window
13. `Seat`: fail again because only adjacent standard seats remain, not adjacent premium seats
14. `Showtime` backtrack: confirm no better Saturday option remains there
15. `Date` backtrack: now retry Sunday at the new theater
16. `Showtime`: choose the valid morning Sunday showing
17. `Seat`: find acceptable premium adjacent seats
18. `Confirm`: finish booking

## First Failure Evidence

- Stage: `Showtime`
- Observable evidence: on Saturday at the closest theater, candidate showings are either too early or end after 9:00 PM; on Sunday, only the true morning slot is eligible and the others are evening-only
- Why backtrack happens: the user preserves theater first, then relaxes the soft Saturday preference only after the hard time constraint blocks it

## DB Composition Guidance

### Movies

- Include at least 2-3 romantic titles
- Intended title should be the only clearly romance option that also fits the familiar, comfortable tone and `PG-13`-or-below constraint
- One comedy decoy should be explicitly `R`-rated so it is ruled out during movie selection instead of lingering as a soft alternative
- Other movie options can remain visible, but should read as weaker fits because they are comedies, sci-fi/drama hybrids, or harsher genre choices

### Theaters

- Theater 1: closest, weaker weekend time structure
- Theater 2: better amenities and different Saturday/Sunday showtime layout
- Optional Theater 3 can be present but clearly inferior or too far

### Dates

- Both Saturday and Sunday should exist for at least one viable theater
- Theater 1 should make Saturday fail at showtime and Sunday fail at seat
- Theater 2 should reopen Saturday as plausible, then ultimately allow Sunday success

### Showings

- Theater 1 / Saturday: no acceptable showing that starts after 4:00 PM and still ends by 9:00 PM
- Theater 1 / Sunday: one before-11:00-AM showing reaches seat stage, while the other Sunday showings are evening-only and visibly invalid
- Theater 2 / Saturday: one plausible showing reaches seat stage but still fails
- Theater 2 / Sunday: one final successful before-11:00-AM showing

### Seats

- Theater 1 / Sunday: no acceptable premium adjacent seats
- Theater 2 / Saturday: seats exist but fail on price/position quality
- Theater 2 / Sunday: acceptable premium adjacent seats available

### Assertions

- Saturday preference should be observable in the path at both theaters
- Sunday should only succeed after Saturday is retried and rejected at Theater 2
- Theater change must matter because weekend date/showing structure differs by theater
