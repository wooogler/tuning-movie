# S1-T3 Scenario Summary: Solo Weekend 3D Booking

## 1. Scenario Core

- Scenario ID: `scn_s1_solo_weekend_3d`
- Title: `S1-T3: Solo Weekend 3D Booking`
- User goal: 이번 주말에 혼자 `Cosmic Laughs`를 3D로 보고 싶다.
- Main difficulty: 가장 가까운 극장을 먼저 보게 되지만, 그 극장에서는 최종 좌석 조건이 맞지 않는다.
- Natural resolution: 날짜와 극장을 비교하면서 가능한 조합을 좁혀 간 뒤, 가까운 대안 극장에서 예매를 완료한다.

---

## 2. What the User Cares About

| ID | Preference | Priority |
|---|---|---|
| P1 | `Cosmic Laughs`를 본다 | hard |
| P2 | 이번 주말(토/일)만 가능하다 | hard |
| P3 | 7 PM 전에 끝나야 한다 | hard |
| P4 | 10마일 이내 극장만 가능하다 | hard |
| P5 | 가장 가까운 극장을 선호한다 | soft |
| P6 | 3D 상영이어야 한다 | hard |
| P7 | 가운데 좌석이 필요하다 | hard |

핵심 해석:

- 영화 선택은 사실상 고정이다.
- 실제 탐색은 `date`, `theater`, `showtime`, `seat` 단계에서 일어난다.
- 특히 이 시나리오는 `주말 중 어떤 날짜를 고를지`와 `어느 극장을 고를지`가 모두 대안 탐색 포인트다.

---

## 3. Scenario Data Shape

이 시나리오에 연결된 데이터는 크게 네 종류로 구성된다.

- Movies: 어떤 영화들이 보이는지
- Theaters: 각 극장의 거리와 특성
- Showings: 날짜, 시간, 포맷(3D/Standard)
- Seats: 특정 상영에서 어떤 좌석이 남아 있는지

사용자 관점에서 중요한 데이터만 요약하면 아래와 같다.

### Movies

- `Cosmic Laughs`가 실제 목표 영화다.
- 다른 영화들은 선택지처럼 보이지만 실제로는 비교용 더미 역할이 크다.

### Theaters

| Theater | Distance | Meaning in scenario |
|---|---:|---|
| Skyline Multiplex | 3.0 mi | 가장 가까운 1차 후보 |
| Cedar Point Cinema | 8.0 mi | 10마일 이내 대안 후보 |
| North County Screen Center | 12.4 mi | 좌석은 가능할 수 있어도 거리 제한으로 제외 |

### Dates

- 화면에는 `Sat 3/14`, `Sun 3/15`, `Mon 3/16`, `Tue 3/17` 이 보일 수 있다.
- 하지만 실제로 가능한 날짜는 `Sat 3/14` 와 `Sun 3/15` 뿐이다.
- 따라서 date 단계에서 이미 2개의 유효 대안이 존재한다.

### Cosmic Laughs Showtimes

`Cosmic Laughs`는 극장별로 비슷한 상영 패턴을 가진다.

| Time | Format | Ends | Interpretation |
|---|---|---|---|
| 3:00 PM | 3D | 5:30 PM | 유효 후보 |
| 4:00 PM | Standard | 6:30 PM | 3D 조건 위반 |
| 5:30 PM | 3D | 8:00 PM | 종료 시간 위반 |
| 7:00 PM | Standard | 9:30 PM | 포맷/시간 모두 부적합 |
| 7:30 PM | 3D | 10:00 PM | 종료 시간 위반 |

즉, 시간 단계에서는 사실상 `3:00 PM 3D`만 살아남는다.

### Seats

- `Skyline Multiplex`의 `3:00 PM 3D`에서는 가운데 좌석이 남아 있지 않다.
- `Cedar Point Cinema`의 `3:00 PM 3D`에서는 가운데 좌석이 남아 있다.
- `North County`도 좌석은 가능할 수 있지만 거리 제한 때문에 정답 후보가 아니다.

---

## 4. Where Alternatives Appear

