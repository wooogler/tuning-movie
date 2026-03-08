# Set 2 – Task 1: Child's Playdate (Kid-Friendly Movie)

> **Equivalent to**: Set 1 – Task 1 (Parents' Anniversary)
> **Pattern**: AI 추천 → 최고 평점 선택 → 좌석 실패 → 미개봉 대안 실패 → 더 짧은 영화로 전환

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. Your child has a playdate this Saturday, March 14, 2026, and you are taking the two kids to a movie afterward.

1. Ask the AI to recommend a kid-friendly movie appropriate for ages 7-9. If it recommends multiple movies, pick the one with the highest rating first.
2. Book tickets at the closest theater.
3. Keep the outing on the weekend, and choose a showtime that starts after 1 PM and ends before 5 PM.
4. The children must sit next to each other, and the seats must not be in the first two rows.
5. You strongly prefer a movie under 2 hours long, but that is secondary to the timing and seating constraints.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | AI 추천 + 아동용 영화 (7-9세) | soft |
| P2 | 최고 평점 우선 | soft |
| P3 | 가장 가까운 극장 | soft |
| P4 | 이번 주말(토/일) | **hard** |
| P5 | 시작 시간 ≥ 1 PM | **hard** |
| P6 | 종료 시간 < 5 PM | **hard** |
| P7 | 나란히 2석 | **hard** |
| P8 | 앞 2열 제외 | **hard** |
| P9 | 2시간 미만 선호 | soft |

---

## Movie Data

AI 추천 3편:

| Movie | Rating | Runtime | Notes |
|-------|--------|---------|-------|
| Jungle Pals | ★4.4 | 2h 15m | 최고 평점, 길다 |
| Robo Buddies | ★4.1 | 1h 50m | **2026-03-20 개봉** |
| Magic Treehouse | ★3.9 | 1h 40m | 가장 짧음, P9 충족 |

---

## Theater Data

| Theater | Distance | Notes |
|---------|----------|-------|
| Storybook Cinema | 2 mi | 가장 가까운 극장 |

---

## Screening Schedule

### Jungle Pals @ Storybook Cinema on Saturday, March 14

| Showtime | Ends | P5 (≥1PM) | P6 (<5PM) | Seats |
|----------|------|-----------|-----------|-------|
| 12:30 PM | 2:45 PM | ✗ | ✓ | — |
| 1:30 PM | 3:45 PM | ✓ | ✓ | **앞 2열만 실질적으로 가능** |
| 3:30 PM | 5:45 PM | ✓ | ✗ | — |
| 4:30 PM | 6:45 PM | ✓ | ✗ | — |

### Robo Buddies

**이번 주말에는 미개봉**. Storybook Cinema 기준 첫 상영일은 **Friday, March 20, 2026**.

### Magic Treehouse @ Storybook Cinema on Saturday, March 14

| Showtime | Ends | P5 | P6 | Seats |
|----------|------|----|----|-------|
| 12:30 PM | 2:10 PM | ✗ | ✓ | — |
| 1:30 PM | 3:10 PM | ✓ | ✓ | **가운데 인접 2석 가능** ✓ |
| 3:30 PM | 5:10 PM | ✓ | ✗ | — |
| 4:30 PM | 6:10 PM | ✓ | ✗ | — |

---

## Expected User Flow

### === 1차 시도: Jungle Pals (★4.4, 2h 15m) ===

#### [Movie] 1차 방문
- AI 추천: Jungle Pals (★4.4), Robo Buddies (★4.1), Magic Treehouse (★3.9)
- **선택: Jungle Pals**

#### [Theater] 1차 방문
- **선택: Storybook Cinema**

#### [Date] 1차 방문
- playdate 일정상 **Saturday, March 14** 선택

#### [Showtime] 1차 방문
- 1:30 PM → 3:45 PM ✓
- **선택: 1:30 PM**

#### [Seats] 1차 방문
- 앞 2열을 제외하면 인접 2석이 없음

> **Conflict C1** (cross-step): P7+P8 ↔ 1:30 PM 좌석 현황

- Jungle Pals는 유효한 시간대+좌석 조합이 없음
- **결정**: 영화 선택으로 backtrack

### === 2차 시도: Robo Buddies ===

#### [Movie] 2차 방문
- **선택: Robo Buddies**

#### [Theater] 2차 방문
- **선택: Storybook Cinema**

#### [Date] 2차 방문
- 첫 상영 가능일이 **Friday, March 20**뿐
- 이번 주말 playdate 일정(P4)과 충돌

> **Conflict C2** (cross-step): P4 "이번 주말" ↔ Robo Buddies 개봉일이 2026-03-20

- **결정**: 다음 영화로 이동

### === 3차 시도: Magic Treehouse (★3.9, 1h 40m) ===

#### [Movie] 3차 방문
- **선택: Magic Treehouse**

#### [Theater] 3차 방문
- **선택: Storybook Cinema**

#### [Date] 3차 방문
- **선택: Saturday, March 14**

#### [Showtime] 2차 방문
- 1:30 PM → 3:10 PM ✓
- **선택: 1:30 PM**

#### [Seats] 2차 방문
- 앞 2열이 아닌 구역에서 인접 2석 가능 ✓
- **예매 완료!**

**정답**: Storybook Cinema, Saturday March 14, 1:30 PM, Magic Treehouse

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Jungle Pals 1:30 PM: 앞 2열만 실질적 선택지 | P7+P8 ↔ 좌석 현황 | cross-step | 영화 backtrack |
| C2 | Robo Buddies는 2026-03-20 개봉 | P4 ↔ 개봉일 | cross-step | Magic Treehouse 선택 |

---

## Backtrack Path

```text
Jungle Pals → Storybook Cinema → Sat, Mar 14 → 1:30 PM → Seats C1
  ↩ Robo Buddies → Storybook Cinema → Fri, Mar 20 only → C2
    ↩ Magic Treehouse → Storybook Cinema → Sat, Mar 14 → 1:30 PM → Seats ✓
```

**Total backtracks**: 2
**Total step visits**: Movie(3) + Theater(3) + Date(3) + Showtime(2) + Seats(2) = 13
