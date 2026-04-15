# 멀티 에이전트 CLI 운영 규칙

## 목적

이 저장소를 하나의 메인 오케스트레이터와 소수의 도메인별 서브 에이전트로 운영하되, 수정 충돌과 책임 불명확성을 피하는 것이 목적이다.

`Windows CLI`와 `git worktree`를 실제로 어떻게 여는지는 `docs/worktree-and-session-setup.md`를 참고한다.

## 기본 팀 구성

- `main-orchestrator`
  - 작업을 backend, frontend, verification 트랙으로 나눈다
  - 작업 배정, 순서 조정, 충돌 제어, 통합, 최종 검토를 맡는다
  - 직접 코드 구현을 하지 않고 역할 에이전트를 관리한다
- `backend-agent`
  - backend 구현과 backend 테스트를 담당한다
- `frontend-agent`
  - frontend 구현과 UI 동작을 담당한다
- `verification-agent`
  - 테스트 실행, 스모크 검증, 회귀 확인, 산출물 점검을 담당한다

쓰기 범위가 명확히 분리될 때만 더 많은 에이전트를 추가한다.

## 에이전트 생명주기 원칙

- 서브 에이전트는 기본적으로 `task-scoped`가 아니라 `orchestrator session-scoped`로 운영한다.
- 즉, 오케스트레이터 세션 하나가 살아 있는 동안 `backend-agent`, `frontend-agent`, `verification-agent`를 재사용한다.
- 한 시간 안에 여러 작업을 처리하더라도 역할이 같다면 같은 서브 에이전트에 작업을 계속 전달한다.
- 태스크마다 서브 에이전트를 새로 만들지 않는다.
- 오케스트레이터 세션이 끝날 때, 해당 세션에서 생성한 서브 에이전트도 함께 종료하는 것을 기본 규칙으로 둔다.
- 새 오케스트레이터 세션은 이전 세션의 agent id 복구를 전제하지 않는다.
- 새 세션이 시작되면 필요한 역할의 서브 에이전트를 다시 생성하고, 문서를 기반으로 상태를 복구한다.

## 오케스트레이터 제약 조건

- `main-orchestrator`는 기본적으로 코드 구현과 테스트 파일 수정을 직접 하지 않는다.
- backend 변경은 반드시 `backend-agent`가 소유한다.
- frontend 변경은 반드시 `frontend-agent`가 소유한다.
- 검증 실행과 검증 결과 정리는 반드시 `verification-agent`가 소유한다.
- 구현이나 검증이 필요한 작업에서 "메인이 직접 한 번에 처리"하는 방식은 금지한다.
- 예외는 `AGENTS.md`, `docs/**`, `docs/agent-status/**` 같은 운영 문서 갱신과 최종 통합 정리뿐이다.

## 생성 / 재사용 / 종료 규칙

- 생성
  - 세션 시작 시 필요한 역할만 생성한다.
  - 기본은 `backend-agent`, `frontend-agent`, `verification-agent` 3개다.
- 재사용
  - 같은 역할의 후속 작업은 기존 서브 에이전트에 `send_input`으로 이어서 전달한다.
  - 같은 세션 안에서 역할별 활성 에이전트는 1개를 기본으로 유지한다.
  - 새 task가 시작됐다는 이유만으로 같은 역할 에이전트를 새로 만들지 않는다.
- 종료
  - 작업이 모두 끝나면 오케스트레이터가 서브 에이전트를 명시적으로 종료한다.
  - 세션 종료 전에 닫는 것을 원칙으로 하며, 자동 정리에 기대지 않는다.
- 예외
  - 같은 세션 안에서 역할 에이전트 교체는 예외다. 기본은 재사용이다.
  - 컨텍스트 오염이 심해 현재 범위를 반복적으로 오해할 때만 교체를 검토한다.
  - 역할 경계 위반이 반복되거나, 잘못된 전제가 고착되어 후속 지시로도 바로잡기 어려울 때만 교체를 검토한다.
  - handoff 품질이 무너져 현재 상태, 변경 범위, 금지 범위를 신뢰하기 어려울 때만 교체를 검토한다.
  - 역할이 사실상 바뀌어 기존 맥락이 다음 작업의 방해가 될 때만 교체를 검토한다.
  - 단순히 새 task라서, 결과를 분리해서 받고 싶어서, 습관적으로, 또는 특별한 문제 없이 새로 시작하고 싶다는 이유만으로는 교체하지 않는다.
  - 교체 전에는 기존 에이전트를 종료하고, `agent-status`를 갱신하고, 교체 사유를 handoff에 남겨야 한다.

## 교체 비용 경고

- 역할 에이전트를 교체하면 새 에이전트가 `AGENTS.md`, 운영 문서, 상태 문서, 관련 파일을 다시 읽어야 한다.
- 즉, 교체는 상태 복구 비용 때문에 시간과 컨텍스트를 추가로 소모한다.
- 같은 역할 에이전트를 계속 쓰는 비용보다 새 에이전트가 상태를 다시 복구하는 비용이 더 작을 때만 교체한다.
- 오케스트레이터는 편의상 교체하지 말고, 계속 재사용하는 리스크가 더 큰지 먼저 판단한다.

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
- 구현이 필요한 순간에는 오케스트레이터가 아니라 해당 역할 서브 에이전트가 실제 수정 주체가 된다

## 세션 시작 절차

새 에이전트 세션은 작업 시작 전에 반드시 다음을 수행한다.

1. `AGENTS.md`를 읽는다
2. 이 문서를 읽는다
3. `docs/agent-roles.md`를 읽는다
4. 오케스트레이터 세션이면 필요한 역할 에이전트를 먼저 판단한다
5. 자신이 맡은 범위만 먼저 확인한다
6. 현재 브랜치와 `worktree` 위치를 확인한다
7. 수정하면 안 되는 범위를 명확히 확인한다

## 세션 종료 절차

오케스트레이터 세션을 끝내기 전에 다음을 수행한다.

1. 각 서브 에이전트의 마지막 handoff를 수집한다.
2. `docs/agent-status/*.md`를 최신 상태로 갱신한다.
3. 현재 세션에서 생성한 `backend-agent`, `frontend-agent`, `verification-agent`를 명시적으로 종료한다.
4. 남은 미통합 변경과 다음 액션을 `orchestrator.md`에 기록한다.

`agent-status` 갱신 시 최소한 아래 항목은 반드시 최신이어야 한다.

- 마지막 갱신 시각
- 상태: `idle` / `active` / `blocked` / `done`
- 현재 작업
- 현재 브랜치
- 현재 worktree 경로와 `exists` / `not-created` 상태
- 다음 액션 1~3개
- 다시 생성이 필요한 역할

새 세션은 종료된 이전 서브 에이전트에 의존하지 않고 다시 시작한다.

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

## 단일 구현 에이전트로 좁혀야 하는 경우

다음 상황에서는 오케스트레이터가 직접 구현하지 말고, 한 명의 역할 에이전트에게만 소유권을 몰아준다.

- 작업 중심이 `TournamentService.java`일 때
- backend 계약과 frontend 렌더링을 동시에 밀접하게 바꿔야 해서 우선 한쪽 구현부터 고정해야 할 때
- 버그 위치가 아직 좁혀지지 않아 구현 책임자를 하나로 줄여야 할 때
- 변경 범위가 작더라도 구현 주체는 오케스트레이터가 아니라 해당 역할 에이전트여야 할 때
