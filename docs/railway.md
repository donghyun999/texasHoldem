# Railway Deployment

## Scope

- This document covers the current MVP deployment path on Railway
- Local development still uses native PostgreSQL with `SPRING_PROFILES_ACTIVE=local`
- Final production packaging can still move to Docker later without changing app-level env names

## Services

Create one Railway project with three services:

1. `Postgres` database service
2. `backend` app service sourced from this repo
3. `frontend` app service sourced from this repo

## Required service settings

### Backend service

- Root directory: `/backend`
- Config as Code file path: `/backend/railway.json`
- Public domain: enabled
- Replicas: keep `1`
- Serverless sleep: keep disabled

Backend service variables:

```bash
APP_CORS_ALLOWED_ORIGINS=https://<frontend-domain>
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USERNAME=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
APP_MAX_ACTIVE_PLAYERS=50
APP_WAITING_IDLE_TTL_SECONDS=1800
APP_IN_HAND_IDLE_TTL_SECONDS=7200
APP_TOURNAMENT_HARD_TTL_SECONDS=86400
```

Notes:

- `backend/railway.json` starts the app with the `railway` Spring profile
- Healthcheck path is `/actuator/health`
- The backend uses the in-process STOMP simple broker and in-process delayed transitions, so scaling beyond one replica is not safe for this MVP

### Frontend service

- Root directory: `/frontend`
- Config as Code file path: `/frontend/railway.json`
- Public domain: enabled

Frontend service variables:

```bash
VITE_API_BASE_URL=https://<backend-domain>
VITE_TOURNAMENT_WS_URL=wss://<backend-domain>/ws
```

Notes:

- `VITE_TOURNAMENT_WS_URL` is optional if you want to derive it from `VITE_API_BASE_URL`, but setting it explicitly avoids deploy-time ambiguity
- Healthcheck path is `/`

## Deploy order

1. Create the `Postgres` service
2. Create and deploy the `backend` service
3. Generate a backend public domain
4. Create and deploy the `frontend` service
5. Generate a frontend public domain
6. Set `APP_CORS_ALLOWED_ORIGINS` on the backend to the final frontend domain
7. Redeploy backend once after the frontend domain is fixed

## Smoke checks

After deploy:

1. Open `https://<backend-domain>/actuator/health`
2. Open `https://<frontend-domain>/`
3. Verify the home screen can load backend status
4. Create a guest, create a tournament, join from another browser, ready, start, and confirm live websocket updates

## Known MVP deployment limits

- Backend must remain a single replica
- Backend sleep should stay disabled because active tournaments and websocket sessions are long-lived
- This deployment path is for the current MVP only; the planned final deployment target is still Docker-oriented runtime packaging
