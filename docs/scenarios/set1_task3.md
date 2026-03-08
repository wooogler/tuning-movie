# Set 1 – Task 3: Solo Weekend (3D, Cosmic Laughs)

> **Equivalent to**: Set 2 – Task 3 (Solo Weekend, IMAX, Ocean Depths)
> **Pattern**: 특정 영화 + 포맷 필수 → 가까운 극장 좌석 실패 → 다른 극장으로 전환

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. You would like to see a movie alone this weekend, Saturday March 14 or Sunday March 15, 2026. Book a movie ticket that satisfies the following conditions:

1. You want to watch a sci-fi movie called Cosmic Laughs alone.
2. You will be available except for evenings (after 7 PM) on both Saturday and Sunday.
3. You prefer a theater closest to you, but as long as it is within 10 miles, it's fine.
4. You want to watch it on a 3D screen. This is a must.
5. You do not like sitting on the side of the theater, especially if it is a 3D screen. It needs to be reasonably centered on the screen.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | Cosmic Laughs (특정 영화 지정) | **hard** |
| P2 | 저녁 7 PM 이후 불가 (토/일 모두) | **hard** |
| P3 | 가까운 극장 선호, 10마일 이내 OK | soft (거리) / **hard** (10mi 상한) |
| P4 | 3D 스크린 필수 | **hard** |
| P5 | 가운데 좌석 (사이드 X), 특히 3D일 때 | **hard** |

---

## Movie Data

| Movie | Genre | Runtime |
|-------|-------|---------|
| Cosmic Laughs | Sci-Fi | 2h 30m |

---

## Theater Data

| Theater | Distance | Notes |
|---------|----------|-------|
| Skyline Multiplex | 3 mi | 가장 가까움 |
| Cedar Point Cinema | 8 mi | 10마일 이내 |

---

## Screening Schedule

토요일/일요일 동일 스케줄.

### Cosmic Laughs @ Skyline Multiplex (Runtime: 2h 30m)

| Showtime | Format | Ends | P2 (<7PM 종료) | Center Seats |
|----------|--------|------|----------------|--------------|
| 3:00 PM | **3D** | 5:30 PM | ✓ | **없음** (사이드만) |
| 4:00 PM | Standard | 6:30 PM | ✓ | 있음 |
| 5:30 PM | **3D** | 8:00 PM | ✗ (8:00 > 7:00) | — |
| 7:00 PM | Standard | 9:30 PM | ✗ | — |
| 7:30 PM | **3D** | 10:00 PM | ✗ | — |

3D + 7 PM 이전 종료: **3:00 PM만 유일** (5:30 PM 3D는 8 PM 종료로 탈락)
- 3:00 PM 3D: 가운데 좌석 없음 → P5 ✗

### Cosmic Laughs @ Cedar Point Cinema

| Showtime | Format | Ends | P2 (<7PM) | Center Seats |
|----------|--------|------|-----------|--------------|
| 3:00 PM | **3D** | 5:30 PM | ✓ | **가능** ✓ |
| (이하 Skyline Multiplex와 동일 스케줄) | | | | |

---

## Expected User Flow

### === 1차 시도: Skyline Multiplex (가장 가까움) ===

#### [Movie]
- **선택: Cosmic Laughs** (지정 영화)

#### [Theater] 1차 방문
- **선택: Skyline Multiplex** (3 mi, 가장 가까움)

#### [Date]
- 토/일 동일 스케줄 → **토요일 선택**

#### [Showtime] 1차 방문
- 3D 시간대: 3:00 PM, 5:30 PM, 7:30 PM
- 5:30 PM → 8:00 PM 종료 → 7 PM 이후 (P2) ✗
- 7:30 PM → 시작 자체가 7 PM 이후 (P2) ✗
- **선택: 3:00 PM** (유일한 3D + 시간 충족)

#### [Seats] 1차 방문
- 가운데 좌석: **없음** (사이드석만 남음)

> **Conflict C1** (cross-step): P4 "3D" + P5 "가운데" + P2 "7 PM 이전" → 유일한 3D 시간대에 가운데석 없음

- **결정**: 다른 극장 시도

### === 2차 시도: Cedar Point Cinema ===

#### [Theater] 2차 방문
- **선택: Cedar Point Cinema** (8 mi, 10마일 이내)

#### [Showtime] 2차 방문
- 3:00 PM (3D) → 5:30 PM ✓
- **선택: 3:00 PM**

#### [Seats] 2차 방문
- 가운데 좌석: **가능** ✓
- **예매 완료!**

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Skyline Multiplex, 3:00 PM 3D: 가운데석 없음 | P4+P5 ↔ 좌석 현황 | cross-step | Cedar Point Cinema로 전환 |

> Skyline Multiplex에서 탈락하는 다른 시간대:
> - 4:00 PM Standard: P4 "3D 필수" ✗
> - 5:30 PM 3D: P2 "7 PM 이전 종료" ✗

---

## Preferences Shared (TUNING Opportunities)

| 상황 | 드러나는 선호 | TUNING Action |
|------|-------------|---------------|
| 3:00 PM 스킵 시 에이전트가 이유를 물으면 | P5: 가운데석 없음 | GUI Adaptation: 가운데 좌석 highlight |
| 4:00 PM 스킵 | P4: 3D 아님 (hard) | Filter: 3D only |
| 5:30 PM 이후 스킵 | P2: 7 PM 이후 종료 불가 | GUI Adaptation: 종료 시간 표시, 늦은 시간 gray out |
| "3D + 7 PM 이전은 양보 못 해요" | P4+P2 결합 hard 선호 | Filter/highlight 적용 |
| "다른 극장도 괜찮아요" | P3 완화 의사 | Cedar Point Cinema 제안 |

---

## Backtrack Path

```
Cosmic Laughs → Skyline Multiplex → Sat, Mar 14, 2026
  → 3:00 PM (3D) → Seats C1 (가운데석 없음)
    ↩ Cedar Point Cinema → 3:00 PM (3D) → Seats ✓ → 예매 완료!
```

**Total backtracks**: 1
**Total step visits**: Movie(1) + Theater(2) + Date(1) + Showtime(2) + Seats(2) = 8
