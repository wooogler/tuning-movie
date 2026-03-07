# Set 2 – Task 1: Child's Playdate (Kid-Friendly Movie)

> **Equivalent to**: Set 1 – Task 1 (Parents' Anniversary)
> **Pattern**: AI 추천 → 최고 평점 선택 → 런타임/좌석 실패 → 영화 backtrack → 성공

---

## Scenario (Participant Instructions)

You are planning a movie outing for your child and their friend as part of a weekend playdate.

1. Ask the AI to recommend a kid-friendly movie appropriate for ages 7–9. If it recommends multiple movies, pick the one that has the highest rating. If the selected movie fails to satisfy the conditions below, pick the 2nd best rated one.
2. Book tickets at the closest theater.
3. Choose a showtime that starts after 1 PM and ends before 5 PM.
4. The children must sit next to each other, and seats must not be in the first two rows.
5. You strongly prefer a movie that is under 2 hours long, but this is secondary to the timing and seating constraints.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | 아동용 영화 (7–9세), AI 추천 | soft |
| P2 | 최고 평점 우선 | soft |
| P3 | 가장 가까운 극장 | soft |
| P4 | 시작 시간 ≥ 1 PM | **hard** |
| P5 | 종료 시간 < 5 PM | **hard** |
| P6 | 나란히 2석 | **hard** |
| P7 | 앞 2열 제외 | **hard** |
| P8 | 2시간 미만 선호 | soft (시간/좌석 제약보다 후순위) |

---

## Movie Data

AI 추천 3편:

| Movie | Rating | Runtime | Notes |
|-------|--------|---------|-------|
| Jungle Pals | ★4.4 | 2h 15m | 최고 평점, 길다 |
| Robo Buddies | ★4.1 | 1h 50m | **미개봉** |
| Magic Treehouse | ★3.9 | 1h 40m | 가장 짧음, P8 충족 |

---

## Theater Data

| Theater | Notes |
|---------|-------|
| Closest Theater | 모든 영화 동일 스케줄 |

---

## Screening Schedule (모든 영화 공통 시간대)

| Showtime | P4 (≥1PM) | Notes |
|----------|-----------|-------|
| 12:30 PM | ✗ | 1 PM 이전 |
| 1:30 PM | ✓ | 유효 후보 |
| 3:30 PM | ✓ | 유효 후보 |
| 4:30 PM | ✓ | 런타임에 따라 5 PM 이전 종료 어려움 |

P4+P5 충족 가능 시간대: **1:30 PM**, **3:30 PM** (런타임에 따라)
- 4:30 PM: 30분짜리 영화라도 5:00 PM → "before 5 PM" 경계

### Jungle Pals (Runtime: 2h 15m)

| Showtime | Ends | P5 (<5PM) | Seats |
|----------|------|-----------|-------|
| 1:30 PM | 3:45 PM | ✓ | **앞 2열만 남음** |
| 3:30 PM | 5:45 PM | ✗ | — |

### Robo Buddies

**미개봉** — 예매 불가

### Magic Treehouse (Runtime: 1h 40m)

| Showtime | Ends | P5 (<5PM) | Seats |
|----------|------|-----------|-------|
| 1:30 PM | 3:10 PM | ✓ | **나란히 가운데석 가능** ✓ |
| 3:30 PM | 5:10 PM | ✗ | — |

---

## Expected User Flow

### === 1차 시도: Jungle Pals (★4.4, 2h 15m) ===

#### [Movie] 1차 방문
- AI 추천: Jungle Pals (★4.4), Robo Buddies (★4.1), Magic Treehouse (★3.9)
- **선택: Jungle Pals** (최고 평점)

#### [Showtime] 1차 방문
- 1:30 PM → 3:45 PM ✓ (P4+P5)
- 3:30 PM → 5:45 PM ✗ (P5)
- **선택: 1:30 PM**

#### [Seats] 1차 방문
- 앞 2열만 남음 → P7 ✗

> **Conflict C1** (cross-step): P5+P7 → 유일한 유효 시간대(1:30 PM)에 앞줄만 남음

- 3:30 PM은 5:45 PM 종료 → P5 ✗ → 역시 불가
- Jungle Pals에서 유효한 시간대+좌석 조합 없음
- **결정**: 영화 선택으로 backtrack

### === 2차 시도: Robo Buddies ===

#### [Movie] 2차 방문
- Robo Buddies (★4.1) → **미개봉** → 불가

> **Constraint**: 미개봉

- **결정**: 다음 옵션

### === 3차 시도: Magic Treehouse (★3.9, 1h 40m) ===

#### [Movie] 3차 방문
- **선택: Magic Treehouse**

#### [Showtime] 2차 방문
- 1:30 PM → 3:10 PM ✓
- **선택: 1:30 PM**

#### [Seats] 2차 방문
- 나란히 가운데석 가능 ✓ (P6+P7)
- **예매 완료!**

**정답**: Magic Treehouse, 1:30 PM

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Jungle Pals 1:30 PM: 앞줄만 | P7 ↔ 좌석 현황 | cross-step | 영화 backtrack |

---

## How TUNING Helps

- 사용자가 AI에게 추천을 요청
- 사용자가 런타임을 물어볼 수 있음 (P5 시간 윈도우 관련)
- 사용자가 앞 2열 거부 이유를 설명할 수 있음 (P7)
- 사용자가 "5 PM 이전 종료" hard 제약을 명확히 할 수 있음 (P5)
- 시스템이 시간 윈도우와 좌석 선호를 기억하여 다음 영화 추천 시 반영

---

## Backtrack Path

```
Jungle Pals → 1:30 PM → Seats C1 (앞줄만)
  ↩ Movie (Robo Buddies: 미개봉)
    → Movie (Magic Treehouse) → 1:30 PM → Seats ✓ → 예매 완료!
```

**Total backtracks**: 1 (영화 레벨)
**Total step visits**: Movie(3) + Showtime(2) + Seats(2) = 7
