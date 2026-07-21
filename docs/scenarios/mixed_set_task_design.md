# Mixed Set Task Design

## Goal

이 문서는 4개의 set에 대해 `easy 1개`, `hard 1개`씩 총 8개의 task를 완전히 섞인 테마로 재배치한 설계안이다.

설계 원칙은 다음과 같다.

- set별 스토리 테마가 한쪽으로 몰리지 않도록 섞는다.
- easy끼리, hard끼리 주요 난이도 measure는 비슷하게 유지한다.
- 대신 `conflict가 발생하는 단계`와 `실제 대안 탐색이 일어나는 단계`는 최대한 다르게 만든다.
- 사용자 입장에서는 매 task가 서로 다른 생활 맥락처럼 느껴지도록 한다.
- 사용자와 에이전트는 같은 화면 정보만 본다고 가정한다. 즉 미래 단계의 결과는 미리 알 수 없고, 선택 이후에만 다음 단계의 제약/실패를 확인할 수 있다.
- `releaseDate`는 현재 기본 버튼 UI에는 직접 강하게 노출되지 않지만, movie recommendation / movie metadata가 함께 보인다는 확장 가정 아래 movie 선택 근거에 제한적으로 사용한다.

---

## Comparison Table

| Set | Task | Difficulty | Step count | Real alternative stages | Weak/apparent alternative stages | Local conflict stages | Structural conflict / recovery | Attribute emphasis |
|---|---|---|---:|---|---|---|---|---|
| Set 1 | Easy | Easy | 8 | `showtime` | `movie` | `seat` | same movie 내 `showtime` 재선택 | `genre`, `ageRating`, `duration`, `releaseDate`, `synopsis`, `distanceMiles`, `displayEndTime`, `row`, `price` |
| Set 1 | Hard | Hard | 18 | `movie`, `theater` | `showtime` | `seat` -> `showtime` | `movie` branch collapse after theater switch | `genre`, `rating`, `duration`, `releaseDate`, `distanceMiles`, `amenities`, `displayEndTime`, `format`, `row` |
| Set 2 | Easy | Easy | 8 | `theater` | `date` | `date` | weekend date availability를 보고 `theater` 재선택 | `title`, `duration`, `distanceMiles`, `amenities`, `screenCount`, `screenNumber` |
| Set 2 | Hard | Hard | 18 | `date`, `theater` | `showtime` | `showtime` -> `seat` -> `seat` | Saturday-preferred date switch 후 theater switch, then Saturday retry | `genre`, `synopsis`, `rating`, `duration`, `releaseDate`, `ageRating`, `amenities`, `premium`, `price`, `displayEndTime` |
| Set 3 | Easy | Easy | 8 | `date` | `showtime` | `date` | showtime 확인 후 first date branch 포기 | `genre`, `rating`, `screenCount`, `dayOfWeek`, `displayEndTime`, `seat type`, `row`, `price` |
| Set 3 | Hard | Hard | 18 | `movie`, `date` | `showtime` | `seat` -> `showtime` -> `seat` | date switch 후 `movie` branch collapse, second movie에서 showtime retry | `genre`, `rating`, `duration`, `synopsis`, `screenCount`, `dayOfWeek`, `displayEndTime`, `row` |
| Set 4 | Easy | Easy | 8 | `showtime` | `theater` | `seat` | first showtime 실패 후 same theater 내 `showtime` 재선택 | `genre`, `duration`, `distanceMiles`, `amenities`, `displayEndTime`, `row`, `status` |
| Set 4 | Hard | Hard | 18 | `movie`, `showtime` | `date`, `theater` | `showtime` -> `seat` -> `seat` | first movie fails across showtime branch -> second movie에서 showtime retry | `synopsis`, `genre`, `rating`, `duration`, `releaseDate`, `amenities`, `displayEndTime`, `format`, `seat type` |

### Quick read

- `Alternative stage diversity`: easy는 `showtime / theater / date`, hard는 `movie+theater / date+theater / movie+date / movie+showtime`로 분산됨
- `Local conflict diversity`: easy는 `seat`, `showtime`, `date`, `theater`로 분산되고, hard는 `seat -> showtime`, `showtime -> seat -> seat`, `seat -> showtime -> seat`, `showtime -> seat -> seat` 같은 서로 다른 순서를 갖도록 설계함
- `Attribute diversity`: movie 쪽은 `genre/rating/duration/synopsis/releaseDate`, theater 쪽은 `distance/amenities/screenCount`, showtime 쪽은 `format/displayEndTime`, seat 쪽은 `type/price/row/status`를 나눠 사용함.

### Diversity check

| Group | What is compared | Current spread | Notes |
|---|---|---|---|
| Easy | Real alternative stages | `showtime`, `theater`, `date` | `showtime`, `theater`, `date`가 각각 뚜렷하게 분리됨 |
| Easy | Local conflict stages | `seat`, `date`, `date`, `seat` | `date`와 `seat`가 2회씩 나오지만 triggering reason과 recovery stage가 다름 |
| Hard | Real alternative stages | `movie+theater`, `date+theater`, `movie+date`, `movie+showtime` | hard 4개가 모두 다른 상위-stage 조합을 가짐 |
| Hard | Local conflict order | `seat -> showtime`, `showtime -> seat -> seat`, `seat -> showtime -> seat`, `showtime -> seat -> seat` | 일부 패턴은 유사하지만 real alternative stages와 attribute emphasis가 다름 |
| Hard | Attribute emphasis | movie / theater / date / showtime / seat 속성 조합 | `Set 1`은 `releaseDate+amenities+format`, `Set 2`는 `releaseDate+ageRating+amenities+premium+price`, `Set 3`은 `synopsis+screenCount+dayOfWeek`, `Set 4`는 `releaseDate+amenities+format+displayEndTime` 쪽이 더 강함 |

