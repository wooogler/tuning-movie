# Set 2 – Task 3: Solo Weekend (IMAX, Ocean Depths)

> **Equivalent to**: Set 1 – Task 3 (Solo Weekend, 3D, Cosmic Laughs)
> **Pattern**: 특정 영화 + 포맷 필수 → 가까운 극장 좌석 실패 → 다른 극장으로 전환

---

## Scenario (Participant Instructions)

You would like to see a movie alone next weekend.

1. You want to watch a documentary called Ocean Depths.
2. You are unavailable after 8 PM on Saturday and Sunday.
3. You prefer the closest theater, but any within 12 miles is acceptable.
4. You must watch it in IMAX format.
5. You want a seat in the center section, not in the first two rows.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | Ocean Depths (특정 영화 지정) | **hard** |
| P2 | 8 PM 이후 불가 (토/일 모두) | **hard** |
| P3 | 가까운 극장 선호, 12마일 이내 OK | soft (거리) / **hard** (12mi 상한) |
| P4 | IMAX 포맷 필수 | **hard** |
| P5 | 가운데 섹션, 앞 2열 제외 | **hard** |

---

## Movie Data

| Movie | Genre | Runtime |
|-------|-------|---------|
| Ocean Depths | Documentary | 2h 20m |

---

## Theater Data

| Theater | Distance | Notes |
|---------|----------|-------|
| Theater 1 | Closest | 1순위 |
| Theater 2 | 12마일 이내 | Fallback |

---

## Screening Schedule

### Ocean Depths @ Theater 1 (Runtime: 2h 20m)

| Showtime | Format | Ends | P2 (<8PM) | Center (not first 2 rows) |
|----------|--------|------|-----------|---------------------------|
| 2:00 PM | **IMAX** | 4:20 PM | ✓ | **앞줄만 남음** |
| 4:00 PM | Standard | 6:20 PM | ✓ | 있음 |
| 6:00 PM | **IMAX** | 8:20 PM | ✗ (8:20 > 8:00) | — |
| 8:00 PM | Standard | 10:20 PM | ✗ | — |

IMAX + 8 PM 이전 종료: **2:00 PM만 유일** (6:00 PM IMAX는 8:20 종료로 탈락)
- 2:00 PM IMAX: 앞줄만 남음 → P5 ✗

### Ocean Depths @ Theater 2

| Showtime | Format | Ends | P2 (<8PM) | Center Seats |
|----------|--------|------|-----------|--------------|
| 2:00 PM | **IMAX** | 4:20 PM | ✓ | **가운데 가능** ✓ |
| (이하 Theater 1과 동일 스케줄) | | | | |

---

## Expected User Flow

### === 1차 시도: Theater 1 (가장 가까움) ===

#### [Movie]
- **선택: Ocean Depths** (지정)

#### [Theater] 1차 방문
- **선택: Theater 1** (가장 가까움)

#### [Showtime] 1차 방문
- IMAX 시간대: 2:00 PM, 6:00 PM
- 6:00 PM → 8:20 PM 종료 → P2 "8 PM 이후 불가" ✗
- **선택: 2:00 PM** (유일한 IMAX + 시간 충족)

#### [Seats] 1차 방문
- 앞줄만 남음 → P5 "가운데, 앞 2열 제외" ✗

> **Conflict C1** (cross-step): P4 "IMAX" + P5 "가운데/앞줄X" + P2 "8 PM 이전" → 유일한 IMAX 시간대에 앞줄만 남음

- **결정**: 다른 극장 시도

### === 2차 시도: Theater 2 ===

#### [Theater] 2차 방문
- **선택: Theater 2** (12마일 이내)

#### [Showtime] 2차 방문
- 2:00 PM IMAX → 4:20 PM ✓
- **선택: 2:00 PM**

#### [Seats] 2차 방문
- 가운데 좌석 가능 ✓
- **예매 완료!**

**정답**: Theater 2, 2:00 PM IMAX

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Theater 1, 2:00 PM IMAX: 앞줄만 | P4+P5 ↔ 좌석 현황 | cross-step | Theater 2로 전환 |

> Theater 1에서 탈락하는 다른 시간대:
> - 4:00 PM Standard: P4 "IMAX 필수" ✗
> - 6:00 PM IMAX: P2 "8 PM 이전 종료" ✗ (8:20)
> - 8:00 PM Standard: P2 ✗ + P4 ✗

---

## Set 1 T3 ↔ Set 2 T3 등가 대응

| 요소 | Set 1 T3 | Set 2 T3 |
|------|---------|---------|
| 영화 | Cosmic Laughs (Sci-Fi) | Ocean Depths (Documentary) |
| 포맷 | 3D | IMAX |
| 시간 제약 | 7 PM 이후 불가 | 8 PM 이후 불가 |
| 거리 상한 | 10 miles | 12 miles |
| 좌석 제약 | 사이드 X, 가운데 필수 | 앞 2열 X, 가운데 필수 |
| 실패 원인 | 3D+가운데석 없음 | IMAX+앞줄만 |
| 해결 | Theater 2 → 3D 가운데 ✓ | Theater 2 → IMAX 가운데 ✓ |

---

## How TUNING Helps

- 사용자가 IMAX hard 선호를 명확히 할 수 있음
- 사용자가 앞줄 좌석 거부 이유를 설명할 수 있음
- 사용자가 명시적으로 "다음으로 가까운 극장" 요청할 수 있음
- 사용자가 종료 시간 충돌을 추론할 수 있음 (6 PM IMAX → 8:20 PM)

---

## Backtrack Path

```
Ocean Depths → Theater 1
  → 2:00 PM (IMAX) → Seats C1 (앞줄만)
    ↩ Theater 2 → 2:00 PM (IMAX) → Seats ✓ → 예매 완료!
```

**Total backtracks**: 1
**Total step visits**: Theater(2) + Showtime(2) + Seats(2) = 6
