# Tutorial Scenario

## Chosen Legacy Scenario

튜토리얼 시나리오는 [`set1_task3.md`](./set1_task3.md)를 그대로 기반으로 잡는다.

선정 이유:

- 특정 영화, 날짜, 포맷, 좌석 조건이 분명해서 처음 보는 사람도 이해하기 쉽다.
- 실패 구조가 깔끔하다. 가장 가까운 극장에서 좌석 때문에 한 번 실패하고, 10마일 이내 대안 극장으로 이동하면 바로 해결된다.
- 영화 추천이나 다중 영화 비교가 없어서 튜토리얼 진행이 덜 복잡하다.
- 그래도 `movie -> theater -> date -> showtime -> seat` 전체 흐름과 backtrack을 모두 연습할 수 있다.

## Tutorial Scenario

Today is Wednesday, March 11, 2026. You would like to see a movie alone this weekend, Saturday March 14 or Sunday March 15, 2026. The booking site may also show Monday March 16 and Tuesday March 17, but those dates do not work for you.

1. You want to watch a sci-fi movie called Cosmic Laughs alone.
2. The movie must be this weekend, either Saturday March 14 or Sunday March 15.
3. You will be available except for evenings after 7 PM on both Saturday and Sunday.
4. You prefer a theater closest to you, but as long as it is within 10 miles, it is fine.
5. You want to watch it on a 3D screen. This is a must.
6. You do not like sitting on the side of the theater, especially for a 3D screen. It needs to be reasonably centered on the screen.

## Expected Path

1. Movie: choose `Cosmic Laughs`.
2. Theater attempt 1: choose `Skyline Multiplex`, the closest theater.
3. Date: choose `Sat, Mar 14, 2026` or `Sun, Mar 15, 2026`.
4. Showtime attempt 1: choose the only valid early 3D option, `3:00 PM`.
5. Seats attempt 1: fail because only side seats remain.
6. Theater attempt 2: switch to `Cedar Point Cinema`, which is still within 10 miles.
7. Showtime attempt 2: choose `3:00 PM` 3D again.
8. Seats attempt 2: choose a centered seat and complete booking.

## DB Mapping

- Tutorial scenario id: `scn_t1_solo_weekend_3d_tutorial`
- Seed dataset: `apps/backend/scenarios/data/scn_t1_solo_weekend_3d_tutorial.json`
- Template DB: `apps/backend/scenarios/db-templates/scn_t1_solo_weekend_3d_tutorial.db`
- Verification command: `npm run db:verify:scenario:t1`
