# Worktree 및 세션 설정

## 목적

이 저장소를 `Windows CLI`에서 하나의 오케스트레이터 세션과 여러 서브 에이전트 세션으로 안전하게 병렬 운영할 수 있도록 `git worktree`와 터미널 구성을 정리한다.

## 권장 디렉터리 구조

메인 체크아웃은 오케스트레이터 작업 공간으로 유지한다.

- `C:\Users\user\texasHoldem`

작성 에이전트용 `worktree`는 같은 상위 경로에 나란히 둔다.

- `C:\Users\user\texasHoldem-wt-backend`
- `C:\Users\user\texasHoldem-wt-frontend`
- `C:\Users\user\texasHoldem-wt-verify`

이렇게 두면 `Windows Terminal` 탭 이름과 경로 식별이 쉽다.

## 브랜치 규칙

하나의 기능 또는 버그 작업 기준:

- 메인 체크아웃
  - 보통 `main` 또는 현재 통합용 feature branch를 유지한다
- backend worktree
  - `agent/backend/<task-name>`
- frontend worktree
  - `agent/frontend/<task-name>`
- verification worktree
  - verification이 스크립트나 harness를 수정해야 할 때만 `agent/verify/<task-name>`

verification이 read-only라면 별도 `worktree` 없이 메인 체크아웃에서 실행해도 된다.

## 1회 설정

메인 체크아웃에서 실행:

```powershell
cd C:\Users\user\texasHoldem
git worktree add ..\texasHoldem-wt-backend -b agent/backend/<task-name> HEAD
git worktree add ..\texasHoldem-wt-frontend -b agent/frontend/<task-name> HEAD
git worktree add ..\texasHoldem-wt-verify -b agent/verify/<task-name> HEAD
```

`<task-name>`은 `waiting-stack-labels`, `reconnect-fix`처럼 짧은 slug를 사용한다.

## 일일 시작 절차

### Terminal 1: orchestrator

```powershell
cd C:\Users\user\texasHoldem
codex
```

역할:

- 작업 분해
- 소유권 배정
- 결과 검토
- 통합, 커밋, push
- 세션 동안 생성한 서브 에이전트 생명주기 관리

### Terminal 2: backend agent

```powershell
cd C:\Users\user\texasHoldem-wt-backend
codex
```

역할:

- backend 코드와 backend 테스트만 담당

### Terminal 3: frontend agent

```powershell
cd C:\Users\user\texasHoldem-wt-frontend
codex
```

역할:

- frontend 코드와 UI 동작만 담당

### Terminal 4: verification agent

```powershell
cd C:\Users\user\texasHoldem-wt-verify
codex
```

역할:

- 테스트, build 검증, smoke validation 담당

## 세션 첫 메시지 템플릿

### Backend 세션

```text
You are backend-agent for texasHoldem.
Read AGENTS.md, docs/multi-agent-cli-operations.md, and docs/agent-roles.md first.
Your write scope is backend only.
Do not edit frontend files.
Wait for a bounded backend task from main-orchestrator.
```

### Frontend 세션

```text
You are frontend-agent for texasHoldem.
Read AGENTS.md, docs/multi-agent-cli-operations.md, and docs/agent-roles.md first.
Your write scope is frontend only.
Do not edit backend files.
Wait for a bounded frontend task from main-orchestrator.
```

### Verification 세션

```text
You are verification-agent for texasHoldem.
Read AGENTS.md, docs/multi-agent-cli-operations.md, and docs/agent-roles.md first.
Stay read-only unless explicitly told otherwise.
Focus on tests, builds, smoke checks, and regression reporting.
Wait for a bounded verification task from main-orchestrator.
```

## 작업 할당 템플릿

오케스트레이터가 각 에이전트에게 작업을 넘길 때는 다음 형식을 유지한다.

```text
Task:
Owned scope:
Files allowed to edit:
Files explicitly out of scope:
Validation to run:
Return format:
```

예시:

