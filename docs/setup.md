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

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=texas_holdem
DB_USERNAME=postgres
DB_PASSWORD=postgres
```

### Option 2. Docker Compose

1. Open `infra/`
2. Run `docker compose -f compose.yml up -d`
3. PostgreSQL runs on `localhost:5432`

## Backend

1. Open `backend/`
2. Run `./gradlew bootRun --args='--spring.profiles.active=local'` or `gradle bootRun --args='--spring.profiles.active=local'`
3. API health check: `GET http://localhost:8080/api/v1/status`
4. WebSocket endpoint: `ws://localhost:8080/ws`
5. The default datasource values already target the native PostgreSQL settings above

## Frontend

1. Open `frontend/`
2. Run `npm install`
3. Run `npm run dev -- --host 127.0.0.1`
4. Open `http://127.0.0.1:5173`