### Easy-only comparison

| Set | Step count | Real alternative stages | Local conflict stage | Structural recovery | Attribute emphasis | Expected backtracks |
|---|---:|---|---|---|---|---:|
| Set 1 Easy | 8 | `showtime` | `seat` | same movie 내 `showtime` 재선택 | `genre`, `ageRating`, `duration`, `releaseDate`, `synopsis`, `distanceMiles`, `displayEndTime`, `row`, `price` | 1 |
| Set 2 Easy | 8 | `theater` | `date` | weekend date availability를 보고 `theater` 재선택 | `title`, `duration`, `distanceMiles`, `amenities`, `screenCount`, `screenNumber` | 1 |
| Set 3 Easy | 8 | `date` | `date` | showtime 확인 후 first date branch 포기 | `genre`, `rating`, `screenCount`, `dayOfWeek`, `displayEndTime`, `seat type`, `row`, `price` | 1 |
| Set 4 Easy | 8 | `showtime` | `seat` | first showtime 실패 후 same theater 내 `showtime` 재선택 | `genre`, `duration`, `distanceMiles`, `amenities`, `displayEndTime`, `row`, `status` | 1 |

### Hard-only comparison

| Set | Step count | Real alternative stages | Local conflict stages | Structural conflict / recovery | Attribute emphasis | Expected backtracks |
|---|---:|---|---|---|---|---:|
| Set 1 Hard | 18 | `movie`, `theater` | `seat` -> `showtime` | `movie` branch collapse after theater switch | `genre`, `rating`, `duration`, `distanceMiles`, `amenities`, `displayEndTime`, `format`, `row` | 2 |
| Set 2 Hard | 18 | `date`, `theater` | `showtime` -> `seat` -> `seat` | Saturday-preferred date switch 후 theater switch, then Saturday retry | `genre`, `synopsis`, `rating`, `duration`, `releaseDate`, `ageRating`, `amenities`, `premium`, `price`, `displayEndTime` | 3 |
| Set 3 Hard | 18 | `movie`, `date` | `seat` -> `showtime` -> `seat` | date switch 후 `movie` branch collapse, second movie에서 showtime retry | `genre`, `rating`, `duration`, `synopsis`, `screenCount`, `dayOfWeek`, `displayEndTime`, `row` | 3 |
| Set 4 Hard | 18 | `movie`, `showtime` | `showtime` -> `seat` -> `seat` | first movie fails across showtime branch -> second movie에서 showtime retry | `synopsis`, `genre`, `rating`, `duration`, `releaseDate`, `amenities`, `displayEndTime`, `format`, `seat type` | 3 |

### Hard stage path sequences

- `Set 1 Hard` (18): `Movie -> Theater -> Date -> Showtime -> Seat -> Showtime -> Date -> Theater -> Date -> Showtime -> Date -> Theater -> Movie -> Theater -> Date -> Showtime -> Seat -> Confirm`
- `Set 2 Hard` (18): `Movie -> Theater -> Date -> Showtime -> Date -> Showtime -> Seat -> Showtime -> Date -> Theater -> Date -> Showtime -> Seat -> Showtime -> Date -> Showtime -> Seat -> Confirm`
- `Set 3 Hard` (18): `Movie -> Theater -> Date -> Showtime -> Seat -> Showtime -> Date -> Showtime -> Date -> Theater -> Movie -> Theater -> Date -> Showtime -> Seat -> Showtime -> Seat -> Confirm`
- `Set 4 Hard` (18): `Movie -> Theater -> Date -> Showtime -> Seat -> Showtime -> Date -> Theater -> Movie -> Theater -> Date -> Showtime -> Seat -> Showtime -> Seat -> Showtime -> Seat -> Confirm`

### Step count note

- 현재 hard step count는 `18 / 18 / 18 / 18`로 맞춰져 있다.
- 같은 stage 안에서 연속으로 일어나는 판단/선택은 하나의 step으로 다시 합쳤다.
- 그 상태에서 `Set 3 Hard`, `Set 4 Hard`에는 자연스러운 추가 루프를 넣어 목표 구간에 다시 맞췄다.
- `Set 2 Hard`, `Set 3 Hard`, `Set 4 Hard`는 추가 탐색 루프가 들어가므로 `expected backtracks`를 `3`까지 허용하는 편이 자연스럽다.

---

## Global Difficulty Targets

### Easy target

- 실제 대안 단계: 1~2개
- 주요 conflict: 1개
- 예상 backtrack: 0~1회
- 최종 정답: 사실상 1개
- 실패 발견 시점: 보통 `showtime` 또는 `seat`

### Hard target

