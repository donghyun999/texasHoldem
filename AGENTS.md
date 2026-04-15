# AGENTS.md

## 프로젝트 컨텍스트

- 프로젝트: 텍사스 홀덤 싱글 테이블 토너먼트 MVP
- 현재 단계: MVP 개발
- MVP 개발 중 데이터베이스 원칙: 개발 환경에서는 로컬 네이티브 PostgreSQL을 사용한다
- 최종 배포 원칙: 최종 릴리스 단계에서는 Docker 기반 런타임으로 전환한다

## 환경 규칙

- 기본 개발 가정: backend는 `SPRING_PROFILES_ACTIVE=local`로 실행한다
- 로컬 개발은 `localhost:5432`의 네이티브 PostgreSQL 기준으로 계속 동작해야 한다
- 나중의 Docker 전환을 어렵게 만들 정도로 로컬 실행만을 기준으로 최적화하지 않는다
- 호스트, 포트, 자격 증명은 하드코딩보다 환경 변수 기반 구성을 우선한다
- backend, frontend, infra 변경은 이후 Docker 전환과 호환되도록 유지한다

## 향후 에이전트를 위한 작업 가이드

- 런타임 설정을 바꿀 때는 현재의 로컬 PostgreSQL 개발 흐름을 유지한다
- 새로운 서비스, 환경 변수, 시작 절차를 추가할 때는 이후 Docker에서 어떻게 매핑될지도 함께 고려한다
- 임시 조건 분기보다 local / docker 프로필 분리를 우선한다
- MVP 단계라도 Docker 지원은 예정된 배포 목표로 간주한다
- `AGENTS.md`를 세션 로그나 append-only 변경 이력으로 사용하지 않는다
- `AGENTS.md`에는 반복적으로 유효한 규칙, 제약, 가이드만 남긴다
- 진행 상황은 별도 상태 문서에 요약 형태로 갱신하고, 오래된 로그를 계속 누적하지 않는다

## 현재 소스 오브 트루스

- `README.md`는 전체 워크플로우와 환경 전략을 문서화한다
- `docs/setup.md`는 로컬 설정 절차를 문서화한다
- `docs/status.md`는 현재 진행 상황, 완료된 작업, 다음 작업을 유지형 요약으로 관리한다
- `docs/multi-agent-cli-operations.md`는 CLI 멀티 에이전트 운영 규칙을 정의한다
- `docs/agent-roles.md`는 orchestrator, backend, frontend, verification 에이전트 책임을 정의한다
- `docs/worktree-and-session-setup.md`는 Windows CLI worktree 레이아웃과 세션 시작 절차를 정의한다
- `docs/agent-status/`는 세션 복귀를 위한 에이전트별 동적 상태 문서를 담는다
- `infra/`는 Docker Compose 및 배포 지향 인프라 파일의 위치다
