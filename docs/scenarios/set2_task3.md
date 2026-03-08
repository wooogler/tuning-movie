# Set 2 – Task 3: Solo Next Weekend (IMAX, Ocean Depths)

> **Equivalent to**: Set 1 – Task 3 (Solo Weekend, 3D, Cosmic Laughs)
> **Pattern**: 특정 영화 + 포맷 필수 → 가까운 극장 좌석 실패 → 다른 극장으로 전환

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. You would like to see a movie alone next weekend, Saturday March 21 or Sunday March 22, 2026.

1. You want to watch a documentary called Ocean Depths.
2. You are unavailable after 8 PM on Saturday and Sunday.
3. You prefer the closest theater, but any within 12 miles is acceptable.
4. You must watch it in IMAX format.
5. You want a seat in the center section, and it must not be in the first two rows.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | Ocean Depths (특정 영화 지정) | **hard** |
| P2 | 8 PM 이후 불가 | **hard** |
| P3 | 가까운 극장 선호, 12마일 이내 | soft / **hard** |
| P4 | IMAX 필수 | **hard** |
| P5 | 가운데 섹션 + 앞 2열 제외 | **hard** |

---

## Movie Data

| Movie | Genre | Runtime |
|-------|-------|---------|
| Ocean Depths | Documentary | 2h 20m |

---

## Theater Data

| Theater | Distance | Notes |
|---------|----------|-------|
| Harbor View IMAX | 4 mi | 가장 가까움 |
| Canyon Ridge Cinema | 11 mi | 12마일 이내 대안 |

---

## Screening Schedule

토요일/일요일 동일 스케줄.

### Ocean Depths @ Harbor View IMAX (Runtime: 2h 20m)

| Showtime | Format | Ends | P2 (<8PM) | Seats |
|----------|--------|------|-----------|-------|
| 2:00 PM | **IMAX** | 4:20 PM | ✓ | **가운데는 앞 2열만 가능** |
| 4:00 PM | Standard | 6:20 PM | ✓ | 있음 |
| 6:00 PM | **IMAX** | 8:20 PM | ✗ | — |
| 8:00 PM | Standard | 10:20 PM | ✗ | — |

### Ocean Depths @ Canyon Ridge Cinema

| Showtime | Format | Ends | P2 (<8PM) | Seats |
|----------|--------|------|-----------|-------|
| 2:00 PM | **IMAX** | 4:20 PM | ✓ | **가운데 가능** ✓ |
| 4:00 PM | Standard | 6:20 PM | ✓ | 있음 |
| 6:00 PM | **IMAX** | 8:20 PM | ✗ | — |
| 8:00 PM | Standard | 10:20 PM | ✗ | — |

---

## Expected User Flow

### === 1차 시도: Harbor View IMAX ===

#### [Movie]
- **선택: Ocean Depths**

#### [Theater] 1차 방문
- **선택: Harbor View IMAX**

#### [Date] 1차 방문
- **선택: Saturday, March 21**

#### [Showtime] 1차 방문
- IMAX 후보는 2:00 PM, 6:00 PM
- 6:00 PM은 8:20 PM 종료로 P2 위반
- **선택: 2:00 PM**

#### [Seats] 1차 방문
- 가운데 구역 좌석은 앞 2열에만 남아 있음
- 앞 2열을 제외하면 사이드석만 남음

> **Conflict C1** (cross-step): P4+P5+P2 ↔ Harbor View IMAX의 2:00 PM 좌석 현황

- **결정**: 다른 극장 시도

### === 2차 시도: Canyon Ridge Cinema ===

#### [Theater] 2차 방문
- **선택: Canyon Ridge Cinema**

#### [Date] 2차 방문
- **선택: Saturday, March 21**

#### [Showtime] 2차 방문
- 2:00 PM IMAX → 4:20 PM ✓
- **선택: 2:00 PM**

#### [Seats] 2차 방문
- 가운데 섹션에서 앞 2열이 아닌 좌석 가능 ✓
- **예매 완료!**

**정답**: Canyon Ridge Cinema, Saturday March 21, 2:00 PM IMAX

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Harbor View IMAX 2:00 PM: 가운데 좌석이 앞 2열뿐 | P4+P5 ↔ 좌석 현황 | cross-step | Canyon Ridge Cinema로 전환 |

---

## Backtrack Path

```text
Ocean Depths → Harbor View IMAX → Sat, Mar 21
  → 2:00 PM (IMAX) → Seats C1
    ↩ Canyon Ridge Cinema → Sat, Mar 21 → 2:00 PM (IMAX) → Seats ✓
```

**Total backtracks**: 1
**Total step visits**: Movie(1) + Theater(2) + Date(2) + Showtime(2) + Seats(2) = 9
