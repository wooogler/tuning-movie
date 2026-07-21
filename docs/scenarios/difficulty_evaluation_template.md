# Scenario Difficulty Evaluation Template

## 1. Basic Information

- Scenario name:
- Scenario ID:
- Evaluator:
- Date:
- Reference scenario for comparison:

---

## 2. Short Summary

- Core user goal:
- Main decision points:
- Expected successful path:
- Expected failure or backtrack point:

---

## 3. Difficulty Dimensions

각 항목은 `1`(매우 낮음) ~ `5`(매우 높음)으로 평가한다.

| Dimension | Score (1-5) | What to check |
|---|---:|---|
| Branching |  | 사용자가 실제로 비교해야 하는 유효 대안 수가 얼마나 많은가 |
| Constraint Interaction |  | 여러 preference를 조합해서 판단해야 하는가 |
| Late Failure |  | 실패가 후반 단계에서 드러나는가 |
| Backtracking |  | 이전 단계로 돌아가야 하는가 |
| Soft-vs-Hard Conflict |  | 선호(soft)를 포기하고 제약(hard)을 우선해야 하는가 |
| Final Answer Uniqueness |  | 최종 정답이 사실상 하나로 수렴하는가 |
| Surface-vs-Actual Choice Gap |  | 겉보기 선택지 수와 실제 유효 선택지 수의 차이가 큰가 |

---

## 4. Scoring Guide

### 4.1 Branching

- `1`: 거의 선택지가 없고 바로 정답이 보임
- `2`: 한 단계 정도에서만 간단한 대안 비교가 있음
- `3`: 두 단계 정도에서 실제 대안 비교가 필요함
- `4`: 여러 단계에서 후보를 계속 비교해야 함
- `5`: 대부분 단계에서 유효 대안이 많아 비교 부담이 큼

### 4.2 Constraint Interaction

- `1`: 조건 하나씩 따로 보면 충분함
- `2`: 두 조건 정도만 함께 보면 됨
- `3`: 2~3개 조건을 함께 판단해야 하는 구간이 있음
- `4`: 여러 단계에서 조건 조합 판단이 반복됨
- `5`: 거의 모든 선택이 다중 조건 조합으로만 가능함

### 4.3 Late Failure

- `1`: 초반 단계에서 바로 탈락 여부가 드러남
- `2`: 중간 전에 실패가 드러남
- `3`: 중간 단계에서 실패가 드러남
- `4`: 후반 단계(seat/confirm 직전 등)에서 실패가 드러남
- `5`: 거의 마지막 단계에서야 실패를 발견함

### 4.4 Backtracking

- `1`: 백트래킹 불필요
- `2`: 1회 정도의 짧은 백트래킹
- `3`: 1~2회 백트래킹이 필요함
- `4`: 여러 단계에 걸친 백트래킹이 필요함
- `5`: 반복적 백트래킹 없이는 정답 도달이 어려움

### 4.5 Soft-vs-Hard Conflict

- `1`: soft preference와 hard constraint가 거의 충돌하지 않음
- `2`: 약한 충돌이 있으나 쉽게 정리 가능함
- `3`: 사용자가 한 번쯤 선호를 포기해야 함
- `4`: 선호 포기가 주요 의사결정 포인트임
- `5`: 정답 경로 자체가 soft preference 포기를 중심으로 구성됨

### 4.6 Final Answer Uniqueness

- `1`: 정답이 여러 개라 어느 경로로 가도 무방함
- `2`: 정답 후보가 꽤 많음
- `3`: 일부 후보만 최종 정답이 됨
- `4`: 사실상 정답 후보가 매우 적음
- `5`: 최종 정답이 거의 유일함

### 4.7 Surface-vs-Actual Choice Gap

- `1`: 보이는 선택지와 실제 유효 선택지가 거의 같음
- `2`: 일부만 제거하면 됨
- `3`: 겉보기 선택지 중 절반 이상이 무효일 수 있음
- `4`: 표면상 선택지는 많지만 실제 후보는 매우 적음
- `5`: 대부분의 선택지가 함정이고 실제 경로는 극히 좁음

---

## 5. Scenario Structure Checklist

### 5.1 Alternatives by Stage

| Stage | Visible options | Actually viable options | Notes |
|---|---:|---:|---|
| Movie |  |  |  |
| Theater |  |  |  |
| Date |  |  |  |
| Showtime |  |  |  |
| Seat |  |  |  |

### 5.2 Preference Inventory

| Preference | Hard/Soft | Stage | Notes |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

### 5.3 Failure / Conflict Points

| ID | Conflict description | Stage discovered | Requires backtrack? | Notes |
|---|---|---|---|---|
| C1 |  |  |  |  |
| C2 |  |  |  |  |

---

## 6. Expected User Path

```text
Example:
Movie A
  -> Theater X
    -> Saturday
      -> 3:00 PM
        -> seat failure
          -> backtrack to theater
            -> Theater Y
              -> Saturday
                -> 3:00 PM
                  -> booking complete
```

### Path Notes

- First likely choice:
- Why that choice looks attractive:
- Where failure is discovered:
- What the natural recovery path is:
- Whether there are multiple acceptable final paths:

---

## 7. Difficulty Score Summary

| Dimension | Score |
|---|---:|
| Branching |  |
| Constraint Interaction |  |
| Late Failure |  |
| Backtracking |  |
| Soft-vs-Hard Conflict |  |
| Final Answer Uniqueness |  |
| Surface-vs-Actual Choice Gap |  |
| Total |  |

### Overall Judgment

- Difficulty band: `Low / Medium / High`
- Compared with reference scenario:
- Main reason for this rating:

---

## 8. Comparison With Reference Scenario

| Item | This scenario | Reference scenario | Same / Easier / Harder |
|---|---|---|---|
| Number of real alternative stages |  |  |  |
| Number of hard preferences |  |  |  |
| Number of soft preferences |  |  |  |
| Number of viable final candidates |  |  |  |
| Number of expected backtracks |  |  |  |
| Point of failure discovery |  |  |  |

### Comparison Notes

- What makes this scenario easier:
- What makes this scenario harder:
- Final decision on parity of difficulty:

---

## 9. Quick Evaluation Template

짧게만 기록할 때는 아래만 채워도 된다.

```md
- Scenario:
- Reference:
- Real alternative stages:
- Expected backtracks:
- Main conflict:
- Branching (1-5):
- Constraint Interaction (1-5):
- Late Failure (1-5):
- Backtracking (1-5):
- Soft-vs-Hard Conflict (1-5):
- Final Answer Uniqueness (1-5):
- Surface-vs-Actual Choice Gap (1-5):
- Overall difficulty:
- Notes:
```
