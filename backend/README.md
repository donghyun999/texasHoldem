# Backend

Spring Boot backend for the Texas Holdem application.

## Package intent

- `common`: shared exceptions, response models, utilities
- `config`: Spring configuration
- `auth`: authentication and authorization
- `user`: player and profile related features
- `lobby`: room creation, join, waiting room
- `game`: core Texas Holdem domain and application logic
- `websocket`: STOMP/WebSocket message handling
- `persistence`: repositories and storage adapters

## Initial endpoints

- `GET /api/v1/status`
- `GET /api/v1/lobby/echo?nickname=player_one`
- `WS /ws`
- `SEND /app/lobby.ping`
- `SUBSCRIBE /topic/lobby`
