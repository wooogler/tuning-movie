# Set 2 – Task 1: Child's Playdate (Kid-Friendly Movie)

> **Related to**: Set 1 – Task 1 (Parents' Anniversary)
> **Pattern**: 아동 적합성 hard + 상황 설명 기반 추천 + 짧은 러닝타임 soft + 가까운 극장 선호 + 같은 영화 내 showtime/seat backtrack

---

## Scenario (Participant Instructions)

Today is Wednesday, March 11, 2026. Your child has a playdate on Sunday, March 15, 2026, and you are taking the two kids to a movie right afterward. The booking site may also show Saturday March 14 and Monday March 16 through Tuesday March 17, but Sunday is the only day that works.

1. Describe the kids' situation and ask AI to recommend a movie suitable for children ages 7 to 9, then follow its recommendation. If that recommendation does not work, follow AI's next-best option.
2. Prefer the theater closest to you.
3. Choose a showtime on Sunday, March 15, 2026 that starts after 1 PM and ends before 5 PM.
4. The children must sit next to each other, and the seats must not be in the first two rows.
5. If more than one option still seems suitable, a movie under 2 hours is better because kids that age get fidgety during longer movies.

---

## User Preferences

| # | Preference | Hard/Soft |
|---|-----------|-----------|
| P1 | 아이들 상황을 설명하고 AI에게 7-9세용 영화를 추천받아 따른다 | **hard** |
| P2 | Sunday, March 15, 2026 | **hard** |
| P3 | Closest theater preferred | soft |
| P4 | Start time after 1 PM | **hard** |
| P5 | End time before 5 PM | **hard** |
| P6 | 2 adjacent seats | **hard** |
| P7 | Not in the first two rows | **hard** |
| P8 | Under 2 hours preferred | soft |

---

## Movie Data

기본 노출 순서:

| Order | Movie | Genre | Rating | Runtime | Notes |
|------|-------|-------|--------|---------|-------|
| 1 | Moonlit Heist | Crime/Thriller | ★4.3 | 1h 48m | 비아동용 더미 |
| 2 | Jungle Pals | Animation/Adventure/Family | ★4.1 | 2h 6m | kid-friendly, 2시간 초과 |
| 3 | Summer on Harbor Street | Drama/Comedy | ★3.8 | 1h 52m | 비아동용 더미 |
| 4 | Magic Treehouse | Fantasy/Family | ★4.0 | 1h 38m | kid-friendly, P8 충족 |

실제 hard candidate는 `Jungle Pals`와 `Magic Treehouse` 두 편뿐이다.  
둘 다 hard constraint는 맞출 수 있지만, 아이들의 나이와 러닝타임을 함께 설명하면 `Magic Treehouse`가 더 자연스럽게 추천된다.

---

## Theater Data

기본 노출 순서:

| Order | Theater | Distance | Notes |
|------|---------|----------|-------|
| 1 | Galaxy Landing 12 | 7.1 mi | Play Zone |
| 2 | Pine Street Cinema | 4.8 mi | Free Parking |
| 3 | Storybook Cinema | 2.1 mi | 가장 가까움, Family Lounge |

세 극장은 같은 날짜 슬롯과 같은 showtime 패턴을 가진다.  
따라서 theater 단계는 availability 차이보다 distance preference를 드러내는 단계다.

---

## Date Availability

- Visible dates: Sat, Mar 14 / Sun, Mar 15 / Mon, Mar 16 / Tue, Mar 17
- Valid date: **Sun, Mar 15** only (P2)

---

## Screening Schedule

### Jungle Pals @ Storybook Cinema on Sunday, March 15

| Showtime | Ends | P4 (>1PM) | P5 (<5PM) | Seats |
|----------|------|-----------|-----------|-------|
| 12:20 PM | 2:26 PM | ✗ | ✓ | — |
| 1:20 PM | 3:26 PM | ✓ | ✓ | 뒤쪽에도 인접 2석 가능 |
| 2:40 PM | 4:46 PM | ✓ | ✓ | 뒤쪽에도 인접 2석 가능 |
| 4:10 PM | 6:16 PM | ✓ | ✗ | — |

### Magic Treehouse @ Storybook Cinema on Sunday, March 15

| Showtime | Ends | P4 (>1PM) | P5 (<5PM) | Seats |
|----------|------|-----------|-----------|-------|
| 12:20 PM | 1:58 PM | ✗ | ✓ | — |
| 1:20 PM | 2:58 PM | ✓ | ✓ | **앞 2열 제외 시 인접 2석 없음** |
| 2:40 PM | 4:18 PM | ✓ | ✓ | **뒤쪽에서 인접 2석 가능** ✓ |
| 4:10 PM | 5:48 PM | ✓ | ✗ | — |

`Magic Treehouse @ 1:20 PM` 좌석은 더 자연스럽게 차 있다.

- Row A: 2, 3, 4, 7
- Row B: 1, 2, 5, 6
- Row C: 1, 4, 7
- Row D: 2, 5, 8
- Row E: 3, 6
- Row F: 1, 4, 7

즉, 앞 2열에는 붙은 좌석이 보이지만 C-F 구역에는 붙은 2석이 없다.  
반면 `2:40 PM`에는 C row `3,4,5`, D row `4,5`가 남아 있어서 P6/P7을 함께 만족한다.

---

## Expected User Flow

### === 1차 선택: Magic Treehouse 우선 ===

#### [Movie]
- 기본 노출은 `Moonlit Heist -> Jungle Pals -> Summer on Harbor Street -> Magic Treehouse`
- P1 때문에 실제 후보는 `Jungle Pals`와 `Magic Treehouse`뿐
- 아이들 나이, playdate 직후 일정, 긴 영화는 힘들 수 있다는 상황을 설명하고 추천을 요청
- AI가 **Magic Treehouse**를 우선 추천

#### [Theater]
- 기본 노출은 `Galaxy Landing 12 -> Pine Street Cinema -> Storybook Cinema`
- P3 때문에 **Storybook Cinema** 선택

#### [Date]
- 3/14-3/17이 보이지만 P2 때문에 **Sun, Mar 15** 선택

#### [Showtime] 1차 방문
- 12:20 PM → 시작 시간이 너무 이르다
- 1:20 PM → 시간 조건 충족
- 2:40 PM → 시간 조건 충족
- 4:10 PM → 종료 시간이 너무 늦음
- 먼저 보이는 유효한 후보인 **1:20 PM** 선택

#### [Seats] 1차 방문
- 앞 2열을 제외하면 붙어 있는 2석이 없음

> **Conflict C1**: P6 + P7 ↔ `Magic Treehouse @ 1:20 PM` seat availability

- **결정**: 같은 영화 안에서 더 늦은 유효 showtime으로 이동

### === 2차 시도: Magic Treehouse @ 2:40 PM ===

#### [Showtime] 2차 방문
- **선택: 2:40 PM**

#### [Seats] 2차 방문
- C/D 구역에서 인접 2석 가능 ✓
- **예매 완료**

**Preferred answer**: Storybook Cinema, Sunday March 15, 2:40 PM, Magic Treehouse

---

## Conflict Summary

| # | Conflict | Preferences | Type | Resolution |
|---|---------|------------|------|-----------|
| C1 | Magic Treehouse 1:20 PM: 앞 2열 제외 시 인접 2석이 없음 | P6 + P7 ↔ 좌석 현황 | cross-stage | 같은 영화의 2:40 PM으로 이동 |

---

## Backtrack Path

```text
Magic Treehouse → Storybook Cinema → Sun, Mar 15
  → 1:20 PM → Seats C1
    ↩ 2:40 PM → Seats ✓ → 예매 완료
```

`Jungle Pals`도 hard constraint상 가능하지만, `Magic Treehouse`가 P8 "under 2 hours"를 만족하므로 더 선호된다.
