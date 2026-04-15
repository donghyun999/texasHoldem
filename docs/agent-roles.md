# 에이전트 역할 정의

## Main Orchestrator

### 책임

- 작업 분해, 순서 조정, 통합을 담당한다
- 쓰기 범위가 겹치지 않도록 관리한다
- 구현과 검증 작업을 역할별 서브 에이전트에 위임한다
- `main-orchestrator`는 코드 구현의 소유자가 아니다
- merge 전에 최종 diff와 검증 범위를 검토한다

### 금지 사항

- `main-orchestrator`가 `backend/**`, `frontend/**`, `scripts/**`, 테스트 파일을 직접 수정하지 않는다
- "작업이 작으니 메인에서 바로 수정한다"는 예외를 허용하지 않는다
- 구현이나 검증을 위해 단일 에이전트 모드로 되돌아가지 않는다
- 직접 수정이 필요한 예외는 운영 문서 정리, handoff 반영, 상태 문서 갱신 같은 오케스트레이션 작업으로 제한한다

### 먼저 볼 파일

- `AGENTS.md`
- `README.md`
- `docs/multi-agent-cli-operations.md`
- `docs/status.md`
- `docs/multi-agent-cli-operations.md`에 정의된 hotspot 파일

### 세션 체크리스트

1. 사용자 목표와 산출 형태를 확정한다
2. 이번 작업에 필요한 역할 `backend-agent`, `frontend-agent`, `verification-agent`를 결정한다
3. 소유 범위와 hotspot을 배정한다
4. 구현이나 검증이 필요하면 해당 역할 에이전트를 반드시 시작하거나 재사용한다
5. 각 에이전트의 handoff를 수집한다
6. 최종 diff와 검증 결과를 확인한 뒤 merge 또는 push를 진행한다

## Backend Agent

### 소유 범위

- `backend/src/main/java/**`
- `backend/src/test/java/**`
- 필요할 때만 `backend/src/main/resources/**`

### 주요 진입 파일

- `backend/src/main/java/com/texasholdem/tournament/application/TournamentService.java`
- `backend/src/main/java/com/texasholdem/tournament/application/TournamentHandEngine.java`
- `backend/src/main/java/com/texasholdem/tournament/presentation/TournamentController.java`
- `backend/src/main/java/com/texasholdem/websocket/TournamentMessageController.java`
- `backend/src/main/java/com/texasholdem/tournament/application/PersistentTournamentStateStore.java`

### 주로 맡을 작업

- tournament lifecycle 로직
- player connection, AFK 동작
- betting, hand progression, result settlement
- persistence와 snapshot 계약 변경
- backend 회귀 테스트

### 명시적으로 할당되지 않으면 건드리지 말 것

- frontend snapshot 타입과 UI 파일
- 다른 에이전트에게 이미 배정된 hotspot 파일

### 세션 체크리스트

1. `AGENTS.md`, `docs/multi-agent-cli-operations.md`, 이 문서를 읽는다
2. `TournamentService.java`와 관련 backend 영역을 먼저 확인한다
3. snapshot 또는 event 계약 영향이 있는지 확인한다
4. 변경 가능성이 큰 backend hotspot 파일을 적는다
5. 함께 수정되어야 할 backend 테스트를 확인한다
6. frontend 계약 영향이 있으면 수정 전에 오케스트레이터에 알린다

## Frontend Agent

### 소유 범위

- `frontend/src/**`
- `frontend/index.html`
- 필요할 때만 `frontend/package.json`

### 주요 진입 파일

- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/TablePage.tsx`
- `frontend/src/entities/tournament/model/use-tournament-realtime-snapshot.ts`
- `frontend/src/widgets/tournament/ui/TournamentTable.tsx`
- `frontend/src/features/table/ui/ActionPanel.tsx`

### 주로 맡을 작업

- lobby 흐름
- table 렌더링과 player seat 배치
- snapshot 기반 UI 갱신
- STOMP client 연동과 reconnect UX
- backend 계약에 맞춘 frontend 타입 정렬

### 명시적으로 할당되지 않으면 건드리지 말 것

- backend Java 및 backend 테스트
- verification 스크립트
- 다른 에이전트에게 이미 배정된 hotspot 파일

### 세션 체크리스트

1. `AGENTS.md`, `docs/multi-agent-cli-operations.md`, 이 문서를 읽는다
2. `TablePage.tsx`, realtime snapshot 흐름, 관련 UI 영역을 먼저 본다
3. snapshot 또는 event 타입 변경이 필요한지 확인한다
4. 변경 가능성이 큰 frontend hotspot 파일을 적는다
5. cache, routing, realtime side effect를 확인한다
6. backend 계약 의존성이 있으면 수정 전에 오케스트레이터에 알린다

## Verification Agent

### 소유 범위

- 기본은 read-only
- 명시적으로 배정된 경우에만 `scripts/**`
- 명시적으로 배정된 경우에만 테스트 harness 파일

### 주요 파일과 경로

- `backend/src/test/java/**`
- `scripts/**`
- `docs/railway-six-player-smoke.md`
- 로컬 ignore 산출물 경로인 `test-results/`

### 주로 맡을 작업

- backend 집중 테스트 실행
- frontend build 또는 smoke 검증
- 스크립트 기반 검증 흐름 실행/점검
- 실패 요약과 회귀 리스크 정리
- 생성 산출물이 ignore 상태인지 확인

### 명시적으로 할당되지 않으면 건드리지 말 것

- backend production 파일
- frontend production 파일
- 현재 구현 에이전트가 작업 중인 hotspot 파일

### 세션 체크리스트

1. `AGENTS.md`, `docs/multi-agent-cli-operations.md`, 이 문서를 읽는다
2. 검증 대상 기능 또는 버그를 확인한다
3. 가장 좁고 유효한 검증 명령 집합을 정한다
4. 산출물이 ignore된 출력 경로에만 생기는지 확인한다
5. 실패가 나면 파일 기준과 정확한 명령을 함께 기록한다
6. 최종적으로 pass/fail 요약과 남은 리스크를 전달한다
