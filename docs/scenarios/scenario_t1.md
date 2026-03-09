# 3User Study Scenario \- Sangwook

## Scenario

Today is Wednesday, March 11\. You live in a small college town in Virginia and have been stressed out from a heavy workload lately. You and two friends, Taylor and Avery, have finally found time to see a movie together this weekend. All three of you are busy, so if not this weekend, it will be a while before your schedules align again. You are in charge of booking the tickets.

The three of you chatted in a group message and agreed on a comedy to blow off some steam. You recall a coworker recently mentioning that they enjoyed "Shared Shift," so you are thinking of looking into it. However, all of you are open to watching something else as long as it’s a comedy movie. The three of you would prefer to avoid romantic comedies if possible, but you’re open to it if the other options don’t work out. You generally prefer movies with high ratings.

All the theaters in town are within 10 miles.  Anything outside the town would not work. As for timing, Sunday mornings are out because Avery goes to church. On Saturdays, you tend to sleep in, so morning showtimes are not ideal. Taylor wants to watch a movie that ends before 10 PM, as he goes to bed at 10:30 PM every day. 

The three of you must sit together in adjacent seats. Avery has low vision and prefers to sit in the second row — the first row is too close and causes neck pain, but anything beyond the third row is too far.

---

## User Preferences (Prior)

| \# | Preference | Hard/Soft |
| :---- | :---- | :---- |
| P1 | Comedy (stress relief) | **hard** |
| P2 | Prefers to watch "Shared Shift" (coworker recommendation) | soft |
| P3 | Theater within 10 miles | **hard** |
| P4 | This weekend (Sat/Sun) only | **hard** |
| P5 | No Sunday mornings (Friend B — church) | **hard** |
| P6 | 3 adjacent seats | **hard** |
| P7 | Prefer high-rated movies | soft |
| P8 | Prefer to avoid romantic comedy (open if no alternative) | soft |
| P9 | The movie needs to end before 10 PM (Taylor’s bedtime) | **hard** |
| P10 | Sleeps in on Saturday → prefers afternoon | soft |
| P11 | Avery has low vision → row 2 required (row 1 too close/neck pain, row 3+ too far) | **hard** |

---

## Movie Data

| Movie | Genre | Rating | Runtime | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Shared Shift | Romance / Drama | ★4.2 | 1h 50m | Coworker rec, not a comedy |
| Last Call for Love | Romance / **Comedy** | ★4.5 | 1h 45m | Highest rated, been out for a while |
| Orbital Punchlines | Sci-Fi / **Comedy** | ★4.3 | 3h 10m | Blockbuster, opening Sunday |
| Happy Feet Friday | **Comedy** | ★1.5 | 1h 40m | Lowest rated → naturally ruled out |
| (Other non-comedy movies) | ... | ... | ... | Background filler |

---

## Theater Data

| Theater | Distance | Size | Notes |
| :---- | :---- | :---- | :---- |
| A (Starlight Cinema) | 3 mi | Large | Closest and largest |
| B (Crescent Theater) | 7 mi | Medium |  |
| C (Oakwood Cinema) | 9 mi | Medium | Showing Last Call for Love |
| D (Hilltop Screening Room) | 12 mi | Small | Beyond 10 miles |

### Screening Schedule by Theater

**Orbital Punchlines (SF/Comedy):**

- Theater A: Opens Sunday (early premiere at large theaters)  
- Theater B: Starting Monday (general release)  
- Theater C: Not screening

**Last Call for Love (Romance/Comedy):**

- Theater A: Through Friday only (screen being swapped for the Orbital Punchlines premiere)  
- Theater C: Through Saturday  
- Theater B: Run ended

---

## User GUI Sequence (Detailed)

### \=== Attempt 1 \===

#### \[Movie\] Visit 1

- GUI: Movie list (titles, posters)  
- Action: Check "Shared Shift" → genre is Romance/Drama → not a comedy (violates P1) → skip  
- Find 3 movies with comedy as a genre  
- Want to check ratings (P7) → rating info may not be immediately visible in the GUI  
- Last Call for Love (★4.5) highest rated but romantic comedy → feels awkward, skip (P8)  
- Orbital Punchlines (★4.3) SF/comedy, 3h10m runtime blockbuster  
- Happy Feet Friday (★1.5) lowest rated  
- **Select: Orbital Punchlines**

**Conflict C1** (same-step): P2 "Shared Shift" ↔ P1 "comedy" → give up Shared Shift

#### \[Theater\] Visit 1

- GUI: Theaters screening Orbital Punchlines  
- Within 10 miles: Theater A (3mi), Theater B (7mi)  
- **Select: Theater A** (closest and largest, satisfies P3)