- 실제 대안 단계: 2~3개
- 주요 conflict: 2개 이상 또는 branch-level collapse 1개
- 예상 backtrack: 2~3회
- 상위 단계(`movie`, `date`, `theater`) 중 최소 1개는 실제 대안 단계여야 함
- logical backtrack이 2~3회 수준으로 느껴져야 함
- local failure만 반복되는 구조가 아니라, 중간에 한 번은 상위 가정을 수정하게 해야 함
- 최종 정답: 사실상 1개

---

## Set Overview

| Set | Task | Story theme | Main alternative stages | Main conflict stage |
|---|---|---|---|---|
| Set 1 | Easy | Child playdate movie | showtime | seat |
| Set 1 | Hard | Friends action night | movie + theater | seat + showtime -> movie |
| Set 2 | Easy | Solo 3D weekend outing | theater | date |
| Set 2 | Hard | Parents anniversary gift | date + theater | showtime -> seat -> seat |
| Set 3 | Easy | Couple date movie | date | date |
| Set 3 | Hard | Sibling thriller night | movie + date | seat -> showtime -> seat |
| Set 4 | Easy | Family outing with amenity preference | showtime | showtime |
| Set 4 | Hard | Last movie before trip | movie + showtime | showtime -> seat -> seat -> movie |

---

## Set 1

### Set 1 - Easy

**Story**

일요일 오전 11시쯤 아이 playdate가 끝난 뒤, 보호자가 아이 둘을 영화관에 데려가려고 한다. 영화는 초등학생 아이들이 보기 무난한 가족 영화여야 하고, `G`나 `PG` 정도의 연령등급이면 안심된다. 후보가 여러 개면 더 짧은 영화가 낫다. 시간대는 playdate가 끝난 뒤에 시작해야 하고, 그중에서는 더 이른 시간대가 낫다. 보호자까지 포함해 셋이 나란히 앉을 수 있어야 하고, 앞쪽 좌석은 피하고 싶다. 가능하면 좌석 가격도 너무 높지 않았으면 좋다.

**Step-by-step interpretation**

1. `Movie`: 사용자는 아이들 상황을 설명하고, `genre`, `ageRating`, `duration`, `synopsis`를 함께 보고 추천받은 가족 영화 중 하나를 선택한다.
2. `Theater`: 가장 가까운 극장을 선택한다.
3. `Date`: 고정된 날짜인 일요일을 선택한다.
4. `Showtime`: 오전 11시쯤 playdate가 끝난 뒤 시작하는 후보 중에서 가장 이른 시간대를 선택한다.
5. `Seat`: 앞줄을 제외하면 붙은 3석이 없다는 것을 확인한다.
6. `Showtime`으로 backtrack: 같은 영화, 같은 극장, 같은 날짜 안에서 다른 시간대를 다시 본다.
7. `Seat`: 새 시간대에서는 조건에 맞는 인접 좌석을 찾고, 너무 비싼 row는 피한다.
8. `Confirm`: 최종 선택을 검토하고 완료한다.

**Attributes used in step-by-step interpretation**

- `Movie`: `genre`, `ageRating`, `duration`, `synopsis`
- `Theater`: `distanceMiles`
- `Date`: `date`
- `Showtime`: `displayTime`, `displayEndTime`
- `Seat`: `row`, `number`, `status`, `price`

**Conflict stage**

- Primary conflict: `seat`
- Conflict type: 같은 영화, 같은 극장, 같은 날짜 안에서 첫 유효 시간대의 좌석 패턴이 실패

**Major difficulty measures**

- Difficulty band: Easy
- Real alternative stages: `showtime`
- Weak/apparent alternative stages: `movie`
- Expected backtracks: 1
- Hard preferences: `G/PG` 연령등급, 날짜, 인접 3석, 앞줄 제외
- Soft preferences: AI 추천, 짧은 러닝타임, 오전 11시 이후 가능한 더 이른 showtime
- Failure discovery timing: late
- Final answer uniqueness: 높음

### Set 1 - Hard

**Story**

친구와 토요일 밤에 액션 영화를 보려고 한다. 액션 장르여야 하고, 가능하면 평점이 높은 영화, 그중에서도 너무 오래된 작품보다는 비교적 최근 개봉작을 먼저 보고 싶다. 너무 긴 영화는 부담스럽다. 도착 가능한 시간과 종료 시각 제한이 있고, 두 사람이 붙어 앉을 수 있어야 하며 너무 앞줄은 피하고 싶다. 가까운 극장이 좋지만, 필요하면 `Free Parking` 같은 amenity가 더 나은 조금 먼 극장도 갈 수 있다. 그리고 이번에는 일반 상영이 아니라 `IMAX` 포맷이어야 한다.

**Step-by-step interpretation**

1. `Movie`: 사용자는 액션 영화 중 `rating`, `releaseDate`, `duration`을 함께 보고 우선순위가 가장 높은 영화를 먼저 선택한다.
2. `Theater`: 가장 가까운 극장을 먼저 선택한다.
3. `Date`: 고정된 토요일 날짜를 선택한다.
4. `Showtime`: 현재 극장에서는 아래 시간대가 보인다.
   `4:10 PM — ends 6:22 PM — IMAX`
   `6:10 PM — ends 8:22 PM — IMAX`
   `8:00 PM — ends 10:12 PM — Standard`
   이 중 시간 조건과 `IMAX` 요구사항을 함께 보면 사실상 `6:10 PM`을 선택한다.
