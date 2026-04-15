# 멀티 에이전트 CLI 운영 규칙

## 목적

이 저장소를 하나의 메인 오케스트레이터와 소수의 도메인별 서브 에이전트로 운영하되, 수정 충돌과 책임 불명확성을 피하는 것이 목적이다.

`Windows CLI`와 `git worktree`를 실제로 어떻게 여는지는 `docs/worktree-and-session-setup.md`를 참고한다.

## 기본 팀 구성

- `main-orchestrator`
  - 작업을 backend, frontend, verification 트랙으로 나눈다
  - 작업 배정, 순서 조정, 충돌 제어, 통합, 최종 검토를 맡는다
- `backend-agent`
  - backend 구현과 backend 테스트를 담당한다
- `frontend-agent`
  - frontend 구현과 UI 동작을 담당한다
- `verification-agent`
  - 테스트 실행, 스모크 검증, 회귀 확인, 산출물 점검을 담당한다

쓰기 범위가 명확히 분리될 때만 더 많은 에이전트를 추가한다.

## 소유권 원칙

- 한 시점에 하나의 쓰기 범위는 하나의 에이전트만 가진다.
- 같은 파일을 둘 이상의 작성 에이전트에게 동시에 배정하지 않는다.
- verification 에이전트는 오케스트레이터가 명시적으로 할당하지 않는 한 read-only로 유지한다.
- 작업 도중 소유권 재조정은 오케스트레이터만 할 수 있다.

## 권장 쓰기 범위

- `backend-agent`
  - `backend/src/main/java/**`
  - `backend/src/test/java/**`
  - backend 런타임/설정 변경이 필요할 때만 `backend/src/main/resources/**`
- `frontend-agent`
  - `frontend/src/**`
  - `frontend/index.html`
  - frontend 의존성이나 스크립트 변경이 필요할 때만 `frontend/package.json`
- `verification-agent`
  - 기본은 read-only
  - 명시적으로 할당된 경우에만 `scripts/**` 또는 테스트 harness 파일 수정

## 충돌 위험이 큰 파일

아래 파일들은 충돌 가능성이 높으므로 한 작업 동안 단일 에이전트가 전담한다.

- `backend/src/main/java/com/texasholdem/tournament/application/TournamentService.java`
- `backend/src/main/java/com/texasholdem/tournament/application/TournamentHandEngine.java`
- `frontend/src/pages/TablePage.tsx`
- `frontend/src/entities/tournament/model/use-tournament-realtime-snapshot.ts`
- `frontend/src/widgets/tournament/ui/TournamentTable.tsx`

## Worktree 전략

병렬 구현 시 권장 방식은 다음과 같다.

1. 메인 체크아웃은 오케스트레이터가 유지한다.
2. 작성 에이전트마다 별도의 `git worktree`를 만든다.
3. 하나의 기능 작업 동안 같은 기준 브랜치에서 분기한다.
4. 각 에이전트가 맡은 작업을 끝낸 뒤 오케스트레이터가 통합한다.

`worktree`를 쓰지 않는다면 작성 에이전트는 한 번에 하나만 허용한다.

## 작업 분할 규칙

- 먼저 도메인 경계로 나눈다: backend vs frontend vs verification
- 그다음 파일 소유권으로 나눈다
- 여러 에이전트가 같은 hotspot 파일을 건드려야 한다면 분할하지 않는다
- 가능하면 backend 1개와 frontend 1개를 병렬로 돌리고, verification은 read-only로 같이 돌린다

## 세션 시작 절차

새 에이전트 세션은 작업 시작 전에 반드시 다음을 수행한다.

1. `AGENTS.md`를 읽는다
2. 이 문서를 읽는다
3. `docs/agent-roles.md`를 읽는다
4. 자신이 맡은 범위만 먼저 확인한다
5. 현재 브랜치와 `worktree` 위치를 확인한다
6. 수정하면 안 되는 범위를 명확히 확인한다

## 인수인계 규칙

각 서브 에이전트의 handoff에는 다음이 포함되어야 한다.

- 맡은 범위
- 변경했거나 확인한 파일
- 내린 결정
- 리스크 또는 열린 질문
- 수행한 검증
- 다음 에이전트가 덮어쓰면 안 되는 내용

## 검증 규칙

- backend 변경: 가능하면 최소한 관련 backend 테스트를 수행한다
- frontend 변경: 가능하면 최소한 관련 build 또는 집중 UI 검증을 수행한다
- verification 작업: 산출물은 ignore된 출력 경로 아래에만 남긴다
- `test-results/` 아래 생성된 파일은 커밋하지 않는다

## 에이전트를 더 늘려도 되는 경우

다음 조건을 모두 만족할 때만 에이전트를 추가한다.

- 작업이 독립된 범위로 나뉜다
- 오케스트레이터가 파일 소유권을 명확히 정의할 수 있다
- 병렬 작업 이득이 통합 비용보다 크다
- hotspot 파일이 겹치지 않는다

## 단일 에이전트로 가야 하는 경우

다음 상황에서는 한 명의 구현 에이전트로 진행한다.

- 작업 중심이 `TournamentService.java`일 때
- backend 계약과 frontend 렌더링을 동시에 밀접하게 바꿔야 할 때
- 버그 위치가 아직 좁혀지지 않았을 때
- 변경 범위가 작아서 협업 비용이 더 클 때
