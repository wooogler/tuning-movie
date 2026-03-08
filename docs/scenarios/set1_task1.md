# Set 1 – Task 1: Parents' Anniversary (Premium Seats)

> **Equivalent to**: Set 2 – Task 1 (Child Playdate)
> **Pattern**: AI 추천 → 최고 평점 선택 → 좌석 실패 → 영화 backtrack → 성공

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. You would like to purchase two movie tickets for your parents for their anniversary tomorrow, Thursday, March 12, 2026.

1. You want AI to recommend a movie for your parents. If it recommends multiple movies, pick the one that has the highest rating. If the selected movie fails to satisfy the conditions below, pick the 2nd best rated one.
2. Ask it to book tickets at the closest theater.
3. Book two tickets for a showtime that starts after 2 PM and ends before 6 PM.
4. Due to back pain, your parents only want seats that come with recliners and extra legroom (premium seats).

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | AI 추천 영화, 최고 평점 우선 | soft |
| P2 | 가장 가까운 극장 | soft |
| P3 | 시작 시간 ≥ 2 PM | **hard** |
| P4 | 종료 시간 < 6 PM | **hard** |
| P5 | 프리미엄 좌석 (리클라이너 + 넓은 레그룸) | **hard** |
| P6 | 두 좌석 나란히 (기념일 → 당연히 같이 앉아야 함) | **hard** |

---

## Movie Data

AI가 추천하는 3편:

| Movie | Genre | Rating | Runtime | Notes |
|-------|-------|--------|---------|-------|
| Love Punchline | Comedy/Romance | ★4.5 | 1h 50m | 추천 #1 (최고 평점) |
| Desk for Two | Comedy/Drama | ★4.2 | 1h 45m | 추천 #2 |
| Autumn Letters | Drama | ★3.9 | 2h 00m | 추천 #3, **이번 주 미개봉** |

---

## Theater Data

| Theater | Distance | Notes |
|---------|----------|-------|
| Empire Cinema | 3 mi | 가장 가까운 극장 (유일) |

---

## Screening Schedule

### Love Punchline @ Empire Cinema (Runtime: 1h 50m)

| Showtime | Ends | P3 (≥2PM) | P4 (<6PM) | Premium Seats |
|----------|------|-----------|-----------|---------------|
| 11:30 AM | 1:20 PM | ✗ | ✓ | — |
| 2:15 PM | 4:05 PM | ✓ | ✓ | **없음** |
| 4:00 PM | 5:50 PM | ✓ | ✓ | **있으나 떨어져 있음** (나란히 불가) |
| 7:00 PM | 8:50 PM | ✓ | ✗ | — |

P3+P4 충족 시간대: **2:15 PM**, **4:00 PM** (2개)

### Autumn Letters

**이번 주 미개봉** — 예매 불가

### Desk for Two @ Empire Cinema (Runtime: 1h 45m)

| Showtime | Ends | P3 | P4 | Premium Seats |
|----------|------|----|----|---------------|
| 2:30 PM | 4:15 PM | ✓ | ✓ | **나란히 2석 가능** ✓ |
| 5:00 PM | 6:45 PM | ✓ | ✗ | — |

---

## Expected User Flow

### === 1차 시도: Love Punchline (★4.5) ===

#### [Movie] 1차 방문
- AI 추천: Love Punchline (★4.5), Desk for Two (★4.2), Autumn Letters (★3.9)
- **선택: Love Punchline** (최고 평점)

#### [Theater] 1차 방문
- **선택: Empire Cinema** (3 mi, 가장 가까움)

#### [Showtime] 1차 방문
- 유효 시간대: 2:15 PM, 4:00 PM
- **선택: 2:15 PM**

#### [Seats] 1차 방문
- 프리미엄 좌석: **없음**

> **Conflict C1** (same-step): P5 "프리미엄 좌석" ↔ 2:15 PM 프리미엄석 없음

- **결정**: 다른 시간대 시도 → Showtime으로 backtrack

#### [Showtime] 2차 방문
- **선택: 4:00 PM**

#### [Seats] 2차 방문
- 프리미엄 좌석 있으나 개별석만 남음 (나란히 불가)
- 기념일인데 떨어져 앉는 건 부적절

> **Conflict C2** (cross-step): P5 "프리미엄" + P6 "나란히" ↔ 프리미엄석이 분리되어 있음

- Love Punchline의 유효 시간대 모두 소진
- **결정**: 영화 선택으로 backtrack

### === 2차 시도: 차선 영화 ===

#### [Movie] 2차 방문
- 차순위: Autumn Letters (★3.9) → **이번 주 미개봉** → 불가
- 그 다음: Desk for Two (★4.2)
- **선택: Desk for Two**

#### [Theater] 2차 방문
- **선택: Empire Cinema** (가장 가까움)

#### [Showtime] 3차 방문
- 2:30 PM → 4:15 PM ✓
- **선택: 2:30 PM**

#### [Seats] 3차 방문
- 프리미엄 나란히 2석 가능 ✓
- **예매 완료!**

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | 2:15 PM 프리미엄석 없음 | P5 ↔ 좌석 현황 | same-step | 4:00 PM 시도 |
| C2 | 4:00 PM 프리미엄석 나란히 불가 | P5+P6 ↔ 좌석 배치 | cross-step | 영화 변경 |

---

## How TUNING Helps

- 사용자가 AI에게 추천을 요청하면 TUNING이 영화를 추천
- 추천 영화 중 하나는 프리미엄석 없음, 다른 하나는 미개봉 (불가)
- TUNING이 시간 선호 (2 PM 이후, 6 PM 이전)를 기억
- TUNING이 극장 선호 (가장 가까운)를 기억
- TUNING이 선호 요일을 기억
- Backtrack 시 발견된 제약 (프리미엄 + 나란히)을 다음 영화 탐색에 반영 가능

---

## Backtrack Path

```
Movie (Love Punchline) → Theater (Empire) → Date (Thu, Mar 12, 2026) → Showtime
  → 2:15 PM → Seats C1 (프리미엄석 없음)
    ↩ 4:00 PM → Seats C2 (프리미엄석 분리됨)
      ↩ Movie (Autumn Letters: 미개봉)
        → Movie (Desk for Two) → Theater (Empire) → Date (Thu, Mar 12, 2026) → 2:30 PM → Seats ✓ → 예매 완료!
```

**Total backtracks**: 2
**Total step visits**: Movie(2) + Theater(2) + Date(2) + Showtime(3) + Seats(3) = 12
