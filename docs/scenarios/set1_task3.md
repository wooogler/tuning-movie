# Set 1 – Task 3: Solo Weekend (3D, Cosmic Laughs)

> **Equivalent to**: Set 2 – Task 3 (Solo Weekend, IMAX, Ocean Depths)
> **Pattern**: 특정 영화 + 포맷 필수 → 가까운 극장 좌석 실패 → 10마일 이내 대안 극장으로 전환

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. You would like to see a movie alone this weekend, Saturday March 14 or Sunday March 15, 2026. The booking site may also show Monday March 16 and Tuesday March 17, but those dates do not work for you. Book a movie ticket that satisfies the following conditions:

1. You want to watch a sci-fi movie called Cosmic Laughs alone.
2. The movie must be this weekend, either Saturday March 14 or Sunday March 15.
3. You will be available except for evenings (after 7 PM) on both Saturday and Sunday.
4. You prefer a theater closest to you, but as long as it is within 10 miles, it's fine.
5. You want to watch it on a 3D screen. This is a must.
6. You do not like sitting on the side of the theater, especially if it is a 3D screen. It needs to be reasonably centered on the screen.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | Cosmic Laughs (특정 영화 지정) | **hard** |
| P2 | 이번 주말만 가능 (3/14-3/15) | **hard** |
| P3 | 저녁 7 PM 이후 불가 (토/일 모두) | **hard** |
| P4 | 가까운 극장 선호, 10마일 이내 OK | soft (거리) / **hard** (10mi 상한) |
| P5 | 3D 스크린 필수 | **hard** |
| P6 | 가운데 좌석 (사이드 X), 특히 3D일 때 | **hard** |

---

## Movie Data

기본 노출 순서:

| Order | Movie | Genre | Rating | Runtime | Notes |
|------|-------|-------|--------|---------|-------|
| 1 | Neon Harbor | Action/Thriller | ★4.4 | 1h 58m | 더미 선택지 |
| 2 | Paper Planets | Family/Adventure | ★3.9 | 1h 42m | 더미 선택지 |
| 3 | Midnight Tram | Drama/Mystery | ★4.1 | 1h 49m | 더미 선택지 |
| 4 | Cosmic Laughs | Sci-Fi/Comedy | ★4.3 | 2h 30m | 실제 hard target, 맨 뒤에 노출 |

> Cosmic Laughs가 첫 번째로 보이지 않으므로, 검색/스크롤/정렬 없이도 바로 보이지 않는 상황을 만들 수 있다.

---

## Theater Data

| Theater | Distance | Notes |
|---------|----------|-------|
| Skyline Multiplex | 3 mi | 가장 가까움 |
| Cedar Point Cinema | 8 mi | 10마일 이내 대안 |
| North County Screen Center | 12.4 mi | 좌석은 괜찮지만 거리 hard constraint 위반 |

---

## Screening Schedule

Cosmic Laughs는 3/14-3/17 동안 동일 스케줄로 노출된다. 다만 사용 가능한 날짜는 주말뿐이다.

### Date Availability

- Visible dates: Sat, Mar 14 / Sun, Mar 15 / Mon, Mar 16 / Tue, Mar 17
- Valid dates: **Sat, Mar 14** or **Sun, Mar 15** only (P2)

### Cosmic Laughs @ Skyline Multiplex (Runtime: 2h 30m)

| Showtime | Format | Ends | P3 (<7PM 종료) | Center Seats |
|----------|--------|------|----------------|--------------|
| 3:00 PM | **3D** | 5:30 PM | ✓ | **없음** (사이드석만 남음) |
| 4:00 PM | Standard | 6:30 PM | ✓ | 있음 |
| 5:30 PM | **3D** | 8:00 PM | ✗ (8:00 > 7:00) | — |
| 7:00 PM | Standard | 9:30 PM | ✗ | — |
| 7:30 PM | **3D** | 10:00 PM | ✗ | — |

3D + 7 PM 이전 종료를 동시에 만족하는 후보는 **3:00 PM만 유일**.

남은 좌석 패턴은 더 자연스럽게 잡혀 있다:

- Row A: 1, 2, 7, 8
- Row C: 1, 8
- Row D: 7, 8

즉, 좌석이 아예 없는 게 아니라 **사이드 위주로만 남아 있어서** P5를 만족하지 못한다.

