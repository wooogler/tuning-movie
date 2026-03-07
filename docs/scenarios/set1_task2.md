# Set 1 – Task 2: Spouse Thursday Night (Action Movie)

> **Equivalent to**: Set 2 – Task 2 (Sibling Friday, Thriller)
> **Pattern**: 장르+최고 평점 → 런타임 길어서 시간 제약 충돌 → 모든 시간대 실패 → 짧은 영화로 전환

---

## Scenario (Participant Instructions)

You would like to see a movie with your spouse this Thursday night. Book movie tickets that satisfy the following conditions:

1. You want to watch an action movie.
2. If there are multiple action movies available, you prefer the one with the highest rating. However, the other conditions are more important than this rating preference.
3. Due to work, the earliest time that you can arrive at the theater is 5:30 PM.
4. You want a movie that ends before 10:30 PM because of your spouse's sleeping routine.
5. You and your spouse need to sit right next to each other. You don't want to sit in the first three rows due to the neck pain.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | 액션 장르 | **hard** |
| P2 | 최고 평점 우선 | soft (다른 조건이 더 중요) |
| P3 | 도착 가능 시간 ≥ 5:30 PM | **hard** |
| P4 | 종료 시간 < 10:30 PM | **hard** |
| P5 | 나란히 2석 | **hard** |
| P6 | 앞 3열 제외 (목 통증) | **hard** |

---

## Movie Data

| Movie | Genre | Rating | Runtime | Notes |
|-------|-------|--------|---------|-------|
| Movie A | Action | ★4.3 | 160 min (2h 40m) | 높은 평점 |
| Movie B | Action | ★3.8 | 100 min (1h 40m) | 낮은 평점, 짧은 러닝타임 |

> 액션 영화는 A, B 두 편뿐.

---

## Theater Data

| Theater | Notes |
|---------|-------|
| Theater 1 | Theater 2와 동일한 스케줄/좌석 현황 |
| Theater 2 | Theater 1과 동일한 스케줄/좌석 현황 |

---

## Screening Schedule

### Movie A @ Both Theaters (Runtime: 2h 40m)

| Showtime | Ends | P3 (≥5:30 도착) | P4 (<10:30) | Seats |
|----------|------|-----------------|-------------|-------|
| 5:00 PM | 7:40 PM | ✗ (5:30 도착 불가) | ✓ | — |
| 7:00 PM | 9:40 PM | ✓ | ✓ | **앞줄만 남음 (row 1–3)** |
| 8:30 PM | 11:10 PM | ✓ | ✗ (11:10 > 10:30) | — |

### Movie B @ Both Theaters (Runtime: 1h 40m)

| Showtime | Ends | P3 | P4 | Seats |
|----------|------|----|----|-------|
| 5:00 PM | 6:40 PM | ✗ | ✓ | — |
| 7:00 PM | 8:40 PM | ✓ | ✓ | 나란히 가능 ✓ |
| 8:30 PM | 10:10 PM | ✓ | ✓ | 나란히 가능 ✓ |

---

## Expected User Flow

### === 1차 시도: Movie A (★4.3, 160분) ===

#### [Movie] 1차 방문
- 액션 영화: A (★4.3), B (★3.8)
- **선택: Movie A** (최고 평점, P2)

#### [Theater] 1차 방문
- Theater 1, 2 동일 스케줄
- **선택: Theater 1**

#### [Showtime] 1차 방문
- 5:00 PM → 5:30 도착 불가 (P3) → ✗
- 7:00 PM → 가능?
- **선택: 7:00 PM**

#### [Seats] 1차 방문
- 앞줄 좌석 (row 1–3)만 남음
- P6: 앞 3열 거부 (목 통증) → ✗

> **Conflict C1** (same-step): P6 "앞 3열 제외" ↔ 7:00 PM 앞줄만 남음

- 에이전트가 물을 수 있음: "왜 7:00 PM은 안 되나요?"
- **결정**: 다른 시간대 시도 → backtrack

#### [Showtime] 2차 방문
- 8:30 PM → 종료 11:10 PM → P4 "10:30 이전 종료" ✗

> **Conflict C2** (cross-step): P4 "10:30 이전" ↔ 8:30 PM + 160분 = 11:10 PM

- **이 시점에서 사용자가 Movie A 런타임을 확인할 수 있음**
- 에이전트가 물을 수 있음: "5:00 PM이나 8:30 PM은 왜 안 되나요?"
- 사용자가 설명하면 TUNING이 도착 시간/종료 시간 선호를 기억

- Movie A의 모든 시간대가 Theater 1에서 소진
- Theater 2도 동일 스케줄 → 역시 실패

> **Conflict C3** (cross-step): Movie A (160분)는 P3+P4+P6을 동시에 충족하는 시간대 없음

- **결정**: Movie B로 전환

### === 2차 시도: Movie B (★3.8, 100분) ===

#### [Movie] 2차 방문
- **선택: Movie B** (차선 액션 영화)

#### [Showtime] 3차 방문
- 8:30 PM → 10:10 PM ✓ (도착 OK, 10:30 이전)
- **선택: 8:30 PM**

#### [Seats] 2차 방문
- 나란히 2석, 앞줄 아닌 곳 가능 ✓
- **예매 완료!**

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | 7:00 PM 앞줄만 남음 | P6 ↔ 좌석 현황 | same-step | 8:30 PM 시도 |
| C2 | 8:30 PM → 11:10 PM 종료 | P4 ↔ 런타임+시간 | cross-step | 다른 극장도 동일 |
| C3 | Movie A 전체 실패 | P3+P4+P6 ↔ 160분 런타임 | cross-step | Movie B로 전환 |

---

## How TUNING Helps

- 사용자가 영화 종료 시간 선호를 설명할 수 있음 (10:30 PM 이전)
- 사용자가 Movie A 런타임을 물어볼 수 있음 (기억하거나 스크롤해서 확인하지 않는다면 → learning effect 가능성)
- 사용자가 앞좌석 거부 선호를 말할 수 있음
- 다른 액션 영화를 요청할 수 있음

### Caveat
- GUI 네비게이션이 매우 빠를 수 있음
- TUNING이 GUI-only 조건을 능가하지 못할 수도 있음

---

## Backtrack Path

```
Movie A → Theater 1 → Showtime
  → 7:00 PM → Seats C1 (앞줄만)
    ↩ 8:30 PM → C2 (11:10 PM 종료)
      ↩ Movie B → 8:30 PM → Seats ✓ → 예매 완료!
```

**Total backtracks**: 2
**Total step visits**: Movie(2) + Theater(1) + Showtime(3) + Seats(2) = 8
