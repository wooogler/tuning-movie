# Stage Item Attribute Reference

## Purpose

이 문서는 현재 booking flow의 각 stage에서 item이 어떤 attribute를 가지고 있는지 정리한 참고 문서다.

특히 아래를 구분해서 본다.

- data-level attribute: backend / spec 상 존재하는 필드
- user-visible attribute: 현재 UI에서 사용자가 직접 보는 정보
- preference opportunity: 시나리오에서 선호 조건으로 활용할 수 있는 축

이 문서를 보면 현재 preference가 몇 개 안 되는 이유와, 앞으로 어떤 attribute를 더 활용할 수 있는지 같이 판단할 수 있다.

---

## Stage Summary

| Stage | Item type | Data-level attributes | Currently user-visible |
|---|---|---|---|
| Movie | movie item | `title`, `genre`, `rating`, `duration`, `ageRating`, `synopsis` | 주로 `title` |
| Theater | theater item | `name`, `location`, `distanceMiles`, `screenCount`, `amenities` | 주로 `name` |
| Date | date item | `date`, `dayOfWeek`, `displayText`, `available`, `isToday` | 달력의 날짜 위치, 선택 가능 여부 |
| Showtime | time item | `time`, `displayTime`, `endTime`, `displayEndTime`, `format`, `screenNumber` | 주로 `displayTime` |
| Seat | seat item | `row`, `number`, `label`, `type`, `price`, `status` | 좌석 번호, row, occupied/selected, premium 색상, row price |
| Confirm | summary meta | `movie`, `theater`, `date`, `time`, `seats`, `totalPrice` | 요약 전체 |

핵심 포인트:

- 실제 data/spec 레벨에서는 attribute가 꽤 다양하다.
- 하지만 현재 UI는 `movie`, `theater`, `showtime` 단계에서 거의 단일 텍스트만 강하게 노출한다.
- 그래서 지금 시나리오 preference가 몇 개 attribute에 몰려 보이는 것이 자연스럽다.

---

## 1. Movie Stage

### Data-level attributes

출처: `apps/frontend/src/spec/generators.ts`, `apps/backend/src/study/scenarioDataset.ts`

- `id`
- `title`
- `genre: string[]`
- `rating: string`
- `duration: string`
- `ageRating: string`
- `synopsis: string`
- `releaseDate`는 backend movie 데이터에는 존재하지만, 현재 movie spec item에는 직접 포함되지 않음

### Agent field guide

현재 stage meta에서는 movie stage를 다음 preference에 연결하고 있다.

- specific movie title
- genre
- rating threshold / high rating
- duration
- age appropriateness

### Currently user-visible in UI

- 현재 `MovieStage`는 `ButtonGroup`을 사용하고, `valueField`가 `title`이다.
- 즉 사용자 화면에서는 사실상 `영화 제목`만 직접 보인다.
- `genre`, `rating`, `duration`, `ageRating`, `synopsis`는 spec에는 있지만 현재 메인 선택 UI에서 강하게 드러나지 않는다.

### Preference opportunities

- 특정 영화 지정
- 장르 선호 / 장르 제외
- 평점 임계값 또는 최고 평점 우선
- 러닝타임 상한/하한
- 연령 적합성
- 분위기/줄거리 기반 추천
- 개봉 여부 / 최신작 선호 (releaseDate를 노출하면 가능)

### Notes

- movie stage는 실제로 가장 확장 여지가 큰데, 현재 UI 노출은 가장 단순한 편이다.
- 앞으로 attribute 다양성을 높이려면 `genre`, `rating`, `duration`, `ageRating`, `synopsis`, `releaseDate`를 더 직접적으로 보여주는 방식이 필요하다.

---

## 2. Theater Stage

### Data-level attributes

출처: `apps/frontend/src/spec/generators.ts`, `apps/backend/src/study/scenarioDataset.ts`

- `id`
- `name`
- `location`
- `screenCount`
- `distanceMiles`
- `amenities: string[]`

### Agent field guide

현재 stage meta에서는 theater stage를 다음 preference에 연결하고 있다.

- proximity / distance
- specific theater name
- location constraints

중요한 구분:

- `IMAX`, `3D`는 theater 속성이 아니라 showtime 속성으로 간주됨

