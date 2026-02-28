# Tuning Agent 통합 가이드 (tuning-agent-typescript + tuning-agent-v2)

이 문서는 `apps/tuning-agent-typescript`(기존)와 `apps/tuning-agent-v2`를 통합한 새 `tuning-agent`를 함께 만들기 위한 기준 문서다.
목표는 "기능 통합"보다 먼저 "구조를 완전히 이해"하는 것이다.

## 1) 현재 두 버전의 핵심 차이

공통점:
- 디렉토리 구조는 거의 동일하다 (`core`, `llm`, `runtime`, `monitor`, `policies`).
- 메인 루프 구조도 동일하다 (`index.ts` 중심으로 relay 이벤트 처리 -> planning -> execution).

차이점(실질):
- `v2`에만 `llm/llmExtractor.ts`가 있다.
  - 턴 단위로 사용자 선호(preferences) / 시스템 제약(constraints)을 추출한다.
- `v2`의 `core/memory.ts`는 `preferences`, `constraints` 배열을 보관한다.
- `v2`의 planner workflow에 `preferences`, `constraints`가 포함된다.
- `v2` monitor state에는 memory 배열 노출 필드가 있다.
- 기본 agent name/package name이 `tuning-agent-v2`로 변경되어 있다.

## 2) 런타임 전체 흐름 (파일 기준)

### A. 인입/상태관리
- `index.ts`의 `handleInbound`가 relay 메시지를 처리한다.
  - `snapshot.state` -> `fromSnapshot`으로 context 생성
  - `state.updated` -> `applyStateUpdated`로 context 갱신
  - `user.message` -> `applyUserMessage`로 user turn 반영

### B. 계획/실행
- `maybePlanAndExecute`에서 `planNextAction(context, memory)` 호출
- 계획 결과 action을 `executePlannedAction`으로 실행
- 결과를 monitor event/state로 기록

### C. memory 업데이트 (v2 확장)
- 실행 결과 이후 `extractPreferencesAndConstraints(...)` 호출
- `supersededPreferences` 제거 -> `newPreferences` 추가 -> `newConstraints` 추가
- monitor에 memory snapshot 반영

### D. planner 입력
- planner 입력은 크게 3가지다:
  - `history`: message history
  - `availableTools`: 현재 stage에서 가능한 tool 목록
  - `workflow`: stage 진행 규칙 + (v2에서는) preferences/constraints

## 3) 디렉토리 역할 요약

- `core/`
  - `memory.ts`: context/episodic(및 v2는 preference/constraint) 저장소
  - `perception.ts`: snapshot/state/user 메시지를 내부 context로 정규화
  - `planner.ts`: 규칙 + LLM 플래너 호출/검증 + fallback
  - `executor.ts`: planned action을 relay request로 실행
  - `uiModel.ts`: uiSpec에서 selected/visible/quantity 같은 구조화 정보 추출
  - `verifier.ts`: resync 필요 여부 판단

- `llm/`
  - `llmPlanner.ts`: planner용 LLM 호출(OpenAI/Gemini) + parse/trace
  - `llmResponses.ts`: 대화 응답 생성용 LLM 호출
  - `llmExtractor.ts` (`v2` only): 선호/제약 추출

- `runtime/`
  - `relayClient.ts`: ws 연결 + request/reply + timeout + inbound stream
  - `eventBus.ts`: subscribe/publish 유틸

- `monitor/`
  - `server.ts`: `/state`, `/events`(SSE) 노출

- `policies/`
  - `safetyPolicy.ts`: 위험 action 차단
  - `retryPolicy.ts`: 재시도 기준

## 4) 통합 에이전트 설계 방향 (제안)

새 폴더: `apps/tuning-agent`

핵심 원칙:
1. "기존 동작 호환"을 기본으로 유지한다.
2. `v2`의 memory/extractor 기능은 플래그 기반으로 온/오프 가능하게 만든다.
3. provider(OpenAI/Gemini)와 기능(Planner/Responder/Extractor) 경계를 명확히 나눈다.

권장 설계:
- `core/memory.ts`
  - `episodic` + `preferences` + `constraints` 기본 제공
  - 추출 기능 off일 때는 배열이 비어 있어도 planner가 안전히 동작

- `config/featureFlags.ts` (신규)
  - `enableExtraction`
  - `enableMemoryInPlanner`
  - `enableLlmResponses`

- `llm/`
  - planner/responses/extractor 인터페이스 통일
  - provider 선택 로직(OPENAI/GEMINI)을 공통 helper로 분리

- `monitor/server.ts`
  - 공통 상태 + memory snapshot 기본 제공

## 5) 함께 만드는 순서 (추천)

### Step 1. 구조 복제 + 이름 통합
- `apps/tuning-agent-v2`를 `apps/tuning-agent`로 복제
- package/script/agentName을 `tuning-agent`로 통일
- 빌드/실행 확인

완료 기준:
- `npm run build --workspace=apps/tuning-agent` 성공
- `npm run dev`로 relay 연결/기본 계획 실행 가능

### Step 2. Feature Flag 도입
- extraction, planner-memory 주입, responses를 플래그로 제어
- flag off 시 기존 타입스크립트 버전과 유사 동작 확인

완료 기준:
- flag 조합별 부팅/플랜/실행 오류 없음

### Step 3. LLM 레이어 정리
- planner/responses/extractor 공통 parse/error/trace helper 정리
- provider 전환 비용 줄이기

완료 기준:
- 중복 로직 감소, 동작 동일

### Step 4. 회귀 점검 체크리스트 작성
- stage 전환, tool validation, safety blocked, session reset, host waiting
- extraction on/off 비교

완료 기준:
- 수동 시나리오 체크리스트 통과

## 6) 코드 읽기 순서 (처음 보는 사람 기준)

1. `src/index.ts`
2. `src/core/planner.ts`
3. `src/core/executor.ts`
4. `src/runtime/relayClient.ts`
5. `src/core/perception.ts`
6. `src/core/uiModel.ts`
7. `src/core/memory.ts`
8. `src/llm/llmPlanner.ts`
9. `src/llm/llmResponses.ts`
10. `src/llm/llmExtractor.ts` (통합 시 포함)
11. `src/monitor/server.ts`

---

다음 액션:
- 이 문서를 기준으로 Step 1(새 `apps/tuning-agent` 생성)을 바로 시작한다.
