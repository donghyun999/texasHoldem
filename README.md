# Texas Holdem

텍사스 홀덤 웹 애플리케이션용 싱글 테이블 토너먼트 MVP 프로젝트다.

## 현재 범위

- 게스트 기반 토너먼트 참가 및 ready 흐름
- 로비 진입은 이제 사용자가 직접 입력하는 룸 코드 대신 플레이어용 방 제목을 사용하고, 내부 토너먼트 코드는 서버가 생성한다
- 홈 로비는 공개방과 잠금방을 모두 표시하며, 잠금방은 선택 후 비밀번호 입력이 필요하다
- 잠금방 비밀번호는 서버에서 해시한 뒤 저장된다
- 오너 시작 및 초기 블라인드 배정
- 토너먼트 snapshot REST API 및 STOMP/WebSocket 브로드캐스트 흐름
- 공통 snapshot 계약에 연결된 토너먼트 테이블 UI
- `CHECK`, `CALL`, `RAISE`, `ALL_IN`, `FOLD`를 지원하는 in-hand action 엔진
- contribution 추적, 메인 팟/사이드 팟 계산, showdown 정산, 탈락 처리, hand 종료 상태 전이
- `HAND_RESULT`에서 5초 후 자동 다음 hand 진행 및 hand 경계 기준 blind level 상승

## 로비 흐름

- 방장은 닉네임과 테이블 제목을 입력하고 공개방 또는 잠금방을 만든다
- 내부 토너먼트 코드는 backend가 생성하며, 플레이어는 기본 로비 경로에서 룸 코드를 직접 입력하지 않는다
- 로비 목록에는 아직 좌석이 남아 있는 모든 `WAITING` 방이 표시되며, 잠금방도 포함된다
- 참가자는 로비 목록에서 방을 선택해 입장하며, 잠금방은 요청 전 비밀번호 입력 창이 열린다
- 대기방 오너에게는 직접 테이블 링크 대신 로비로 돌아와 참가하라는 안내 패널이 제공된다
- 테이블 라우트와 서버 API는 여전히 내부 토너먼트 코드를 안정 식별자로 사용한다

## 기술 스택

- Backend: Java 17, Spring Boot, REST, WebSocket/STOMP, JPA, PostgreSQL, Flyway
- Frontend: React 19, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Zustand
- Infra: Docker Compose

## 환경 전략

- MVP 개발 목표: backend를 로컬 네이티브 PostgreSQL에 연결해 개발한다
- 현재 기본 프로필: `SPRING_PROFILES_ACTIVE=local`
- 배포 목표: 최종 릴리스 단계에서 Docker 기반 서비스로 전환한다
- 구현 원칙: 로컬 PostgreSQL 개발 환경에서 Docker 배포 환경으로 옮겨갈 때 큰 코드/설정 재작업이 없도록 환경별 구성을 분리한다
- infra 또는 런타임 구성을 추가할 때는 다음 두 경우를 모두 만족하는 방향을 우선한다
  - 로컬 개발: 네이티브 PostgreSQL
  - 최종 배포: Docker 및 컨테이너 호스트 기반 연결 설정

## 프로젝트 구조

- `backend/`: Spring Boot API, tournament service, WebSocket handler, 테스트
- `frontend/`: tournament snapshot client, table UI, 로컬 fallback demo state
- `docs/`: setup 가이드, state flow, websocket event 계약, roadmap
- `infra/`: 로컬 PostgreSQL용 compose 파일

## 빠른 시작

### Database

로컬 네이티브 PostgreSQL 기본값:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=texas_holdem
DB_USERNAME=postgres
DB_PASSWORD=postgres
```

`infra/` 기준 Docker Compose 대안:

```bash
docker compose -f compose.yml up -d
```

런타임 설정 기본값:

```bash
SPRING_PROFILES_ACTIVE=local
APP_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
APP_MAX_ACTIVE_PLAYERS=50
APP_WAITING_IDLE_TTL_SECONDS=1800
APP_IN_HAND_IDLE_TTL_SECONDS=7200
APP_TOURNAMENT_HARD_TTL_SECONDS=86400
VITE_API_BASE_URL=http://localhost:8080
VITE_TOURNAMENT_WS_URL=ws://localhost:8080/ws
```

Railway 배포 메모:

```bash
# backend service
APP_CORS_ALLOWED_ORIGINS=https://<frontend-domain>
APP_GUEST_TOKEN_SECRET=<stable-random-secret>
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USERNAME=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}