### Currently user-visible in UI

- 현재 `TheaterStage`도 `ButtonGroup`을 사용하고 `valueField`는 `name`
- 즉 사용자 화면에서는 주로 `극장 이름`만 직접 본다.
- `distanceMiles`, `location`, `amenities`, `screenCount`는 data에는 있지만 현재 메인 선택 UI에서는 강하게 보이지 않는다.

### Preference opportunities

- 가장 가까운 극장
- 거리 상한 (`within 10 miles`, `within 12 miles`)
- 특정 지역 / 특정 지점 선호
- amenity 기반 선호 (`Recliner`, `Free Parking`, `Family Lounge`, `Reserved Seating`)
- 규모 기반 선호 (`small theater`, `larger multiplex`)

### Notes

- 현재 시나리오에서 theater preference가 사실상 `closest`에 치우친 이유는 UI 노출이 이름 중심이기 때문이기도 하다.
- amenity와 location을 더 노출하면 theater stage도 훨씬 다양한 conflict를 만들 수 있다.

---

## 3. Date Stage

### Data-level attributes

출처: `apps/frontend/src/spec/generators.ts`

- `id` (= date string)
- `date`
- `dayOfWeek`
- `displayText`
- `available: boolean`
- `isToday: boolean`

### Agent field guide

- specific date
- weekday/weekend constraints
- date range constraints

### Currently user-visible in UI

- 달력 grid 상의 날짜 위치
- 선택 가능 / 불가능 여부
- 오늘 표시 여부
- 선택 여부

즉 date stage는 텍스트 attribute가 많지 않지만, 시각적 상태 attribute가 중요하다.

### Preference opportunities

- 특정 날짜 고정
- 이번 주말 / 다음 주말
- 토요일만, 일요일만
- 평일/주말 구분
- 날짜 범위 제한
- 오늘 이후 며칠 안 / 특정 이벤트 전후
- morning / afternoon 선호와 결합한 date-time 분기

### Notes

- date stage는 필드 수는 적지만, branch를 만드는 힘은 강하다.
- 특히 `2개의 유효 날짜 중 무엇을 선택할지`가 있으면 구조적으로 풍부해진다.

---

## 4. Showtime Stage

### Data-level attributes

출처: `apps/frontend/src/spec/generators.ts`, `apps/backend/src/routes/showings.ts`

- `id`
- `time`
- `displayTime`
- `endTime`
- `displayEndTime`
- `format: Standard | IMAX | 3D`
- `screenNumber`

backend showing row에는 추가로 아래도 존재한다.

- `movieId`
- `theaterId`
- `date`
- `totalSeats`
- `availableSeats`는 API 응답 단계에서 계산되어 붙음

### Agent field guide

- start time constraints
- end time constraints
- arrival time constraints
- format requirements (`IMAX`, `3D`)
- specific screen number when relevant

### Currently user-visible in UI

- 현재 `TimeStage`는 `ButtonGroup`을 사용하고 `valueField`는 `displayTime`
- 즉 사용자 화면에서는 현재 주로 `상영 시작 시각`만 직접 본다.
- `format`, `displayEndTime`, `screenNumber`, `availableSeats`는 spec/data에는 있지만 메인 버튼 텍스트로 강하게 보이지 않는다.

### Preference opportunities

- 시작 시각 제약 (`start after 1 PM`, `arrive after 6 PM`)
- 종료 시각 제약 (`end before 10 PM`)
- 포맷 필수 (`IMAX`, `3D`)
- 너무 늦은 상영 회피
- 좌석 여유가 많은 상영 선호 (`availableSeats`를 노출하면 가능)
- 특정 screen number 선호/회피

### Notes

- 현재 많은 시나리오가 실제로 showtime stage에 의존하는 이유는 이 stage가 `시간 + 포맷`을 동시에 담고 있기 때문이다.
- 만약 `displayEndTime`과 `format`을 더 명확히 노출하면 preference 다양성이 크게 늘어난다.

---

## 5. Seat Stage

### Data-level attributes

출처: `apps/frontend/src/spec/generators.ts`, `apps/backend/src/study/scenarioDataset.ts`

