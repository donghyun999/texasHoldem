# Texas Holdem

Single-table tournament MVP for a Texas Holdem web application.

## Current scope

- Guest-based tournament join and ready flow
- Lobby entry now uses player-facing room titles, with server-generated internal room codes
- Home lobby now lists both open and locked waiting rooms, with locked rooms requiring a password after selection
- Private-room passwords are hashed server-side before they are persisted
- Owner start and initial blind assignment
- Tournament snapshot REST API and STOMP/WebSocket broadcast flow
- Tournament table UI bound to the shared snapshot contract
- In-hand action engine for `CHECK`, `CALL`, `RAISE`, `ALL_IN`, and `FOLD`
- Contribution tracking, main pot and side pot calculation, showdown settlement, bust-out handling, and hand-end state transitions
- Automatic next-hand advance from `HAND_RESULT` after 5 seconds with blind-level progression on hand boundaries

## Lobby flow

- Hosts enter a nickname, choose a table title, and create either an open or locked waiting room
- The backend generates the internal tournament code; players do not type a room code on the primary lobby path
- The lobby list shows every joinable `WAITING` room that still has seats, including locked rooms
- Joining starts from the selected lobby entry; locked rooms open a password prompt before the join request is sent
- Waiting-room owners now get a share panel that tells invitees to return to the lobby, because direct table links are not the primary join path
- The table route and server APIs still use the internal tournament code as the stable identifier

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

Railway deployment notes:

```bash
# backend service
APP_CORS_ALLOWED_ORIGINS=https://<frontend-domain>
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USERNAME=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}

# frontend service
VITE_API_BASE_URL=https://<backend-domain>
VITE_TOURNAMENT_WS_URL=wss://<backend-domain>/ws
```

- Use `/backend/railway.json` and `/frontend/railway.json` as the Railway config-as-code files
- Keep the Railway backend service at one replica and leave service sleep disabled for this MVP
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

Deployment-targeted Railway smoke scripts:

- `scripts/railway-six-player-smoke.cjs` is a one-shot six-player deployed smoke harness for the current Railway frontend/backend URLs.
- `scripts/railway-six-player-continuous.cjs` repeats deployed smoke runs and should stay manual-only because it can consume Railway usage; it now refuses to start unless `ALLOW_CONTINUOUS_RAILWAY_TESTS=true` is set, and infinite mode additionally requires `ALLOW_INFINITE_CONTINUOUS_RAILWAY_TESTS=true`.
- These scripts are intentionally coupled to the current create/join/table UI labels, local storage key, and tournament snapshot API; when those flows change, update the scripts together instead of treating them as stable black-box tests.
- Playwright resolution is environment-driven: prefer a normal local install, but the scripts can also fall back to the existing `test-results/playwright-work` installation used in prior sessions.

## Key docs

- `docs/setup.md`
- `docs/railway.md`
- `docs/state-flow.md`
- `docs/websocket-events.md`
- `docs/project-flowchart.md`
- `docs/roadmap.md`

## Next work

- Lobby UX polish for locked-room affordances and post-create sharing guidance
- Reconnect and persistence hardening
- Richer hand-result events for client animation and replay
- Final showdown/result UX polish and reconnect edge-case review
- Preserve the local-PostgreSQL MVP workflow while preparing a clean Docker deployment path
