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
VITE_API_BASE_URL=http://localhost:8080
VITE_TOURNAMENT_WS_URL=ws://localhost:8080/ws
```

- Current workflow: run the app against a local PostgreSQL instance with the `local` profile
- Docker-ready path: switch the backend to `SPRING_PROFILES_ACTIVE=docker` and point the same variables at container hosts when app services move into Compose

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
- Production-grade deck/randomness and persistence-backed tournament recovery
