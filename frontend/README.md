# Frontend

React + Vite frontend for the Texas Holdem application.

## Current scope

- `app`: app bootstrap, router, providers
- `pages`: tournament landing page and live table route
- `widgets`: overview, table, and showdown panels
- `features`: lobby entry, player seat, and action controls
- `entities`: shared tournament snapshot and event contracts
- `shared`: REST client, STOMP client, guest session, and runtime env helpers

## Routes

- `/`: lobby landing page
- `/tournaments/:tournamentCode`: live tournament table

## Runtime configuration

- `VITE_API_BASE_URL`: backend HTTP origin, default `http://localhost:8080`
- `VITE_TOURNAMENT_WS_URL`: backend WebSocket endpoint, default `ws://localhost:8080/ws`
