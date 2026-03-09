# Set 1 – Task 1: Parents' Anniversary (Premium Seats)

> **Pattern**: 특정 날짜 고정 + 정렬/비교를 통한 선택 + 프리미엄 좌석 검증

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. You would like to purchase two movie tickets for your parents for their anniversary tomorrow, Thursday, March 12, 2026.

1. The tickets must be for your parents' actual anniversary, Thursday, March 12, 2026.
2. If there are multiple movie options that fit, prefer the highest-rated one.
3. Prefer the closest theater.
4. Book two tickets for a showtime that starts after 2 PM and ends before 6 PM.
5. Due to back pain, your parents need premium reclining seats with extra legroom.
6. The two premium seats must be next to each other.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | 3월 12일(목) 실제 기념일에 관람 | **hard** |
| P2 | 최고 평점 우선 | soft |
| P3 | 가장 가까운 극장 | soft |
| P4 | 시작 시간 ≥ 2 PM | **hard** |
| P5 | 종료 시간 < 6 PM | **hard** |
| P6 | 프리미엄 좌석 (리클라이너 + 넓은 레그룸) | **hard** |
| P7 | 두 좌석 나란히 | **hard** |

---

## Movie Data

기본 노출 순서:

| Order | Movie | Genre | Rating | Runtime | Notes |
|------|-------|-------|--------|---------|-------|
| 1 | Desk for Two | Comedy/Drama | ★3.7 | 1h 45m | 첫 번째로 보이지만 최고 평점은 아님 |
| 2 | Love Punchline | Comedy/Romance | ★4.5 | 1h 50m | 두 번째로 보이지만 최고 평점 |
| 3 | Autumn Letters | Drama | ★3.1 | 2h 00m | 이번 주 미개봉, 예매 불가 |

> 기본 리스트에서는 Love Punchline이 첫 번째가 아니므로, 평점 비교나 정렬이 decision support에 도움이 된다.

---

## Theater Data

기본 노출 순서:

| Order | Theater | Distance | Notes |
|------|---------|----------|-------|
| 1 | Riverfront 8 | 4.5 mi | Dolby Atmos |
| 2 | Grandview Pavilion | 6.8 mi | Free Parking |
| 3 | Empire Cinema | 3.0 mi | 가장 가깝지만 세 번째로 노출 |

> 세 극장은 같은 날짜/상영시간/좌석 패턴을 공유한다. 따라서 theater 단계는 사실상 거리와 amenity를 비교하는 단계다.

---

## Date Availability

### Love Punchline / Desk for Two @ All Theaters

- Visible dates: Thu, Mar 12 / Fri, Mar 13 / Sat, Mar 14
- Required choice: **Thu, Mar 12, 2026** (P1)

### Autumn Letters

- No selectable dates
- Release date is later, so it is not bookable yet

---

## Screening Schedule

### Love Punchline @ All Theaters on Thursday (Runtime: 1h 50m)

| Showtime | Ends | P4 (≥2PM) | P5 (<6PM) | Premium Seats |
|----------|------|-----------|-----------|---------------|
| 11:30 AM | 1:20 PM | ✗ | ✓ | — |
| 2:15 PM | 4:05 PM | ✓ | ✓ | Premium exists, but only single seats remain |
| 4:00 PM | 5:50 PM | ✓ | ✓ | Premium adjacent pair available ✓ |
| 7:00 PM | 8:50 PM | ✓ | ✗ | — |

### Desk for Two @ All Theaters on Thursday (Runtime: 1h 45m)

| Showtime | Ends | P4 | P5 | Premium Seats |
|----------|------|----|----|---------------|
| 2:30 PM | 4:15 PM | ✓ | ✓ | Premium adjacent pair available ✓ |
| 5:00 PM | 6:45 PM | ✓ | ✗ | — |

### Premium Seat Detail on Thursday

| Movie / Showtime | Premium availability |
|------------------|----------------------|
| Love Punchline @ 2:15 PM | Row E seat 4, Row F seat 6 only |
| Love Punchline @ 4:00 PM | Row E seats 4-5 together |
| Desk for Two @ 2:30 PM | Row E seats 4-5 together |

