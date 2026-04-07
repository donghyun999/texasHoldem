# Backend

Spring Boot backend for the Texas Holdem application.

## Current scope

- Tournament REST API and STOMP/WebSocket messaging
- Single-table tournament flow with ready/start/action/disconnect/reconnect handling
- PostgreSQL-backed state persistence through JPA and Flyway

## Runtime profiles

- `local`: current development profile for native PostgreSQL on `localhost`
- `docker`: future container-oriented profile that defaults the datasource host to `postgres`

## Key endpoints

- `GET /api/v1/status`
- `POST /api/v1/guests`
- `POST /api/v1/tournaments`
- `POST /api/v1/tournaments/{code}/join`
- `GET /api/v1/tournaments/{code}`
- `WS /ws`
- `SEND /app/tournament.ready`
- `SEND /app/tournament.disconnect`
- `SEND /app/tournament.reconnect`
- `SEND /app/tournament.start`
- `SEND /app/game.action`
- `SUBSCRIBE /topic/tournament.{code}`