5. `Seat`: 붙은 2석이 없거나, 남은 좌석이 앞쪽뿐이라 실패한다.
6. `Showtime`으로 backtrack: 같은 극장에서 다른 시간대를 확인하지만, 조건에 맞는 선택지가 없거나 시간 조건 자체가 맞지 않는다.
7. `Date`로 backtrack: 같은 토요일 날짜를 다시 확인한다.
8. `Theater`로 backtrack: 같은 날짜를 유지한 채, amenity가 더 나은 더 먼 대안 극장으로 이동한다.
9. `Date`: 대안 극장에서 같은 토요일 날짜를 다시 선택한다.
10. `Showtime`: 대안 극장의 시간대를 확인하면 시간 제약에 맞는 `Standard` 상영 하나는 보이지만, hard `IMAX` 요구사항을 충족하지 못해 탈락한다.
11. `Date`로 backtrack: 같은 날짜 기준으로 더 볼 선택지가 없음을 확인한다.
12. `Theater`로 backtrack: 극장 기준으로도 첫 영화는 답이 없다고 판단한다.
13. `Movie`: 처음 고른 영화 branch 전체를 포기하고, 더 짧은 다른 액션 영화로 바꾼다.
14. `Theater`: 새 영화 기준으로 극장을 다시 선택한다.
15. `Date`: 같은 토요일 날짜를 다시 선택한다.
16. `Showtime`: 새 영화에서는 아래 시간대가 보인다.
   `2:50 PM — Standard, ends 4:38 PM`
   `4:10 PM — Standard, ends 5:58 PM`
   `5:20 PM — IMAX, ends 7:08 PM`
   `6:40 PM — IMAX, ends 8:28 PM`
   이 중 `5:20 PM IMAX`는 도착 가능 시간보다 이르므로 decoy이고, 실제 정답은 `6:40 PM IMAX`다.
17. `Seat`: 적절한 좌석을 찾는다.
18. `Confirm`: 최종 선택을 검토하고 완료한다.

**Attributes used in step-by-step interpretation**

- `Movie`: `genre`, `rating`, `duration`, `releaseDate`
- `Theater`: `distanceMiles`, `amenities`
- `Date`: `date`
- `Showtime`: `displayTime`, `displayEndTime`, `format`
- `Seat`: `row`, `number`, `status`

**Conflict stage**

- First local conflict: `seat` at the closest theater
- Second local conflict: `showtime` at the alternate theater
- Main structural conflict: `movie`
- Conflict type: theater를 바꿔도 첫 번째 영화 branch가 유지되지 못함

**Major difficulty measures**

- Difficulty band: Hard
- Real alternative stages: `movie`, `theater`
- Weak/apparent alternative stages: `showtime`
- Expected backtracks: 2
- Hard preferences: 장르, 날짜, 도착 가능 시간, 종료 시간, `IMAX`, 인접 2석, 앞줄 제외
- Soft preferences: 최고 평점 우선, 비교적 최근 개봉작 선호, 가까운 극장 선호
- Failure discovery timing: late, then branch-level after theater switch
- Final answer uniqueness: 높음

---

## Set 2

### Set 2 - Easy

**Story**

혼자 이번 주말에 꼭 보고 싶었던 SF 영화를 3D로 보려 한다. 토요일이나 일요일 둘 중 하루면 되고, 저녁 일정 때문에 7시 전에는 끝나야 한다. 가장 가까운 극장을 먼저 보게 되지만, 실제로는 주말 상영이 있는지가 가장 중요하다. 토요일은 차를 가져가야 해서 `Free Parking` 같은 amenity가 더 중요해질 수 있고, 사람이 너무 많은 멀티플렉스보다는 `screenCount`가 적당한 극장이 더 편하다.

**Step-by-step interpretation**

1. `Movie`: 사용자는 목표 영화를 고른다.
2. `Theater`: 가장 가까운 극장을 먼저 선택한다.
3. `Date`: 토요일과 일요일 중 한 날짜를 확인하지만, 이 극장에서는 해당 영화가 주말이 아니라 월요일부터 상영된다는 것을 알게 된다.
4. `Theater`로 backtrack: 그래서 `distanceMiles`보다 주말 상영 availability와 `Free Parking`, 적당한 `screenCount`가 더 중요하다고 판단해 다른 극장으로 바꾼다.
5. `Date`: 새 극장에서 토요일이나 일요일 중 한 날짜를 선택한다.
6. `Showtime`: 조건에 맞는 상영을 고른다.
7. `Seat`: 좌석까지 무리 없이 선택한다.
8. `Confirm`: 최종 선택을 검토하고 완료한다.

**Attributes used in step-by-step interpretation**

- `Movie`: `title`, `duration`
- `Theater`: `distanceMiles`, `amenities`, `screenCount`
- `Date`: `date`, `dayOfWeek`
- `Showtime`: `displayTime`, `displayEndTime`, `screenNumber`
- `Seat`: `row`, `number`, `status`

**Conflict stage**

- Primary conflict: `date`
- Conflict resolution pivot: `theater`

**Major difficulty measures**