#### \[Date\] Visit 1

- GUI: Calendar  
- Orbital Punchlines opens Sunday at Theater A → no Saturday showtimes  
- **Select: Sunday (3/16)** (only option)

**Constraint discovered**: This movie has an early premiere at large theaters only — Theater A starts screening on Sunday

#### \[Time\] Visit 1

- GUI: Sunday showtime list  
- Morning (10:30 AM) → Friend B has church (P5 hard) → skip  
- Afternoon (1:00 PM, 3:30 PM)  
- Evening (8:00 PM) → with 3h10m runtime, ends at 11:10 PM  
- Decide to check afternoon slots first  
- **Select: 1:00 PM**

#### \[Seats\] Visit 1

- GUI: Seat map (popular blockbuster — mostly sold out)  
- Check row 2 (P11) → no 3 adjacent seats available (violates P6)

**Conflict C2** (same-step): P11 "row 2" \+ P6 "3 adjacent" ↔ 1:00 PM row 2 has no 3 adjacent seats → cannot book

- **Decision: Try the other afternoon slot** → backtrack to time

#### \[Time\] Visit 2

- **Select: 3:30 PM**

#### \[Seats\] Visit 2

- GUI: Seat map  
- Check row 2 → still no 3 adjacent seats (popular time slot, similar situation)

**Conflict C3** (same-step): P11 "row 2" \+ P6 "3 adjacent" ↔ 3:30 PM row 2 has no 3 adjacent seats → cannot book

- **Decision: Check the evening slot as a last resort** → backtrack to time

#### \[Time\] Visit 3

- **Select: 8:00 PM** (last remaining time slot)

#### \[Seats\] Visit 3

- GUI: Seat map  
- Row 2 has 3 adjacent seats available\! (evening slot is relatively less crowded)  
- However: 8:00 PM start \+ 3h10m \= 11:10 PM end → factoring in time to leave the theater and commute home, it would be past 11:30 PM → **Friend A must be home by 10 PM (P9 hard) → impossible**

**Conflict C4** (cross-step): The only time slot with row-2 3 adjacent seats (8:00 PM) ↔ P9 "Friend A home by 10 PM" → movie ends at 11:10 PM, cannot make it home in time

- All time slots at Theater A on Sunday are exhausted (10:30 AM — P5, 1:00/3:30 PM — seats, 8:00 PM — curfew)  
- **Decision: Try a different theater** → backtrack to theater

---

### \=== Attempt 2 (Theater Change) \===

#### \[Theater\] Visit 2

- Theaters within 10 miles: A and B only (P3 hard — theaters beyond 10 miles not considered)  
- Theater A already fully explored → ruled out  
- **Select: Theater B** (7mi)

#### \[Date\] Visit 2

- GUI: Calendar  
- Orbital Punchlines at Theater B starts **Monday** — only large theaters got the early premiere; mid-size theaters start on the general release date (Monday)  
- No weekend showtimes\!

**Conflict C5** (cross-step): P4 "this weekend" (hard) ↔ "Theater B opens Monday" → cannot see it this weekend

- Orbital Punchlines has exhausted all theaters within 10 miles (Theater A: seat/curfew conflict, Theater B: no weekend screenings)  
- **Decision: Give up this movie and find another** → backtrack to movie

---

### \=== Attempt 3 (Movie Change) \===

#### \[Movie\] Visit 2

- Give up Orbital Punchlines (cannot simultaneously satisfy weekend \+ 10mi theater \+ row-2 3-adjacent \+ curfew)  
- Remaining comedy options: Last Call for Love (★4.5, romantic comedy), Happy Feet Friday (★1.5, out of the question)  
- Romantic comedy feels awkward (P8 soft), but it has the highest rating and there is effectively no other option  
- **Select: Last Call for Love** (relax P8 — concede soft preference)

**Preference change**: P8 "avoid romantic comedy" conceded → accept Last Call for Love

#### \[Theater\] Visit 3

- GUI: Theaters screening Last Call for Love  
- Within 10 miles: Theater A (3mi), Theater C (9mi)  
- Theater B: run ended  
- **Select: Theater A** (closest)

#### \[Date\] Visit 3

- GUI: Calendar  
- Last Call for Love at Theater A runs **through Friday only** — the screen is being swapped for the Orbital Punchlines premiere  
- No Saturday or Sunday showtimes\!

**Conflict C6** (cross-step): P4 "this weekend" (hard) ↔ "Theater A runs through Friday only" → cannot see it this weekend

- **Decision: Try a different theater** → backtrack to theater

#### \[Theater\] Visit 4

