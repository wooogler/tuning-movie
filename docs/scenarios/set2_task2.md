# Set 2 – Task 2: Sibling Friday Night (Thriller)

> **Equivalent to**: Set 1 – Task 2 (Spouse Saturday, Action)
> **Pattern**: 장르 hard + 최고 평점 soft + Friday hard + showtime/seat 실패 후 다른 thriller로 전환

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. You would like to watch a movie with your sibling on Friday night, March 13, 2026. The booking site may also show Thursday March 12 through Monday March 16, but Friday is the only night that works.

1. You want to watch a thriller movie.
2. If multiple thriller movies are available, you prefer the one with the highest audience rating, but the other constraints are more important.
3. Prefer the theater closest to you.
4. The tickets must be for Friday, March 13, 2026.
5. The earliest you can arrive at the theater is 6:00 PM.
6. The movie must end before 10:00 PM.
7. You want two adjacent seats, and you do not want to sit in the last two rows due to low vision.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | Thriller genre | **hard** |
| P2 | Highest rating among thrillers | soft |
| P3 | Closest theater preferred | soft |
| P4 | Friday, March 13, 2026 | **hard** |
| P5 | Arrival after 6:00 PM | **hard** |
| P6 | End before 10:00 PM | **hard** |
| P7 | 2 adjacent seats | **hard** |
| P8 | Do not sit in the last 2 rows | **hard** |

---

## Movie Data

기본 노출 순서:

| Order | Movie | Genre | Rating | Runtime | Notes |
|------|-------|-------|--------|---------|-------|
| 1 | Paper Lanterns | Drama | ★4.7 | 1h 49m | 비스릴러 더미 |
| 2 | Borrowed Summer | Comedy/Drama | ★3.9 | 1h 41m | 비스릴러 더미 |
| 3 | Night Ledger | Thriller | ★4.4 | 2h 35m | 스릴러 중 최고 평점 |
| 4 | Cold Signal | Thriller | ★3.8 | 1h 45m | 더 짧은 대안 |

실제 thriller 후보는 `Night Ledger`와 `Cold Signal` 두 편뿐이다.

---

## Theater Data

기본 노출 순서:

| Order | Theater | Distance | Notes |
|------|---------|----------|-------|
| 1 | Midtown Screens | 8.2 mi | Dolby Atmos |
| 2 | Riverview Cinema | 3.4 mi | 가장 가까움 |

두 극장은 같은 Friday thriller 스케줄과 핵심 seat pattern을 가진다.  
따라서 theater 단계는 주로 P3를 드러내는 단계다.

---

## Date Availability

- Visible dates: Thu, Mar 12 / Fri, Mar 13 / Sat, Mar 14 / Sun, Mar 15 / Mon, Mar 16
- Valid date: **Fri, Mar 13** only (P4)

---

## Screening Schedule

### Night Ledger @ Any Theater on Friday, March 13

| Showtime | Ends | P5 (≥6PM arrival) | P6 (<10PM) | Seats |
|----------|------|-------------------|------------|-------|
| 5:30 PM | 8:05 PM | ✗ | ✓ | — |
| 7:00 PM | 9:35 PM | ✓ | ✓ | **A-D는 single만 남고, E/F에만 pair** |
| 8:30 PM | 11:05 PM | ✓ | ✗ | — |

`7:00 PM` 좌석은 이런 식이다:

- Row A: 1, 4, 6
- Row B: 2, 5, 7
- Row C: 1, 3, 8
- Row D: 2, 6
- Row E: 3, 4, 7

즉, acceptable rows인 A-D에는 인접 2석이 없고, 붙은 좌석은 뒤 2열(E/F)에만 남아 있다.

### Cold Signal @ Any Theater on Friday, March 13

| Showtime | Ends | P5 | P6 | Seats |
|----------|------|----|----|-------|
| 5:30 PM | 7:15 PM | ✗ | ✓ | — |
| 7:00 PM | 8:45 PM | ✓ | ✓ | C/D에 인접 2석 가능 ✓ |
| 8:30 PM | 10:15 PM | ✓ | ✗ | D에 인접 2석은 있지만 종료 시간이 늦음 |

---

## Expected User Flow

### === 1차 시도: Night Ledger 우선 ===

#### [Movie]
- 기본 노출은 `Paper Lanterns -> Borrowed Summer -> Night Ledger -> Cold Signal`
- P1 때문에 실제 후보는 `Night Ledger`와 `Cold Signal`
- P2 때문에 **Night Ledger**를 먼저 선택

#### [Theater]
- 기본 노출은 `Midtown Screens -> Riverview Cinema`
- P3 때문에 **Riverview Cinema** 선택

#### [Date]
- 3/12-3/16이 보이지만 P4 때문에 **Fri, Mar 13** 선택

#### [Showtime] 1차 방문
- 5:30 PM → 6:00 PM 도착 조건 때문에 불가
- 7:00 PM → 시간 조건은 충족
- **선택: 7:00 PM**

#### [Seats] 1차 방문
- A-D에는 듬성듬성 남은 single seats만 있음
- 인접 2석은 E/F에만 남아 있어 P8 위반

> **Conflict C1**: P7 + P8 ↔ `Night Ledger @ 7:00 PM` seat availability

- **결정**: 같은 영화의 다른 showtime 확인

#### [Showtime] 2차 방문
- 8:30 PM → 11:05 PM 종료 → P6 위반

> **Conflict C2**: P6 ↔ `Night Ledger @ 8:30 PM` runtime

- 이 시점에서 `Night Ledger`는 Friday 기준으로 전체 실패

> **Conflict C3**: `Night Ledger`는 P5 + P6 + P7 + P8을 동시에 만족할 수 없음

- **결정**: `Cold Signal`로 전환

### === 2차 시도: Cold Signal ===

#### [Movie]
- **선택: Cold Signal**

#### [Showtime] 3차 방문
- 7:00 PM → 8:45 PM ✓
- **선택: 7:00 PM**

#### [Seats] 2차 방문
- C/D 구역에 인접 2석 가능 ✓
- **예매 완료**

**Preferred answer**: Riverview Cinema, Friday March 13, 7:00 PM, Cold Signal

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Night Ledger 7:00 PM: 붙은 좌석이 뒤 2열에만 남음 | P7 + P8 ↔ 좌석 현황 | same-step | 8:30 PM 확인 |
| C2 | Night Ledger 8:30 PM → 11:05 PM 종료 | P6 ↔ 런타임+시간 | cross-step | 다른 thriller 검토 |
| C3 | Night Ledger 전체 실패 | P5 + P6 + P7 + P8 ↔ 긴 런타임과 좌석 현황 | cross-step | Cold Signal 선택 |

---

## Backtrack Path

```text
Night Ledger → Riverview Cinema → Fri, Mar 13
  → 7:00 PM → Seats C1
    ↩ 8:30 PM → C2
      ↩ Cold Signal → 7:00 PM → Seats ✓ → 예매 완료
```
