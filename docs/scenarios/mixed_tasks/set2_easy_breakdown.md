# Set 2 Easy Breakdown

## Scenario

- Solo weekend outing for a specific SF movie
- User first follows closest-theater preference
- Main recovery pattern: date-stage evidence forces theater change, and the fallback theater supports either weekend day

## Hard Preferences

- Specific target movie
- Weekend showing required
- Must end by 7:00 PM
- Theater must have free parking

## Soft Preferences

- Closest theater first
- Avoid overly large multiplexes; moderate `screenCount` preferred

## Step-by-step Interpretation

1. `Movie`: choose the target movie
2. `Theater`: choose the closest theater first
3. `Date`: inspect Saturday/Sunday and discover the movie starts there only on Monday
4. `Theater` backtrack: move to another theater with weekend availability and free parking
5. `Date`: choose either Saturday or Sunday at the new theater
6. `Showtime`: choose a valid time
7. `Seat`: complete seat selection
8. `Confirm`: finish booking

## First Failure Evidence

- Stage: `Date`
- Observable evidence: weekend dates for the chosen movie are unavailable at the first theater
- Why backtrack happens: weekend availability is hard, so the user abandons the closest theater

## DB Composition Guidance

### Movies

- Include the target SF movie plus a few decoys
- The target movie should be clearly identifiable by title

### Theaters

- Theater 1: closest, but target movie has no Saturday/Sunday showings
- Theater 2: slightly farther, has free parking but still only weekday showings for the target movie
- Theater 3: farther, but has the weekend target showings and free parking needed for success

### Dates

- At Theater 1, target movie should begin on Monday
- At Theater 2, target movie should still be weekday-only
- At Theater 3, target movie should be visible on both Saturday and Sunday

### Showings

- Theater 3 should provide 3 plausible weekend times, with at least one that ends by 7:00 PM

### Seats

- Seat stage should not be the main source of difficulty
- Provide a straightforward successful seat map on the intended path

### Assertions

- Failure at Theater 1 should happen at date availability
- Success should require theater change, not movie change, and either weekend date at Theater 3 can be a valid outcome
