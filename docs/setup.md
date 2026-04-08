# Setup

## Required tools

- Java 17
- Gradle or Gradle Wrapper
- Node.js 22+
- npm 10+
- PostgreSQL 17+ or Docker Desktop

## Database

### Option 1. Native PostgreSQL

1. Ensure PostgreSQL is running on `localhost:5432`
2. Create database `texas_holdem`
3. Use the default credentials below or override them with environment variables
4. Keep `SPRING_PROFILES_ACTIVE=local` for the current development workflow

```bash
SPRING_PROFILES_ACTIVE=local
DB_HOST=localhost
DB_PORT=5432
DB_NAME=texas_holdem
DB_USERNAME=postgres
DB_PASSWORD=postgres
APP_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
APP_MAX_ACTIVE_PLAYERS=50
APP_WAITING_IDLE_TTL_SECONDS=1800
APP_IN_HAND_IDLE_TTL_SECONDS=7200
APP_TOURNAMENT_HARD_TTL_SECONDS=86400
VITE_API_BASE_URL=http://localhost:8080
VITE_TOURNAMENT_WS_URL=ws://localhost:8080/ws
```

### Railway deployment variables

Backend service:

```bash
SPRING_PROFILES_ACTIVE=local
APP_CORS_ALLOWED_ORIGINS=https://<frontend-domain>
DB_HOST=<railway-postgres-host>
DB_PORT=<railway-postgres-port>
DB_NAME=<railway-postgres-db>
DB_USERNAME=<railway-postgres-user>
DB_PASSWORD=<railway-postgres-password>
```

Frontend service:

```bash
VITE_API_BASE_URL=https://<backend-domain>
VITE_TOURNAMENT_WS_URL=wss://<backend-domain>/ws
```

### Option 2. Docker Compose

1. Open `infra/`
2. Run `docker compose -f compose.yml up -d`
3. PostgreSQL runs on `localhost:5432`
4. When the backend later moves into Docker too, switch to `SPRING_PROFILES_ACTIVE=docker` so the datasource can target the Compose service host such as `postgres`

## Backend

1. Open `backend/`
2. Run `./gradlew bootRun --args='--spring.profiles.active=local'` or `gradle bootRun --args='--spring.profiles.active=local'`
3. API health check: `GET http://localhost:8080/api/v1/status`
4. WebSocket endpoint: `ws://localhost:8080/ws`
5. The default datasource values already target the native PostgreSQL settings above
6. The CORS allowlist is controlled by `APP_CORS_ALLOWED_ORIGINS`

## Frontend

1. Open `frontend/`
2. Run `npm install`
3. Copy `frontend/.env.example` into a local `.env` file if you need non-default API or WebSocket addresses
4. Run `npm run dev -- --host 127.0.0.1`
5. Open `http://127.0.0.1:5173`