- Difficulty band: Easy
- Real alternative stages: `theater`
- Weak/apparent alternative stages: `date`
- Expected backtracks: 1
- Hard preferences: 특정 영화, 주말 상영 가능, 종료 시간
- Soft preferences: 가장 가까운 극장 먼저 확인, 토요일에는 `Free Parking` 선호, `screenCount`가 너무 크지 않은 극장 선호
- Failure discovery timing: early, at date availability check
- Final answer uniqueness: 높음

### Set 2 - Hard

**Story**

부모님 결혼기념일을 맞아 주말 중 하루에 영화 티켓을 선물하려고 한다. 주말 안에만 보면 되고, 분위기상 로맨틱한 영화가 좋고, 너무 늦게 끝나면 안 되며, 부모님이 편하게 보실 수 있는 프리미엄 좌석이 필요하다. 최신작만 고집하기보다 `Love Actually` 같은 익숙한 로맨틱 클래식이나 재개봉작도 오히려 잘 어울릴 수 있다고 느낀다. 너무 자극적인 `R` 등급은 제외하고 `PG-13` 이하만 보려고 한다. 토요일이 실제 기념일과 더 가까워서 조금 더 선호하지만, 일요일도 가능하다. 대신 일요일은 부모님이 일찍 귀가해야 해서 이른 시간대가 더 자연스럽다. 가능하면 가까운 극장이 좋지만, 주차나 라운지 같은 amenity가 더 나은 극장도 고려할 수 있다. 그래서 처음에는 가장 가까운 극장과 토요일부터 확인한다.

**Step-by-step interpretation**

1. `Movie`: 사용자는 상황을 설명하고, `genre`, `synopsis`, `rating`, `duration`, `releaseDate`, `ageRating`을 함께 고려해 추천받은 로맨틱한 영화 하나를 선택한다. 이때 `releaseDate`는 최신작 우선이라기보다, 익숙한 클래식/재개봉도 긍정적으로 보는 기준으로 작동한다.
2. `Theater`: 가장 가까운 극장을 먼저 선택한다.
3. `Date`: 선호도상 토요일을 먼저 선택한다.
4. `Showtime`: 현재 극장과 토요일 조합에서는 부모님과 만나기 좋은 저녁 시간대가 없거나, 있는 상영이 너무 늦게 끝난다는 것을 확인한다.
5. `Date`로 backtrack: 같은 극장을 유지한 채 일요일로 바꾼다.
6. `Showtime`: 일요일에는 부모님이 일찍 귀가할 수 있는 진짜 morning slot 하나, 즉 `11:00 AM` 이전 상영을 선택한다.
7. `Seat`: 부모님이 편하게 앉을 수 있는 `premium` 인접 좌석이 없거나, 남아 있는 좌석이 가격/위치 면에서 만족스럽지 않아 실패한다.
8. `Showtime`으로 backtrack: 같은 날짜와 극장 안에서 다른 일요일 시간대를 확인하지만, 남은 선택지는 저녁 시간대뿐이라 Sunday morning 선호와 맞지 않는다.
9. `Date`로 backtrack: 일요일 날짜를 다시 확인한다.
10. `Theater`로 backtrack: 극장별로 주말 날짜와 시간대 구성이 다를 수 있고, `Saturday` 선호가 아직 살아 있으므로 다른 극장으로 이동한다.
11. `Date`: 대안 극장에서는 원래 soft preference였던 토요일부터 다시 선택한다.
12. `Showtime`: 토요일 기준으로는 이번에는 `5:00 PM` 무렵 시작해 `9:00 PM` 전에 끝나는 시간대가 하나 보인다.
13. `Seat`: 붙은 2석은 보이지만 `Standard`뿐이고, 부모님 결혼기념일 선물이라 원하는 `Premium` 2연석이 아니라서 실패한다.
14. `Showtime`으로 backtrack: 같은 극장에서 다른 토요일 시간대를 다시 확인하지만, 이번에는 너무 늦게 끝나거나 적절한 좌석이 없다.
15. `Date`로 backtrack: 대안 극장에서는 이제 일요일을 다시 검토한다.
16. `Showtime`: 대안 극장에서도 일요일의 `11:00 AM` 이전 morning slot을 선택한다.
17. `Seat`: 이번에는 좌석 조건까지 만족하는 조합을 찾는다.
18. `Confirm`: 최종 선택을 검토하고 완료한다.

**Attributes used in step-by-step interpretation**

- `Movie`: `genre`, `synopsis`, `rating`, `duration`, `releaseDate`, `ageRating`
- `Theater`: `distanceMiles`, `amenities`
- `Date`: `date`, `dayOfWeek`
- `Showtime`: `displayTime`, `displayEndTime`
- `Seat`: `type`, `row`, `number`, `status`, `price`

**Conflict stage**

- First local conflict: `showtime` at the first date and closest theater
- Second local conflict: `seat` after switching date
- Third local conflict: `seat` after switching theater
- Main structural recovery stages: `date`, `theater`

**Major difficulty measures**