이 시나리오의 대안 탐색은 크게 두 단계에서 발생한다.

### A. Date alternatives

- 사용자는 주말만 가능하므로 `Saturday` 와 `Sunday` 중 하나를 골라야 한다.
- 두 날짜 모두 hard constraint를 만족하는 유효 후보이다.
- 따라서 이 시나리오는 단순히 날짜를 필터링하는 것에서 끝나는 게 아니라, `주말 중 어떤 날로 갈지 선택하는 과정`이 실제로 존재한다.

### B. Theater alternatives

- 극장 단계에서는 `가장 가까운 극장 선호`와 `10마일 이내`라는 두 기준이 함께 작동한다.
- 그래서 사용자는 보통 `Skyline`을 먼저 보지만, 실패하면 `Cedar Point Cinema`로 이동하게 된다.
- `North County`는 보이더라도 hard distance constraint 때문에 배제된다.

정리하면:

- date 단계에서는 `토요일 vs 일요일`의 대안이 있다.
- theater 단계에서는 `가까운 극장 vs 10마일 이내 대안 극장`의 대안이 있다.
- showtime 단계는 겉보기엔 여러 개지만, 실제 hard constraints를 적용하면 거의 하나로 수렴한다.

---

## 5. Expected User Exploration

가장 자연스러운 탐색은 아래와 같다.

### Step 1. Movie Stage

- 사용자는 여러 영화 중에서 `Cosmic Laughs`를 찾는다.
- 여기서는 대안 비교보다 목표 영화 확인이 중요하다.

### Step 2. Theater Stage

- 가장 가까운 `Skyline Multiplex`를 먼저 선택할 가능성이 높다.
- 이유는 `closest theater`가 soft preference로 작동하기 때문이다.

### Step 3. Date Stage

- 사용자는 `Saturday` 또는 `Sunday` 중 하나를 고른다.
- 두 날짜 모두 유효하기 때문에, 이 단계는 실제 대안 선택 단계다.
- 어느 날짜를 골라도 이후 구조는 거의 동일하다.

### Step 4. Showtime Stage

- 3D이면서 7 PM 전에 끝나는 상영을 찾는다.
- 이 조건을 동시에 만족하는 것은 `3:00 PM`뿐이다.

### Step 5. Seat Stage

- `Skyline`에서는 시간이 맞아도 가운데 좌석이 없다.
- 따라서 여기서 첫 번째 실제 실패가 발생한다.

### Step 6. Backtrack to Theater Stage

- 날짜는 유지할 수 있다.
- 영화도 유지한다.
- 문제는 극장과 좌석 조합이므로, 가장 자연스러운 backtrack은 theater 단계로 돌아가는 것이다.
- 사용자는 `Cedar Point Cinema`로 이동한다.

### Step 7. Retry

- 같은 주말 날짜를 유지한 채 다시 `3:00 PM 3D`를 본다.
- 이번에는 가운데 좌석이 가능하므로 예매가 완료된다.

---

## 6. Main Conflict

이 시나리오의 핵심 conflict는 하나로 요약된다.

- 가장 가까운 극장인 `Skyline Multiplex`에서는
  - 영화는 맞고
  - 날짜도 맞고
  - 3D도 가능하고
  - 종료 시간도 맞지만
  - 최종적으로 가운데 좌석이 남아 있지 않다.

즉, `closest theater` 선호가 최종 해답으로 이어지지 않고, 사용자가 대안 극장으로 이동하도록 만드는 구조다.

---

## 7. Canonical Flow

```text
Cosmic Laughs
  -> Skyline Multiplex
    -> Saturday or Sunday
      -> 3:00 PM (3D)
        -> centered seat unavailable
          -> backtrack to theater
            -> Cedar Point Cinema
              -> same weekend date
                -> 3:00 PM (3D)
                  -> centered seat available
                    -> booking complete
```

이 흐름에서 핵심은 다음 두 가지다.

- 사용자는 주말 중 하루를 선택해야 한다.
- 사용자는 가장 가까운 극장에서 실패한 뒤, 다른 유효 극장으로 이동해야 한다.
