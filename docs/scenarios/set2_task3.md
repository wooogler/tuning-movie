# Set 2 – Task 3: Solo Next Weekend (IMAX, Ocean Depths)

> **Equivalent to**: Set 1 – Task 3 (Solo Weekend, 3D, Cosmic Laughs)
> **Pattern**: 특정 영화 + 포맷 필수 + next-weekend date constraint → 가까운 극장 좌석 실패 → 다른 극장으로 전환

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. You would like to see a movie alone next weekend, Saturday March 21 or Sunday March 22, 2026. The booking site may also show Monday March 23 and Tuesday March 24, but those dates do not work for you.

1. You want to watch a documentary called Ocean Depths.
2. You must go next weekend, either Saturday March 21 or Sunday March 22.
3. You are unavailable after 8 PM on both days.
4. You prefer the closest theater, but any theater within 12 miles is acceptable.
5. You must watch it in IMAX format.
6. You want a seat in the center section, and it must not be in the first two rows.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | Ocean Depths (특정 영화 지정) | **hard** |
| P2 | Next weekend only (Mar 21-22) | **hard** |
| P3 | Finish before 8 PM | **hard** |
| P4 | Closest theater preferred, within 12 miles | soft / **hard** |
| P5 | IMAX required | **hard** |
| P6 | Center-section seat | **hard** |
| P7 | Not in the first two rows | **hard** |

---

## Movie Data

기본 노출 순서:

| Order | Movie | Genre | Rating | Runtime | Notes |
|------|-------|-------|--------|---------|-------|
| 1 | Maple Street Melody | Comedy/Music | ★4.5 | 1h 43m | 더미 선택지 |
| 2 | Last Light at Cedar Pier | Drama | ★3.8 | 1h 57m | 더미 선택지 |
| 3 | Meteor Relay | Sci-Fi/Adventure | ★4.1 | 2h 2m | 더미 선택지 |
| 4 | Ocean Depths | Documentary | ★4.2 | 2h 20m | 실제 hard target, 맨 뒤 노출 |

`Ocean Depths`는 기본 노출에서 바로 첫 번째로 보이지 않는다.

---

## Theater Data

기본 노출 순서:

| Order | Theater | Distance | Notes |
|------|---------|----------|-------|
| 1 | Canyon Ridge Cinema | 11.2 mi | IMAX, Free Parking |
| 2 | Harbor View IMAX | 4.1 mi | 가장 가까움 |

두 극장은 같은 Ocean Depths showtime pattern을 가지지만, IMAX 좌석 상황은 다르다.

---

## Date Availability

- Visible dates: Sat, Mar 21 / Sun, Mar 22 / Mon, Mar 23 / Tue, Mar 24
- Valid dates: **Sat, Mar 21** or **Sun, Mar 22** only (P2)

---

## Screening Schedule

### Ocean Depths @ Harbor View IMAX on Next Weekend

| Showtime | Format | Ends | P3 (<8PM) | Seats |
|----------|--------|------|-----------|-------|
| 2:10 PM | **IMAX** | 4:30 PM | ✓ | **center seats are only in rows A-B** |
| 4:20 PM | Standard | 6:40 PM | ✓ | 있음 |
| 5:50 PM | **IMAX** | 8:10 PM | ✗ | — |
| 8:10 PM | Standard | 10:30 PM | ✗ | — |

Saturday `2:10 PM IMAX`의 남은 좌석은 더 자연스럽게 잡혀 있다.

- Row A: 3, 4, 5
- Row B: 4, 5, 6
- Row C: 1, 2, 7
- Row D: 1, 8
- Row E: 2, 7
- Row F: 1, 8

즉, 가운데 좌석은 남아 있지만 전부 앞 2열에만 몰려 있고, C-F에는 side seat만 남아 있다.

### Ocean Depths @ Canyon Ridge Cinema on Next Weekend

| Showtime | Format | Ends | P3 (<8PM) | Seats |
|----------|--------|------|-----------|-------|
| 2:10 PM | **IMAX** | 4:30 PM | ✓ | **center seats available in rows C-D** ✓ |
| 4:20 PM | Standard | 6:40 PM | ✓ | 있음 |
| 5:50 PM | **IMAX** | 8:10 PM | ✗ | — |
| 8:10 PM | Standard | 10:30 PM | ✗ | — |

Saturday `2:10 PM IMAX`에서는 예를 들어:

- Row C: 3, 4, 5
- Row D: 2, 4, 5, 7

처럼 앞 2열이 아닌 가운데 쪽 선택지가 남아 있다.

---

## Expected User Flow

### === 1차 시도: Harbor View IMAX ===

#### [Movie]
- 기본 노출은 `Maple Street Melody -> Last Light at Cedar Pier -> Meteor Relay -> Ocean Depths`
- **선택: Ocean Depths** (P1 hard)

#### [Theater]
- 기본 노출은 `Canyon Ridge Cinema -> Harbor View IMAX`
- closest-theater preference 때문에 **Harbor View IMAX** 선택

#### [Date]
- 3/21-3/24가 보이지만 **Sat, Mar 21** 선택

#### [Showtime]
- IMAX 후보는 2:10 PM, 5:50 PM
- 5:50 PM은 8:10 PM 종료라 P3 위반
- **선택: 2:10 PM IMAX**

#### [Seats]
- center section 좌석은 rows A-B에만 남아 있음
- P6는 맞아도 P7을 위반하거나, P7을 맞추면 side seat만 남음

> **Conflict C1**: P5 + P6 + P7 ↔ Harbor View IMAX 2:10 PM seat availability

- **결정**: 다른 극장 시도

### === 2차 시도: Canyon Ridge Cinema ===

#### [Theater]
- **선택: Canyon Ridge Cinema**

#### [Date]
- **선택: Sat, Mar 21**

#### [Showtime]
- **선택: 2:10 PM IMAX**

#### [Seats]
- rows C-D의 center 구역에서 선택 가능 ✓
- **예매 완료**

**Preferred answer**: Canyon Ridge Cinema, Saturday March 21, 2:10 PM IMAX

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Harbor View IMAX 2:10 PM: center seats are available only in the first two rows | P5 + P6 + P7 ↔ 좌석 현황 | cross-step | Canyon Ridge Cinema로 전환 |

---

## Backtrack Path

```text
Ocean Depths → Harbor View IMAX → Sat, Mar 21
  → 2:10 PM (IMAX) → Seats C1
    ↩ Canyon Ridge Cinema → Sat, Mar 21 → 2:10 PM (IMAX) → Seats ✓
```