- Difficulty band: Hard
- Real alternative stages: `date`, `theater`
- Weak/apparent alternative stages: `showtime`
- Expected backtracks: 3
- Hard preferences: 주말 안에서만 관람 가능, `PG-13` 이하만 허용, 종료 시간 제약, 일요일에는 이른 시간대 필요, 좌석 품질, 프리미엄 인접석
- Soft preferences: 토요일 선호, 가까운 극장, 추천 기반 선택, 익숙한 로맨틱 클래식/재개봉 선호
- Failure discovery timing: mid, then late after theater/date retry
- Final answer uniqueness: 높음

---

## Set 3

### Set 3 - Easy

**Story**

연인과 이번 주말 영화 데이트를 하려고 한다. 이번에는 주말에만 볼 수 있어서 토요일이나 일요일 안에서 해결해야 한다. 토요일은 늦은 저녁 일정이 있고, 일요일은 상대적으로 더 이른 시간 안에 끝내야 한다. 이번에는 `Mystery` 장르를 꼭 보고 싶고, 평점이 너무 낮은 영화는 피하고 싶다. 극장은 reclining seat가 있는 곳이어야 해서, theater 단계에서 그 조건이 먼저 중요하다. 너무 늦게 끝나면 안 되며, 가능하면 `couple` 또는 뒤쪽의 더 편한 좌석이면 좋다.

**Step-by-step interpretation**

1. `Movie`: 사용자는 `Mystery` 장르의 영화를 고른다.
2. `Theater`: 사용자는 reclining seat가 있는 극장을 선택한다.
3. `Date`: 먼저 토요일을 선택한다.
4. `Showtime`: 토요일 시간대를 확인하지만, 상대 일정 전에 끝나는 적절한 선택지가 없다.
5. `Date`로 backtrack: 일요일로 바꾼다.
6. `Showtime`: 일요일 시간대를 다시 본다.
7. `Seat`: 일요일에는 자연스럽게 맞는 좌석 조합이 있어 예매를 완료한다.
8. `Confirm`: 최종 선택을 검토하고 완료한다.

**Attributes used in step-by-step interpretation**

- `Movie`: `genre`, `rating`
- `Theater`: `name`, `amenities`
- `Date`: `date`, `dayOfWeek`
- `Showtime`: `displayTime`, `displayEndTime`
- `Seat`: `type`, `row`, `status`, `price`

**Conflict stage**

- Primary conflict: `date`
- Conflict type: 첫 날짜 branch가 showtime 단계에서 무너지고 다른 날짜가 해답이 됨

**Major difficulty measures**

- Difficulty band: Easy
- Real alternative stages: `date`
- Weak/apparent alternative stages: `showtime`
- Expected backtracks: 1
- Hard preferences: `Mystery` 장르, reclining seat가 있는 극장, 날짜 가능 구간, 종료 시간
- Soft preferences: 평점이 너무 낮지 않은 영화 선호, 특정 시간대 선호, 더 편한 2인 좌석 선호
- Failure discovery timing: mid
- Final answer uniqueness: 중간~높음

### Set 3 - Hard

**Story**

형제자매와 영화를 보려 한다. 금요일과 토요일 밤만 가능하지만, 금요일이 조금 더 편하다. 이번에는 작품성 높은 영화보다는 살짝 허술하고 웃긴 `B급 코미디` 쪽이 더 끌린다. 그래서 무조건 최고 평점만 보기보다, `genre`와 `synopsis`가 주는 B급 감성을 더 중요하게 본다. 너무 늦게 끝나면 안 되며, 붙어 앉아야 하고 특정 좌석 구역은 피해야 한다. 붐비는 대형 멀티플렉스보다는 `screenCount`가 적은 극장을 우선 본다.

**Step-by-step interpretation**

1. `Movie`: 사용자는 `genre`, `synopsis`, `duration`을 먼저 보고 B급 코미디 감성이 더 강한 영화를 고른다. `rating`은 참고만 하고 절대 기준으로 두지 않는다.
2. `Theater`: 붐비는 대형 멀티플렉스보다 `screenCount`가 적은 극장을 먼저 선택한다.
3. `Date`: 먼저 금요일을 선택한다.
4. `Showtime`: 금요일에서 조건상 가장 그럴듯한 time slot을 선택한다.
5. `Seat`: 허용 가능한 좌석 구역에는 붙은 2석이 없어서 실패한다.
6. `Showtime`으로 backtrack: 같은 날짜 안에서 다른 시간대를 확인하지만 답이 없다.
7. `Date`로 backtrack: 같은 영화를 유지한 채 토요일로 바꾼다.
8. `Showtime`: 토요일 시간대를 다시 확인하지만, 이번에는 종료 시간 조건에 맞는 showtime 선택지가 없거나 사실상 부적합하다.
9. `Date`로 backtrack: 주말 날짜 기준으로 더 볼 선택지가 없음을 확인한다.
10. `Theater`로 backtrack: 고정된 극장 조건을 다시 지난다.
11. `Movie`: 이제 첫 번째 B급 코미디 후보가 주말 전체에서 맞지 않는다고 판단하고, 비슷한 결의 두 번째 후보로 바꾼다.
12. `Theater`: 극장 자체는 `screenCount` 선호를 계속 만족하고 실패 원인이 아니었으므로 같은 극장을 다시 선택한다.
13. `Date`: 새 영화 기준으로 적절한 날짜를 다시 선택한다.
14. `Showtime`: 새 영화의 시간대를 선택한다.
15. `Seat`: 좌석을 보지만 첫 후보는 원하는 구역과 맞지 않아 실패한다.
16. `Showtime`으로 backtrack: 같은 날짜 안에서 다른 시간대를 다시 확인한다.
17. `Seat`: 이번에는 적절한 좌석을 찾는다.
18. `Confirm`: 최종 선택을 검토하고 완료한다.