```text
Task: Hide waiting-room stack labels without changing in-hand seat layout.
Owned scope: frontend table UI only.
Files allowed to edit: frontend/src/widgets/tournament/ui/TournamentTable.tsx, frontend/src/features/player/ui/PlayerSeat.tsx
Files explicitly out of scope: backend/**, frontend/src/pages/TablePage.tsx, frontend/src/entities/tournament/model/use-tournament-realtime-snapshot.ts
Validation to run: npm run build
Return format: files changed, behavior summary, validation result, risks
```

## 통합 절차

1. 오케스트레이터가 범위가 분리된 작업을 배정한다
2. backend와 frontend는 파일 소유권이 겹치지 않을 때만 병렬 작업한다
3. verification은 병렬로 검증을 수행한다
4. 각 에이전트가 짧은 handoff를 반환한다
5. 오케스트레이터가 각 `worktree`의 diff를 검토한다
6. 오케스트레이터가 메인 체크아웃에 merge 또는 cherry-pick 한다
7. 오케스트레이터가 최종 검증 후 commit, push를 수행한다

## 세션 중 에이전트 운영 방식

- `backend-agent`, `frontend-agent`, `verification-agent`는 오케스트레이터 세션 동안 재사용한다.
- 같은 역할의 새 작업은 새 에이전트를 만들지 말고 기존 에이전트에 이어서 전달한다.
- 역할별 활성 에이전트는 세션당 1개를 기본값으로 둔다.
- 컨텍스트 오염이나 역할 전환 때문에 교체가 필요할 때만 새 에이전트를 만들고, 기존 것은 종료한다.

## 세션 종료 시 에이전트 정리

세션을 마치기 전에 오케스트레이터는 다음을 수행한다.

1. 각 서브 에이전트의 handoff를 수집한다.
2. `docs/agent-status/orchestrator.md`와 관련 상태 문서를 갱신한다.
3. 현재 세션에서 사용한 `backend-agent`, `frontend-agent`, `verification-agent`를 명시적으로 종료한다.
4. 그 뒤에 필요하면 `worktree`를 정리한다.

상태 문서를 갱신할 때는 실제로 없는 `worktree`를 경로처럼 적지 않는다.
- 생성 전이면 `worktree 상태: not-created`
- 생성 후 존재하면 `worktree 상태: exists`

즉, `worktree` 정리와 서브 에이전트 종료는 별개다.
- 서브 에이전트는 세션 종료 시 닫는다.
- `worktree`는 작업이 완전히 통합된 뒤 제거한다.

## 통합 방법

권장 방식:

- 오케스트레이터 체크아웃에서 agent branch를 merge 또는 cherry-pick 한다

예시:

```powershell
cd C:\Users\user\texasHoldem
git cherry-pick <backend-commit>
git cherry-pick <frontend-commit>
```

대안:

- 검토 후 agent branch를 통합 브랜치에 merge 한다

피해야 할 방식:

- 작성 에이전트가 아직 작업 중인데 메인 체크아웃에서 직접 수정하는 것
- 같은 hotspot 파일을 건드린 두 작성 브랜치를 무리하게 동시에 rebase 하는 것

## 정리 절차

작업이 통합된 뒤에는 다음처럼 정리한다.

```powershell
cd C:\Users\user\texasHoldem
git worktree remove ..\texasHoldem-wt-backend
git worktree remove ..\texasHoldem-wt-frontend
git worktree remove ..\texasHoldem-wt-verify
git branch -D agent/backend/<task-name>
git branch -D agent/frontend/<task-name>
git branch -D agent/verify/<task-name>
```

verification branch를 만들지 않았다면 마지막 줄은 생략한다.

## 이 저장소 전용 규칙

- 작업이 `TournamentService.java`를 중심으로 돌면 backend 작성자는 한 명만 둔다
- 작업이 `TablePage.tsx`, `use-tournament-realtime-snapshot.ts`, `TournamentTable.tsx`를 건드리면 frontend 작성자는 한 명만 둔다
- `test-results/` 아래 파일은 커밋하지 않는다
- 작업이 명시적으로 환경 설정을 바꾸는 것이 아니라면 local PostgreSQL 개발 가정을 유지한다
