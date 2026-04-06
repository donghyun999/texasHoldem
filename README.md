# Texas Holdem

Single-table tournament MVP for a Texas Holdem web application.

## Current scope

- Guest-based tournament join and ready flow
- Owner start and initial blind assignment
- Tournament snapshot REST API and STOMP/WebSocket broadcast flow
- Tournament table UI bound to the shared snapshot contract
- In-hand action engine for `CHECK`, `CALL`, `RAISE`, `ALL_IN`, and `FOLD`
- Contribution tracking, main pot and side pot calculation, and hand-end state transitions

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

From `infra/`:

```bash
docker compose -f compose.yml up -d
```

### Backend

From `backend/`:

```bash
./gradlew bootRun
```

- HTTP: `http://localhost:8080`
- Health: `GET /api/v1/status`
- WebSocket: `ws://localhost:8080/ws`

### Frontend

From `frontend/`:

```bash
npm install
npm run dev
```

- App: `http://localhost:5173`

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

- Showdown winner evaluation and pot settlement
- Bust-out processing and tournament-finished transition
- Blind level progression across multiple hands
- Reconnect and persistence hardening