**Attributes used in step-by-step interpretation**

- `Movie`: `genre`, `rating`, `duration`, `synopsis`
- `Theater`: `name`, `screenCount`
- `Date`: `date`, `dayOfWeek`
- `Showtime`: `displayTime`, `displayEndTime`
- `Seat`: `row`, `number`, `status`

**Conflict stage**

- First local conflict: `seat` at the first date
- Second local conflict: `showtime` after switching date
- Third local conflict: `seat` after switching movie
- Main structural conflict: `movie`
- Effective structural tension: `movie + date`

**Major difficulty measures**

- Difficulty band: Hard
- Real alternative stages: `movie`, `date`
- Weak/apparent alternative stages: `showtime`
- Expected backtracks: 3
- Hard preferences: 장르, 주말 날짜 범위, 도착 가능 시간, 종료 시간, 인접석, 좌석 위치 제한
- Soft preferences: B급/컬트 감성 선호, 금요일 선호, `screenCount`가 적은 극장 선호
- Failure discovery timing: late, then mid after date switch
- Final answer uniqueness: 높음

---

## Set 4

### Set 4 - Easy

**Story**

어린 자녀와 보호자가 함께 가벼운 가족 영화를 보러 가려 한다. 날짜는 정해져 있고, 영화가 오후 2시 전에 끝나야 남은 일정이 편하다. 가족 영화 몇 개가 가능하더라도 되도록이면 더 짧은 쪽이 자연스럽다. 극장은 `Free Parking`과 `Family Lounge`가 둘 다 있는 곳이 가장 편해서, theater 단계에서는 그 조합을 먼저 고르게 된다. 가족이 함께 가는 상황이라 4연석이 있는지도 중요하다.

**Step-by-step interpretation**

1. `Movie`: 사용자는 가족용 영화 중에서, 여러 후보가 가능하면 더 짧은 작품 쪽으로 기운다.
2. `Theater`: `Free Parking`과 `Family Lounge`를 둘 다 갖춘 극장을 선택한다.
3. `Date`: 고정된 날짜를 선택한다.
4. `Showtime`: 오후 2시 전에 끝나는 시간대 중 가장 이른 후보를 먼저 선택한다.
5. `Seat`: 막상 좌석을 보니 4연석은 없고 2~3연석만 남아 있어 실패한다.
6. `Showtime`으로 backtrack: 같은 극장과 날짜 안에서 다음 후보 시간대로 바꾼다.
7. `Seat`: 이번에는 4연석이 두 블록이나 있어 아무 쪽이든 무리 없이 선택한다.
8. `Confirm`: 최종 선택을 검토하고 완료한다.

**Attributes used in step-by-step interpretation**

- `Movie`: `genre`, `duration`
- `Theater`: `distanceMiles`, `amenities`
- `Date`: `date`
- `Showtime`: `displayTime`, `displayEndTime`
- `Seat`: `row`, `status`

**Conflict stage**

- Primary conflict: `seat`
- Conflict type: 같은 극장과 날짜 안에서 첫 시간대의 좌석 패턴이 좋지 않아 다른 시간대로 옮겨야 함

**Major difficulty measures**

- Difficulty band: Easy
- Real alternative stages: `showtime`
- Weak/apparent alternative stages: `theater`
- Expected backtracks: 1
- Hard preferences: 날짜 고정, 오후 2시 이전 종료, 4연석
- Soft preferences: movie 선택에서 드러나는 짧은 러닝타임 선호, `Free Parking`/`Family Lounge` 같은 amenity 선호
- Failure discovery timing: late
- Final answer uniqueness: 중간~높음

### Set 4 - Hard

**Story**

친구와 여행 떠나기 전날 밤에 마지막으로 영화 한 편을 보려고 한다. 날짜는 사실상 고정되어 있고, 극장은 `Reserved Seating`과 `Free Parking` 같은 amenity가 갖춰져 있어 마지막 일정에 무리 없는 곳으로 정해 둔 상태다. 그 안에서 영화와 시간대를 잘 골라야 한다. 너무 무거운 줄거리보다는 가볍고, 너무 긴 영화는 피하고 싶다. 가능하면 조금 더 성인 취향의 코미디가 더 끌리고, 3D나 IMAX 같은 강한 포맷보다는 일반 상영을 선호한다. 특별 상영은 보통 더 비싸서 가능하면 피하고 싶다. 친구와 같이 가는 상황이라 결국에는 붙은 2석도 필요하다.

**Step-by-step interpretation**