# frontend service
VITE_API_BASE_URL=https://<backend-domain>
VITE_TOURNAMENT_WS_URL=wss://<backend-domain>/ws
```

- deployed guest token signing??`APP_GUEST_TOKEN_SECRET`媛 諛고룷 媛꾧꺽?먯꽌??怨좎젙???덉뼱???⑸땲??

- Railway config-as-code 파일은 `/backend/railway.json`, `/frontend/railway.json`을 사용한다
- Railway backend 서비스는 MVP 기준으로 replica 1개를 유지하고 sleep은 비활성화한다
- 현재 워크플로우는 `local` 프로필로 로컬 PostgreSQL에 연결해 앱을 실행하는 방식이다
- 최종 배포 시에는 backend를 `SPRING_PROFILES_ACTIVE=docker`로 전환하고, 동일한 변수들을 컨테이너 호스트 기준으로 연결한다

### Backend

`backend/`에서 실행:

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

- HTTP: `http://localhost:8080`
- Health: `GET /api/v1/status`
- WebSocket: `ws://localhost:8080/ws`

### Frontend

`frontend/`에서 실행:

```bash
npm install
npm run dev -- --host 127.0.0.1
```

- App: `http://127.0.0.1:5173`

## 검증

`backend/`에서 실행:

```bash
./gradlew test
```

`frontend/`에서 실행:

```bash
npm run build
```

로컬 좌석 검증:

```bash
node scripts/local-seat-flow-verify.cjs
```

기본값은 `http://127.0.0.1:5173`, `http://127.0.0.1:8080` 기준이며, 2인/6인/9인 시나리오를 검증한 뒤 모바일/데스크톱 스크린샷과 요약 JSON을 `test-results/local-seat-flow-verify/`에 남긴다.

좌석 수 range 검증 예시:

```bash
PLAYER_COUNTS=2-3 node scripts/local-seat-flow-verify.cjs
PLAYER_COUNTS=2..9 node scripts/local-seat-flow-verify.cjs
```

배포 검증용 Railway smoke script:

- `scripts/railway-seat-smoke.cjs`는 현재 Railway frontend/backend URL 기준 좌석 smoke wrapper다
- `scripts/railway-seat-continuous.cjs`는 좌석 smoke를 반복 실행하는 wrapper다. Railway 사용량을 소비할 수 있으므로 수동 실행만 허용한다. 시작하려면 `ALLOW_CONTINUOUS_RAILWAY_TESTS=true`가 필요하고, 무한 모드에는 `ALLOW_INFINITE_CONTINUOUS_RAILWAY_TESTS=true`가 추가로 필요하다
- `PLAYER_COUNT`는 단일 값뿐 아니라 `2..9`, `2-9`, `2~9` 같은 range 입력을 지원한다
- 현재 Railway wrapper는 guest token bootstrap과 현재 `data-testid` selector를 사용한다
- 최신 range 검증: `PLAYER_COUNT=2..9 node scripts/railway-seat-smoke.cjs` 통과
- 최신 결과 폴더: `test-results/railway-seat-smoke/railway-seat-smoke-20260421-070010336Z`
- 기존 `scripts/railway-six-player-smoke.cjs`, `scripts/railway-six-player-continuous.cjs`, `scripts/railway-six-player-live-continuous.cjs`는 6인 회귀/호환 맥락에서 계속 유지한다
- 이 스크립트들은 현재 create/join/table UI 라벨, local storage key, tournament snapshot API에 의도적으로 결합되어 있다. 흐름이 바뀌면 black-box 테스트로 취급하지 말고 함께 갱신한다
- Playwright 해상도는 환경 기반이며, 가능하면 일반 로컬 설치를 우선 사용한다. 필요하면 기존 `test-results/playwright-work` 설치를 fallback으로 사용할 수 있다

## 주요 문서

- `docs/setup.md`
- `docs/guest-token-session-transition.md`
- `docs/multi-agent-cli-operations.md`
- `docs/agent-roles.md`
- `docs/worktree-and-session-setup.md`
- `docs/railway.md`
- `docs/state-flow.md`
- `docs/websocket-events.md`
- `docs/project-flowchart.md`
- `docs/roadmap.md`

## 다음 작업

- 잠금방 affordance 및 생성 후 공유 가이드 중심의 로비 UX 다듬기
- reconnect 및 persistence 보강
- hand-result 이벤트를 더 풍부하게 만들어 클라이언트 animation/replay 여지 확보
- 최종 showdown/result UX 다듬기 및 reconnect edge case 재검토
- 로컬 PostgreSQL MVP 워크플로우를 유지하면서 Docker 배포 전환 경로를 계속 정리하기