### Cosmic Laughs @ Cedar Point Cinema

| Showtime | Format | Ends | P3 (<7PM) | Center Seats |
|----------|--------|------|-----------|--------------|
| 3:00 PM | **3D** | 5:30 PM | ✓ | **가능** ✓ |
| 4:00 PM | Standard | 6:30 PM | ✓ | 있음 |
| 5:30 PM | **3D** | 8:00 PM | ✗ | — |
| 7:00 PM | Standard | 9:30 PM | ✗ | — |
| 7:30 PM | **3D** | 10:00 PM | ✗ | — |

3:00 PM 3D에서 가운데 좌석이 자연스럽게 남아 있다:

- Row C: 3, 4, 5, 6
- Row D: 1, 4, 5, 8

### Cosmic Laughs @ North County Screen Center

- 3:00 PM 3D 상영과 가운데 좌석은 있음
- 하지만 **12.4 miles**라서 P3 hard constraint를 위반

---

## Expected User Flow

### === 1차 시도: Skyline Multiplex (가장 가까움) ===

#### [Movie]
- 기본 노출은 Neon Harbor → Paper Planets → Midnight Tram → Cosmic Laughs
- **선택: Cosmic Laughs** (P1 hard)

#### [Theater] 1차 방문
- Skyline 3 mi / Cedar 8 mi / North County 12.4 mi
- 가장 가까운 극장 선호 때문에 **Skyline Multiplex**를 먼저 확인

#### [Date]
- 3/14-3/17이 보이지만 **토요일 선택** (P2 hard)

#### [Showtime] 1차 방문
- 3D 시간대: 3:00 PM, 5:30 PM, 7:30 PM
- 5:30 PM → 8:00 PM 종료 → P3 위반
- 7:30 PM → 시작 자체가 늦음 → P3 위반
- **선택: 3:00 PM** (유일한 3D + 시간 충족)

#### [Seats] 1차 방문
- 좌석은 남아 있지만 가운데가 아니라 사이드 위주
- P5 "centered seat" 위반

> **Conflict C1** (cross-step): P5 "3D" + P6 "가운데 좌석" + P3 "7 PM 이전"을 동시에 만족하는 Skyline 옵션이 없음

- **결정**: 다른 극장 확인

### === 2차 시도: Cedar Point Cinema ===

#### [Theater] 2차 방문
- North County는 12.4 mi라 hard limit를 넘음
- **선택: Cedar Point Cinema** (8 mi, 10마일 이내)

#### [Showtime] 2차 방문
- 3:00 PM (3D) → 5:30 PM ✓
- **선택: 3:00 PM**

#### [Seats] 2차 방문
- 가운데 좌석 가능 ✓
- **예매 완료!**

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Skyline Multiplex 3:00 PM 3D에는 좌석은 남아도 가운데 구역이 비어 있지 않음 | P5+P6 ↔ 좌석 현황 | cross-step | Cedar Point Cinema로 전환 |

> North County Screen Center는 좌석 조건은 맞을 수 있지만, 10마일을 넘기므로 처음부터 정답 후보가 아니다.

---

## Preferences Shared (TUNING Opportunities)

| 상황 | 드러나는 선호 | TUNING Action |
|------|-------------|---------------|
| Cosmic Laughs를 직접 찾으려 함 | P1: 특정 영화 지정 | Search/highlight for target movie |
| 3/16, 3/17은 보이지만 선택하지 않음 | P2: weekend only | Date filter/highlight |
| Skyline 3:00 PM 좌석을 보고 스킵 | P6: side seat 거부 | Center section highlight |
| 4:00 PM Standard 스킵 | P5: 3D 필수 | Format filter |
| 5:30 PM / 7:30 PM 스킵 | P3: 7 PM 이전 종료 | Late showtime deemphasis |
| North County를 보지만 지나침 | P4: 10mi hard upper bound | Distance warning or filter |

---

## Backtrack Path

```text
Cosmic Laughs → Skyline Multiplex → Sat, Mar 14, 2026
  → 3:00 PM (3D) → Seats C1 (사이드석만 남음)
    ↩ Cedar Point Cinema → 3:00 PM (3D) → Seats ✓ → 예매 완료!
```

**Total backtracks**: 1
**Total step visits**: Movie(1) + Theater(2) + Date(1) + Showtime(2) + Seats(2) = 8