1. `Movie`: 사용자는 `synopsis`, `genre`, `rating`, `duration`, `releaseDate`를 기준으로 보고 싶은 분위기의 영화를 먼저 고르거나 추천받고, 가능하면 더 성인 취향의 코미디를 선호한다.
2. `Theater`: `Reserved Seating`과 `Free Parking`이 있어 마지막 일정에 무리 없는 극장을 선택한다.
3. `Date`: 고정된 날짜를 선택한다.
4. `Showtime`: 첫 번째 영화에서는 늦은 시간대는 `displayEndTime` 때문에, 다른 시간대는 `format`과 가격 부담 때문에 제외하고, 남은 시간대 하나를 선택한다.
5. `Seat`: 실제로 좌석을 열어 보지만 붙은 2석이 원하는 구역에 없어 실패한다.
6. `Showtime`으로 backtrack: 같은 영화 안에서 더 볼 시간대가 없음을 확인한다.
7. `Date`로 backtrack: 같은 날짜 기준으로도 더 진행할 선택지가 없음을 확인한다.
8. `Theater`로 backtrack: 고정된 극장을 다시 지난다.
9. `Movie`: 이제 첫 번째 영화는 현재 일정 안에서 맞지 않는다고 판단하고, 차선의 다른 영화로 이동한다.
10. `Theater`: 극장 자체는 `Reserved Seating`과 `Free Parking` 조건을 계속 만족하고 있어 같은 극장을 다시 선택한다.
11. `Date`: 같은 날짜를 다시 선택한다.
12. `Showtime`: 새 영화의 첫 번째 가능한 시간대를 선택한다.
13. `Seat`: 좌석을 보지만 아직 붙은 2석이 원하는 구역에 딱 맞지 않아 실패한다.
14. `Showtime`으로 backtrack: 새 영화 안에서 다른 시간대를 다시 확인한다.
15. `Seat`: 다시 좌석을 보지만 이번에도 붙은 2석이 선호하는 구역과 완전히 맞지는 않는다.
16. `Showtime`으로 backtrack: 새 영화 안에서 마지막 후보 시간대를 다시 확인한다.
17. `Seat`: 이번에는 조건에 맞는 좌석을 찾는다.
18. `Confirm`: 최종 선택을 검토하고 완료한다.

**Attributes used in step-by-step interpretation**

- `Movie`: `synopsis`, `genre`, `rating`, `duration`, `releaseDate`
- `Theater`: `name`, `amenities`
- `Date`: `date`
- `Showtime`: `displayTime`, `displayEndTime`, `format`
- `Seat`: `row`, `type`, `status`, `price`

**Conflict stage**

- First local conflict: `showtime`
- Second local conflict: `seat`
- Third local conflict: `seat` after movie switch
- Final structural conflict: `movie`
- Conflict type: 첫 번째 영화에서 showtime과 seat를 모두 확인해도 branch가 유지되지 않음

**Major difficulty measures**

- Difficulty band: Hard
- Real alternative stages: `movie`, `showtime`
- Weak/apparent alternative stages: `date`, `theater`
- Expected backtracks: 3
- Hard preferences: 고정 날짜, 종료 시간, 포맷 제약, 인접 2석, 중심 구역 선호
- Soft preferences: 분위기/추천 기반 선호, 성인 취향의 코미디 선호, 일반 상영 선호, 가격 부담이 큰 특별 상영 회피, `Reserved Seating`/`Free Parking` 선호
- Failure discovery timing: mid at showtime stage, then branch collapse
- Final answer uniqueness: 높음

---

## Cross-Set Balance Check

### Easy tasks

| Set | Real alternative stages | Main conflict stage | Expected backtracks |
|---|---|---|---:|
| Set 1 Easy | showtime | seat | 1 |
| Set 2 Easy | theater | date | 1 |
| Set 3 Easy | date | date | 1 |
| Set 4 Easy | showtime | seat | 1 |

해석:

- easy 4개는 모두 비교적 짧은 탐색 경로를 가진다.
- 일부 easy는 real alternative stage가 1개뿐이고, 일부는 약한 표면적 대안 단계가 추가된다.
- 하지만 실제로 대안을 비교하게 되는 핵심 단계는 서로 다르다.
- conflict 단계는 `seat`, `date`, `date`, `seat`로 배치되지만, failure가 발생하는 근거와 recovery stage가 서로 다르다.

### Hard tasks

| Set | Real alternative stages | Main conflict stage | Expected backtracks |
|---|---|---|---:|
| Set 1 Hard | movie + theater | seat + showtime -> movie | 2 |
| Set 2 Hard | date + theater | showtime + seat + seat | 3 |
| Set 3 Hard | movie + date | seat + showtime + seat -> movie | 3 |
| Set 4 Hard | movie + showtime | showtime + seat + seat -> movie | 3 |

해석:

- hard 4개는 모두 상위 단계 재선택이 필요하다.
- 그러나 어느 단계에서 사용자가 “처음 선택이 틀렸다”는 걸 체감하는지는 다르다.
- 따라서 동일한 hard band 안에서도 매우 다른 탐색 경험을 제공할 수 있다.

---

## Recommendation

- 이 배치는 set별 테마를 고정하지 않고 충분히 섞어 주기 때문에, 참가자가 set 자체의 패턴을 눈치채기 어렵다.
- 동시에 연구자는 `alternative stage`, `conflict stage`, `backtracking depth`를 독립적으로 조절할 수 있다.
- 실제 구현 단계에서는 이 8개 중 먼저 2개 easy + 2개 hard를 파일럿으로 만들어 사용성 검증을 해 본 뒤, 남은 시나리오를 확장하는 것이 안전하다.
