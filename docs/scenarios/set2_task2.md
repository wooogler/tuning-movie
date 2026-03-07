# Set 2 – Task 2: Sibling Friday Night (Thriller)

> **Equivalent to**: Set 1 – Task 2 (Spouse Thursday, Action)
> **Pattern**: 장르+최고 평점 → 런타임 길어서 시간 제약 충돌 → 모든 시간대 실패 → 짧은 영화로 전환

---

## Scenario (Participant Instructions)

You would like to watch a movie with your sibling this Friday night. Book tickets that satisfy the following conditions:

1. You want to watch a thriller movie.
2. If multiple thriller movies are available, you prefer the one with the highest audience rating, but other constraints are more important.
3. The earliest you can arrive at the theater is 6:00 PM.
4. The movie must end before 10:00 PM.
5. You want two adjacent seats, and you do not want to sit in the last two rows due to low vision.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | 스릴러 장르 | **hard** |
| P2 | 최고 관객 평점 우선 | soft (다른 제약이 더 중요) |
| P3 | 도착 가능 시간 ≥ 6:00 PM | **hard** |
| P4 | 종료 시간 < 10:00 PM | **hard** |
| P5 | 나란히 2석 | **hard** |
| P6 | 뒤 2열 제외 (시력 저하) | **hard** |

---

## Movie Data

| Movie | Genre | Rating | Runtime | Notes |
|-------|-------|--------|---------|-------|
| Movie C | Thriller | ★4.4 | 155 min (2h 35m) | 높은 평점 |
| Movie D | Thriller | ★3.7 | 105 min (1h 45m) | 낮은 평점, 짧은 러닝타임 |

> 스릴러는 C, D 두 편뿐.

---

## Theater Data

| Theater | Notes |
|---------|-------|
| Theater 1 | Theater 2와 동일한 스케줄/좌석 현황 |
| Theater 2 | Theater 1과 동일한 스케줄/좌석 현황 |

---

## Screening Schedule

### Movie C @ Both Theaters (Runtime: 2h 35m)

| Showtime | Ends | P3 (≥6PM 도착) | P4 (<10:00) | Seats |
|----------|------|----------------|-------------|-------|
| 6:00 PM | 8:35 PM | ✓ | ✓ | **뒤 2열만 남음** |
| 7:30 PM | 10:05 PM | ✓ | ✗ (10:05 > 10:00) | — |
| 9:00 PM | 11:35 PM | ✓ | ✗ | — |

### Movie D @ Both Theaters (Runtime: 1h 45m)

| Showtime | Ends | P3 | P4 | Seats |
|----------|------|----|----|-------|
| 6:00 PM | 7:45 PM | ✓ | ✓ | 나란히 가능 ✓ |
| 7:30 PM | 9:15 PM | ✓ | ✓ | 나란히 가능 ✓ |
| 9:00 PM | 10:45 PM | ✓ | ✗ | — |

---

## Expected User Flow

### === 1차 시도: Movie C (★4.4, 155분) ===

#### [Movie] 1차 방문
- 스릴러: C (★4.4), D (★3.7)
- **선택: Movie C** (최고 평점)

#### [Showtime] 1차 방문
- 6:00 PM → 8:35 PM ✓ (시간 OK)
- **선택: 6:00 PM**

#### [Seats] 1차 방문
- 뒤 2열만 남음 → P6 "뒤 2열 제외 (시력)" ✗

> **Conflict C1** (same-step): P6 ↔ 6:00 PM 뒤줄만 남음

- **결정**: 다른 시간대 시도

#### [Showtime] 2차 방문
- 7:30 PM → 종료 10:05 PM → P4 "10:00 이전" ✗

> **Conflict C2** (cross-step): P4 ↔ 7:30 PM + 155분 = 10:05 PM

- 9:00 PM → 종료 11:35 PM → ✗
- Movie C 모든 시간대 소진
- Theater 2도 동일 → 실패

> **Conflict C3** (cross-step): Movie C (155분)는 P3+P4+P6 동시 충족 불가

- **결정**: Movie D로 전환

### === 2차 시도: Movie D (★3.7, 105분) ===

#### [Movie] 2차 방문
- **선택: Movie D**

#### [Showtime] 3차 방문
- 7:30 PM → 9:15 PM ✓
- **선택: 7:30 PM**

#### [Seats] 2차 방문
- 나란히 2석, 적절한 위치 ✓
- **예매 완료!**

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | 6:00 PM 뒤줄만 남음 | P6 ↔ 좌석 현황 | same-step | 7:30 PM 시도 |
| C2 | 7:30 PM → 10:05 PM 종료 | P4 ↔ 런타임+시간 | cross-step | 모든 시간대 실패 |
| C3 | Movie C 전체 실패 | P3+P4+P6 ↔ 155분 런타임 | cross-step | Movie D로 전환 |

---

## Set 1 T2 ↔ Set 2 T2 등가 대응

| 요소 | Set 1 T2 | Set 2 T2 |
|------|---------|---------|
| 장르 | Action | Thriller |
| 1순위 영화 런타임 | 160분 | 155분 |
| 차순위 영화 런타임 | 100분 | 105분 |
| 시간대 실패 이유 #1 | 5 PM 도착 불가 | 6 PM 뒤줄만 |
| 시간대 실패 이유 #2 | 7 PM 앞줄만 | 7:30 PM 시간 초과 |
| 시간대 실패 이유 #3 | 8:30 PM 시간 초과 | 9 PM 시간 초과 |
| 좌석 제약 | 앞 3열 제외 (목 통증) | 뒤 2열 제외 (시력) |

> ⚠️ Set 1 T2에서는 시간대 #1이 도착시간, #2가 좌석, #3이 종료시간으로 **각각 다른 이유**로 실패.
> Set 2 T2에서는 #1이 좌석, #2와 #3이 모두 종료시간으로, **실패 이유 다양성이 약간 낮음**.

---

## How TUNING Helps

- 사용자가 Movie C 런타임을 물어볼 수 있음
- 사용자가 10:00 PM 이전 종료 선호를 다시 말할 수 있음
- 사용자가 뒤줄 거부 이유를 설명할 수 있음
- 사용자가 차선 스릴러로 전환 요청할 수 있음

---

## Backtrack Path

```
Movie C → Showtime
  → 6:00 PM → Seats C1 (뒤줄만)
    ↩ 7:30 PM → C2 (10:05 PM 종료)
      ↩ Movie D → 7:30 PM → Seats ✓ → 예매 완료!
```

**Total backtracks**: 2
**Total step visits**: Movie(2) + Showtime(3) + Seats(2) = 7
