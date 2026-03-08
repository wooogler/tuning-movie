# Set 2 – Task 2: Sibling Friday Night (Thriller)

> **Equivalent to**: Set 1 – Task 2 (Spouse Thursday, Action)
> **Pattern**: 장르+최고 평점 → 좌석 실패 → 런타임 때문에 시간 실패 → 짧은 영화로 전환

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. You would like to watch a movie with your sibling on Friday night, March 13, 2026.

1. You want to watch a thriller movie.
2. If multiple thriller movies are available, you prefer the one with the highest audience rating, but the other constraints are more important.
3. The earliest you can arrive at the theater is 6:00 PM.
4. The movie must end before 10:00 PM.
5. You want two adjacent seats, and you do not want to sit in the last two rows due to low vision.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | 스릴러 장르 | **hard** |
| P2 | 최고 관객 평점 우선 | soft |
| P3 | 도착 가능 시간 ≥ 6:00 PM | **hard** |
| P4 | 종료 시간 < 10:00 PM | **hard** |
| P5 | 나란히 2석 | **hard** |
| P6 | 뒤 2열 제외 | **hard** |

---

## Movie Data

| Movie | Genre | Rating | Runtime | Notes |
|-------|-------|--------|---------|-------|
| Night Ledger | Thriller | ★4.4 | 155 min (2h 35m) | 높은 평점 |
| Cold Signal | Thriller | ★3.7 | 105 min (1h 45m) | 짧은 러닝타임 |

---

## Theater Data

| Theater | Notes |
|---------|-------|
| Riverview Cinema | Midtown Screens와 동일한 스케줄/좌석 현황 |
| Midtown Screens | Riverview Cinema와 동일한 스케줄/좌석 현황 |

---

## Screening Schedule

### Night Ledger @ Both Theaters (Runtime: 2h 35m)

| Showtime | Ends | P3 (≥6PM) | P4 (<10PM) | Seats |
|----------|------|-----------|------------|-------|
| 6:00 PM | 8:35 PM | ✓ | ✓ | **뒤 2열만 인접석 가능** |
| 7:30 PM | 10:05 PM | ✓ | ✗ | — |
| 9:00 PM | 11:35 PM | ✓ | ✗ | — |

### Cold Signal @ Both Theaters (Runtime: 1h 45m)

| Showtime | Ends | P3 | P4 | Seats |
|----------|------|----|----|-------|
| 6:00 PM | 7:45 PM | ✓ | ✓ | 나란히 가능 ✓ |
| 7:30 PM | 9:15 PM | ✓ | ✓ | 나란히 가능 ✓ |
| 9:00 PM | 10:45 PM | ✓ | ✗ | — |

---

## Expected User Flow

### === 1차 시도: Night Ledger (★4.4, 155분) ===

#### [Movie] 1차 방문
- 스릴러: Night Ledger (★4.4), Cold Signal (★3.7)
- **선택: Night Ledger**

#### [Theater] 1차 방문
- **선택: Riverview Cinema**

#### [Date] 1차 방문
- **선택: Friday, March 13**

#### [Showtime] 1차 방문
- 6:00 PM → 8:35 PM ✓
- **선택: 6:00 PM**

#### [Seats] 1차 방문
- 뒤 2열만 인접석 가능 → P6 위반

> **Conflict C1** (same-step): P6 ↔ 6:00 PM 좌석 현황

- **결정**: 다른 시간대 시도

#### [Showtime] 2차 방문
- 7:30 PM → 10:05 PM → P4 위반

> **Conflict C2** (cross-step): P4 ↔ 7:30 PM + 155분 = 10:05 PM

- 9:00 PM도 11:35 PM 종료로 실패
- Night Ledger는 두 극장 모두 동일하게 실패

> **Conflict C3** (cross-step): Night Ledger는 P3+P4+P6 동시 충족 불가

- **결정**: Cold Signal로 전환

### === 2차 시도: Cold Signal (★3.7, 105분) ===

#### [Movie] 2차 방문
- **선택: Cold Signal**

#### [Theater] 2차 방문
- **선택: Riverview Cinema**

#### [Date] 2차 방문
- **선택: Friday, March 13**

#### [Showtime] 3차 방문
- 7:30 PM → 9:15 PM ✓
- **선택: 7:30 PM**

#### [Seats] 2차 방문
- 뒤 2열이 아닌 구역에서 인접 2석 가능 ✓
- **예매 완료!**

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | 6:00 PM은 뒤 2열만 가능 | P6 ↔ 좌석 현황 | same-step | 7:30 PM 시도 |
| C2 | 7:30 PM → 10:05 PM 종료 | P4 ↔ 런타임+시간 | cross-step | 다음 영화 검토 |
| C3 | Night Ledger 전체 실패 | P3+P4+P6 ↔ 긴 러닝타임 | cross-step | Cold Signal 선택 |

---

## Backtrack Path

```text
Night Ledger → Riverview Cinema → Fri, Mar 13
  → 6:00 PM → Seats C1 (뒤 2열만)
    ↩ 7:30 PM → C2 (10:05 PM 종료)
      ↩ Cold Signal → Riverview Cinema → Fri, Mar 13 → 7:30 PM → Seats ✓
```

**Total backtracks**: 2
**Total step visits**: Movie(2) + Theater(2) + Date(2) + Showtime(3) + Seats(2) = 11