- `id`
- `showingId`
- `row`
- `number`
- `label`
- `type: standard | premium | couple`
- `price`
- `status: available | occupied | selected`

seat template / dataset 차원에서는 추가로 아래 개념도 존재한다.

- `rows`
- `seatsPerRow`
- `defaultType`
- `defaultPrice`
- row별 type/price rule

### Agent field guide

- seat position (`center`, `front`, `back`)
- row avoidance
- seat type (`premium`, `couple`)
- adjacency
- price

### Currently user-visible in UI

- row label
- seat number
- occupied 여부
- selected 여부
- premium 색상 구분
- row별 가격 표시

seat stage는 현재도 가장 풍부하게 attribute가 드러나는 stage다.

### Preference opportunities

- 인접 2석 / 3석
- 가운데 좌석
- 앞줄 회피 / 뒷줄 회피
- 특정 row 선호/회피
- premium seat 필수
- couple seat 선호
- 저렴한 row 선호 / 가격 상한
- aisle 쪽 선호/회피 (별도 속성이 생기면 가능)

### Notes

- 현재 시나리오의 좌석 conflict가 많은 이유는 seat stage가 실제로 가장 많은 visible attribute를 갖기 때문이다.
- 반대로 말하면, movie/theater/time stage의 attribute 노출을 늘리면 conflict를 더 분산시킬 수 있다.

---

## 6. Confirm Stage

### Data-level attributes

출처: `apps/frontend/src/spec/generators.ts`, `apps/frontend/src/renderer/stages/ConfirmStage.tsx`

- `movie.title`
- `theater.name`
- `date`
- `time`
- `seats[]`
- `totalPrice`
- booking complete 상태에서는 `bookingId`

### Currently user-visible in UI

- movie
- theater
- date & time
- selected seats
- total price
- booking complete 시 booking id

### Preference opportunities

- confirm stage는 보통 item filtering stage는 아니지만, 아래 같은 최종 검증 선호에는 쓸 수 있다.
- 총 가격 확인
- 좌석 수 확인
- 마지막 요약 검토

### Notes

- confirm stage는 새로운 대안을 만드는 stage라기보다, 이전 선택의 consistency를 점검하는 stage다.

---

## Attribute Expansion Ideas

현재 preference 다양성을 늘리려면 아래 attribute들을 우선적으로 더 노출하거나 더 자주 사용하면 좋다.

### Movie stage expansion

- `genre`
- `rating`
- `duration`
- `ageRating`
- `synopsis`
- `releaseDate`

가능한 새 preference 예시:

- 2시간 이하
- PG 또는 PG-13까지
- 가장 평점 높은 코미디
- 로맨틱 코미디는 피하기
- 최근 개봉작 우선
- 줄거리상 너무 무거운 작품 제외

### Theater stage expansion

- `distanceMiles`
- `location`
- `amenities`
- `screenCount`

가능한 새 preference 예시:

- 무료 주차 있는 극장
- family lounge 있는 극장
- recliner seating 있는 극장
- 도심 밖 극장 제외
- 너무 작은 극장 제외

### Showtime stage expansion

- `format`
- `displayEndTime`
- `availableSeats`
- `screenNumber`

가능한 새 preference 예시:

- IMAX only
- 7 PM 전 종료
- 좌석 여유 많은 상영 선호
- 더 붐비지 않는 시간대 선호
- 특정 screen 회피

### Seat stage expansion

- `type`
- `price`
- `row`
- `number`
- adjacency-derived features

가능한 새 preference 예시:

- 프리미엄이지만 너무 비싸지 않은 좌석
- 통로 쪽 선호
- 중간 블록 선호
- 마지막 두 줄 제외
- 3명 연속 좌석 필요

---

## Practical Takeaway

- 지금 시스템은 이미 다양한 attribute를 가지고 있다.
- 하지만 사용자에게 강하게 보이는 정보는 stage별로 제한적이다.
- 특히 `movie`, `theater`, `showtime` 단계는 data richness에 비해 UI richness가 낮다.
- 따라서 앞으로 더 다양한 preference를 쓰고 싶다면,
  - 기존 attribute를 문서/시나리오에 더 적극적으로 반영하거나
  - UI에서 해당 attribute를 더 직접적으로 노출하는 것이 가장 효과적이다.
