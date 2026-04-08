# Texas Holdem

Single-table tournament MVP for a Texas Holdem web application.

## Current scope

- Guest-based tournament join and ready flow
- Owner start and initial blind assignment
- Tournament snapshot REST API and STOMP/WebSocket broadcast flow
- Tournament table UI bound to the shared snapshot contract
- In-hand action engine for `CHECK`, `CALL`, `RAISE`, `ALL_IN`, and `FOLD`
- Contribution tracking, main pot and side pot calculation, showdown settlement, bust-out handling, and hand-end state transitions
- Automatic next-hand advance from `HAND_RESULT` after 5 seconds with blind-level progression on hand boundaries

## Stack

- Backend: Java 17, Spring Boot, REST, WebSocket/STOMP, JPA, PostgreSQL, Flyway
- Frontend: React 19, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Zustand
- Infra: Docker Compose

## Environment strategy

- MVP development target: run the backend against a local native PostgreSQL instance
- Current default profile: `SPRING_PROFILES_ACTIVE=local`
- Deployment target: convert the runtime to Docker-based services in the final release stage
- Implementation guideline: keep environment-specific configuration separated so the project can move from local PostgreSQL to Docker without large code or config rewrites
- When adding infra or runtime configuration, prefer a structure that works for both:
  - local development with native PostgreSQL
  - final deployment with Docker and container-host based connection settings

## Project structure

- `backend/`: Spring Boot API, tournament service, WebSocket handlers, tests
- `frontend/`: tournament snapshot client, table UI, local fallback demo state
- `docs/`: setup guide, state flow, websocket event contract, roadmap
- `infra/`: local PostgreSQL compose file

## Quick start

### Database

Native PostgreSQL defaults:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=texas_holdem
DB_USERNAME=postgres
DB_PASSWORD=postgres
```

Docker Compose alternative from `infra/`:

```bash
docker compose -f compose.yml up -d
```

Runtime configuration defaults:

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

- Current workflow: run the app against a local PostgreSQL instance with the `local` profile
- Final deployment path: switch the backend to `SPRING_PROFILES_ACTIVE=docker` and point the same variables at container hosts when app services move into Compose

### Backend

From `backend/`:

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

- HTTP: `http://localhost:8080`
- Health: `GET /api/v1/status`
- WebSocket: `ws://localhost:8080/ws`

### Frontend

From `frontend/`:

```bash
npm install
npm run dev -- --host 127.0.0.1
```

- App: `http://127.0.0.1:5173`

## Verification

From `backend/`:

```bash
./gradlew test
```

From `frontend/`:

```bash
npm run build
```

## Key docs

- `docs/setup.md`
- `docs/state-flow.md`
- `docs/websocket-events.md`
- `docs/roadmap.md`

## Next work

- Reconnect and persistence hardening
- Richer hand-result events for client animation and replay
- Final showdown/result UX polish and reconnect edge-case review
- Preserve the local-PostgreSQL MVP workflow while preparing a clean Docker deployment path