---

## Expected User Flow

현재 시나리오에서는 movie-level backtrack이 필수는 아니다. 가장 자연스러운 경로는 아래 둘 중 하나다.

### 경로 A: 정렬/비교를 잘 활용한 직접 성공

#### [Movie] 1차 방문
- 기본 노출은 Desk for Two → Love Punchline → Autumn Letters
- 평점을 비교하거나 rating sort를 사용하면 Love Punchline이 가장 적합함
- **선택: Love Punchline** (P2)

#### [Theater] 1차 방문
- 기본 노출은 Riverfront 8 → Grandview Pavilion → Empire Cinema
- distance sort를 사용하거나 거리 비교를 하면 Empire Cinema가 가장 가까움
- **선택: Empire Cinema** (P3)

#### [Date] 1차 방문
- Thu, Mar 12 / Fri, Mar 13 / Sat, Mar 14 노출
- **선택: Thu, Mar 12** (P1 hard)

#### [Showtime] 1차 방문
- 제약을 모두 만족하는 후보는 2:15 PM, 4:00 PM
- **선택: 4:00 PM**

#### [Seats] 1차 방문
- Row E에 프리미엄 나란히 2석 가능
- **예매 완료!**

### 경로 B: 이른 시간부터 확인하면 같은 영화 안에서 한 번 backtrack

#### [Movie] 1차 방문
- **선택: Love Punchline**

#### [Theater] 1차 방문
- **선택: Empire Cinema**

#### [Date] 1차 방문
- **선택: Thu, Mar 12**

#### [Showtime] 1차 방문
- **선택: 2:15 PM**

#### [Seats] 1차 방문
- 프리미엄 좌석은 보이지만 서로 붙어 있지 않음

> **Conflict C1** (same-step): P6 "프리미엄 좌석" + P7 "나란히" ↔ 2:15 PM의 남은 프리미엄 좌석 패턴

- **결정**: 같은 영화의 다른 시간대 확인

#### [Showtime] 2차 방문
- **선택: 4:00 PM**

#### [Seats] 2차 방문
- Row E 4-5 선택 가능 ✓
- **예매 완료!**

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | 2:15 PM에는 프리미엄 좌석이 있지만 붙어 있지 않음 | P6+P7 ↔ 좌석 배치 | same-step | 4:00 PM으로 이동 |

> Love Punchline @ 4:00 PM이 이미 모든 조건을 만족하므로, 현재 버전의 S1-T1은 영화를 바꿔야만 해결되는 구조가 아니다.

---

## How TUNING Helps

- 사용자가 `3월 12일`에 봐야 한다는 hard date preference를 명확히 표현할 수 있음
- 사용자가 영화를 평점 기준으로 정렬하거나 비교하도록 유도할 수 있음
- 사용자가 theater를 거리 기준으로 정렬하거나 비교하도록 유도할 수 있음
- 사용자가 프리미엄 좌석이 "존재"하는 것과 "나란히 가능"한 것은 다르다는 점을 확인할 수 있음
- 처음 본 시간대가 애매하면, 영화를 바꾸지 않고 같은 영화 내에서 더 나은 시간대로 이동하도록 도울 수 있음

---

## Backtrack Path

직접 성공 경로:

```text
Movie (Love Punchline) → Theater (Empire Cinema) → Date (Thu, Mar 12, 2026)
  → Showtime (4:00 PM) → Seats ✓ → 예매 완료!
```

이른 시간부터 보는 경우의 경로:

```text
Movie (Love Punchline) → Theater (Empire Cinema) → Date (Thu, Mar 12, 2026)
  → Showtime (2:15 PM) → Seats C1 (프리미엄은 있지만 나란히 불가)
    ↩ Showtime (4:00 PM) → Seats ✓ → 예매 완료!
```

**Movie-level backtrack**: 없음  
**Possible showtime-level backtracks**: 0 또는 1
