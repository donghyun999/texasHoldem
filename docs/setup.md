# Setup

## Required tools

- Java 17
- Gradle or Gradle Wrapper
- Node.js 22+
- npm 10+
- Docker Desktop

## Backend

1. Open `backend/`
2. Run `./gradlew bootRun` or `gradle bootRun`
3. API health check: `GET http://localhost:8080/api/v1/status`
4. WebSocket endpoint: `ws://localhost:8080/ws`

## Frontend

1. Open `frontend/`
2. Run `npm install`
3. Run `npm run dev`
4. Open `http://localhost:5173`

## Local database

1. Open `infra/`
2. Run `docker compose -f compose.yml up -d`
3. PostgreSQL runs on `localhost:5432`
