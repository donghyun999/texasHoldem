# agent-status 사용 규칙

## 목적

`agent-status` 문서는 세션이 끊기거나 새 세션을 열었을 때, 최소 토큰으로 현재 작업 위치를 복구하기 위한 동적 상태 문서다.

이 디렉터리의 문서는 정적 운영 규칙 문서와 다르다.

- 정적 문서
  - `AGENTS.md`
  - `docs/multi-agent-cli-operations.md`
  - `docs/agent-roles.md`
  - `docs/worktree-and-session-setup.md`
- 동적 문서
  - `docs/agent-status/*.md`

## 파일 구성

각 에이전트별로 문서 하나씩 유지한다.

- `orchestrator.md`
- `backend-agent.md`
- `frontend-agent.md`
- `verification-agent.md`

즉, 메인 에이전트 1개와 서브 에이전트 3개 기준으로 총 4개가 필요하다.

## 작성 원칙

- 짧게 유지한다
- 세션 복구에 필요한 정보만 남긴다
- 오래된 내용은 덧붙이지 말고 교체한다
- 작업 로그처럼 길게 누적하지 않는다
- 코드/명령/경로/브랜치명은 영어 그대로 유지한다

## 각 문서에 반드시 포함할 항목

- 현재 작업
- 현재 브랜치
- 현재 worktree 경로
- 현재 소유 범위
- 지금 수정 가능한 파일
- 지금 수정하면 안 되는 파일
- 마지막 결정
- 다음 액션 1~3개
- 막힌 점 또는 확인 필요 사항
- 세션 재개 시 먼저 볼 파일

## 세션 복귀 절차

새 세션을 시작할 때는 다음 순서로 읽는다.

1. `AGENTS.md`
2. `docs/multi-agent-cli-operations.md`
3. `docs/agent-roles.md`
4. 자신의 `docs/agent-status/<agent>.md`

가능하면 이 4개만 읽고 현재 작업을 복구할 수 있어야 한다.