- Remaining theater within 10 miles: Theater C (9mi)  
- **Select: Theater C** (Oakwood Cinema)

#### \[Date\] Visit 4

- GUI: Calendar  
- Last Call for Love at Theater C runs **through Saturday**  
- Between Saturday and Sunday, only Saturday is available  
- **Select: Saturday (3/15)**

#### \[Time\] Visit 4

- GUI: Saturday showtime list  
- Morning (10:00 AM) → sleeps in on Saturdays (P10 soft) → prefer not  
- Afternoon (2:00 PM, 4:30 PM)  
- Evening (7:00 PM)  
- Decide to check afternoon slots first  
- **Select: 2:00 PM**

#### \[Seats\] Visit 4

- GUI: Seat map  
- Check row 2 (P11) → occupied in pairs (2+2), no 3 adjacent seats (violates P6)

**Conflict C7** (same-step): P11 "row 2" \+ P6 "3 adjacent" ↔ 2:00 PM row 2 has no 3 adjacent seats → cannot book

- **Decision: Try the other afternoon slot** → backtrack to time

#### \[Time\] Visit 5

- **Select: 4:30 PM**

#### \[Seats\] Visit 5

- GUI: Seat map  
- Check row 2 → occupied in a 2+1+2 pattern, still no 3 adjacent seats

**Conflict C8** (same-step): P11 "row 2" \+ P6 "3 adjacent" ↔ 4:30 PM row 2 has no 3 adjacent seats → cannot book

- **Decision: Try the evening slot** → backtrack to time

#### \[Time\] Visit 6

- **Select: 7:00 PM**

#### \[Seats\] Visit 6 (Final)

- GUI: Seat map  
- Row 2 has **3 adjacent seats available\!**  
- 7:00 PM start \+ 1h45m \= 8:45 PM end → including travel time, home by around 9:30 PM → Friend A's 10 PM curfew satisfied (P9 OK)  
- **Select: Row 2, 3 adjacent seats** → booking complete\!

---

## Conflict Summary

| \# | Conflict | Preferences | Constraint | Discovery | Type | Resolution |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| C1 | Shared Shift ↔ comedy | P2 ↔ P1 | Genre mismatch | Movie V1 | same-step | Drop P2 |
| C2 | 1:00 PM row-2 3-adj unavailable | P6+P11 ↔ seat availability | No 3-adj in row 2 | Seats V1 | same-step | Try 3:30 PM |
| C3 | 3:30 PM row-2 3-adj unavailable | P6+P11 ↔ seat availability | No 3-adj in row 2 | Seats V2 | same-step | Try 8:00 PM |
| C4 | 8:00 PM row-2 3-adj ↔ curfew | P6+P11 ↔ P9 | Ends 11:10 PM, home by 10 PM impossible | Seats V3 | cross-step | Change theater |
| C5 | Weekend ↔ release date | P4 ↔ Theater B schedule | Monday release | Date V2 | cross-step | Change movie |
| C6 | Weekend ↔ run ending | P4 ↔ Theater A schedule | Ends Friday | Date V3 | cross-step | Change theater |
| C7 | 2:00 PM row-2 3-adj unavailable | P6+P11 ↔ seat availability | No 3-adj in row 2 | Seats V4 | same-step | Try 4:30 PM |
| C8 | 4:30 PM row-2 3-adj unavailable | P6+P11 ↔ seat availability | No 3-adj in row 2 | Seats V5 | same-step | Try 7:00 PM |

## Preference Change Tracking

| Point | Change | Reason |
| :---- | :---- | :---- |
| Movie V1 | P2 dropped | Genre mismatch (violates P1 hard) |
| Movie V2 | P8 relaxed | No viable alternative after Orbital Punchlines ruled out |

## Backtrack Path

Movie(Orbital Punchlines) → Theater A → Sunday

  → 1:00 PM → Seats C2 (no row-2 3-adj)

    ↩ 3:30 PM → Seats C3 (no row-2 3-adj)

      ↩ 8:00 PM → Seats C4 (3-adj available but ends 11:10 PM → curfew)

        ↩ Theater B → Date C5 (Monday release)

          ↩ Movie(Last Call for Love) → Theater A → Date C6 (ends Friday)

            ↩ Theater C → Saturday

              → 2:00 PM → Seats C7 (no row-2 3-adj)

                ↩ 4:30 PM → Seats C8 (no row-2 3-adj)

                  ↩ 7:00 PM → Seats OK → Booking complete\!

**Total backtracks**: 8 **Total step visits**: Movie(2) \+ Theater(4) \+ Date(4) \+ Time(6) \+ Seats(6) \= 22  
