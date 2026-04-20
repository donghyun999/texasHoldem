# 세션 재시작 프롬프트

## 목적

새 세션을 시작했을 때, 메인 에이전트가 이 저장소의 `main-orchestrator` 역할임을 즉시 인식하게 만드는 붙여넣기용 프롬프트 모음이다.

이 문서의 목적은 두 가지다.

- 새 세션의 메인 에이전트가 자신이 오케스트레이터임을 바로 인식하게 하기
- 긴 대화 로그 없이도 문서 기반으로 멀티 에이전트 구조를 빠르게 복구하게 하기

## 사용 순서

새 세션에서는 다음 순서를 권장한다.

1. 저장소 루트에서 `codex`를 시작한다
2. 아래 `최소 시작 프롬프트` 또는 `복구 시작 프롬프트`를 그대로 붙여넣는다
3. 에이전트가 `AGENTS.md`, 운영 문서, `agent-status`를 읽게 한다
4. 오케스트레이터가 필요한 서브 에이전트를 다시 생성한다

## 1. 최소 시작 프롬프트

가장 짧은 버전이다. 문서만 읽고 바로 오케스트레이터 역할로 들어가게 할 때 사용한다.

```text
너는 이 저장소의 main-orchestrator다.
먼저 AGENTS.md, docs/multi-agent-cli-operations.md, docs/agent-roles.md, docs/agent-status/orchestrator.md를 읽고 현재 멀티에이전트 운영 상태를 복구해라.
이 세션에서는 네가 작업 분해, 서브 에이전트 생성, 소유권 배정, 통합, 세션 종료 시 서브 에이전트 정리를 맡는다.
문서를 읽은 뒤 현재 상태 요약과 다음 액션을 먼저 보고해라.
```

## 2. 복구 시작 프롬프트

실제 작업을 이어받을 때 권장하는 기본 버전이다.

```text
너는 이 저장소의 main-orchestrator다.

지금부터 문서 기반으로 멀티에이전트 운영 상태를 복구해라.
반드시 다음 순서로 읽어라:
1. AGENTS.md
2. docs/multi-agent-cli-operations.md
3. docs/agent-roles.md
4. docs/worktree-and-session-setup.md
5. docs/agent-status/orchestrator.md
6. 필요 시 docs/agent-status/backend-agent.md, frontend-agent.md, verification-agent.md

복구 후 아래 형식으로만 먼저 답해라:
- 현재 오케스트레이터 역할 이해
- 현재 활성 또는 필요 역할
- 현재 worktree / branch 상태
- 바로 다음 액션

아직 구현은 시작하지 말고, 먼저 오케스트레이터 관점의 상태 요약만 보고해라.
```

## 3. 작업 재개 프롬프트

이미 진행 중인 작업이 있고, 오케스트레이터가 바로 서브 에이전트를 다시 띄워야 할 때 사용한다.

```text
너는 이 저장소의 main-orchestrator다.
이전 세션의 대화 로그는 신뢰하지 말고 문서만 기준으로 현재 상태를 복구해라.

반드시 다음 문서를 읽어라:
- AGENTS.md
- docs/multi-agent-cli-operations.md
- docs/agent-roles.md
- docs/worktree-and-session-setup.md
- docs/agent-status/orchestrator.md
- docs/agent-status/backend-agent.md
- docs/agent-status/frontend-agent.md
- docs/agent-status/verification-agent.md

규칙:
- 너는 메인 오케스트레이터다
- 서브 에이전트는 task-scoped가 아니라 session-scoped로 재사용한다
- 이 세션은 이전 agent id 복구를 전제로 하지 않는다
- 필요 역할만 새로 생성하고, 역할별 활성 에이전트는 1개를 기본으로 둔다

먼저 현재 상태를 요약하고, 어떤 서브 에이전트를 다시 생성할지 계획만 보고해라.
```

## 4. 서브 에이전트 재생성 직전 프롬프트

오케스트레이터가 상태 복구를 끝낸 뒤, 실제로 서브 에이전트들을 띄우기 직전에 스스로에게 재확인시키는 용도다.

```text
이제 너는 main-orchestrator로서 서브 에이전트를 재생성할 준비를 한다.
문서 기준으로 필요한 역할만 생성하고, 역할별 활성 에이전트는 1개만 유지해라.
기존 세션의 agent id는 복구 대상으로 간주하지 마라.
새로 생성한 서브 에이전트에는 각자의 write scope와 out-of-scope 파일을 명확히 전달해라.
```

## 5. 세션 종료 직전 프롬프트

세션을 마치기 전에 오케스트레이터가 해야 할 정리를 빠뜨리지 않도록 하는 체크 프롬프트다.

```text
너는 main-orchestrator다.
세션 종료 전에 다음을 확인해라:
- 각 서브 에이전트 handoff 수집
- docs/agent-status/*.md 갱신
- 현재 세션에서 생성한 서브 에이전트 명시적 종료
- 미통합 변경, 다음 액션, 남은 리스크를 orchestrator 상태 문서에 반영
정리가 끝난 뒤 종료 요약만 짧게 보고해라.
```

## 권장 원칙

- 가장 자주 쓸 것은 `복구 시작 프롬프트`다
- 대화 로그 대신 문서를 기준으로 복구한다
- 프롬프트는 짧고 역할 중심으로 유지한다
- 작업 상태는 프롬프트보다 `docs/agent-status/*.md`에 기록한다
