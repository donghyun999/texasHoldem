# Texas Holdem

Texas Holdem multiplayer web application skeleton.

## Stack

- Backend: Java 17, Spring Boot, REST, WebSocket/STOMP, JPA, PostgreSQL, Flyway
- Frontend: React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Zustand
- Infra: Docker Compose

## Structure

- `backend/`: Spring Boot application, REST API, WebSocket/STOMP, game engine
- `frontend/`: React + Vite client, lobby/table UI, realtime client
- `docs/`: game rules, state flow, websocket event notes, roadmap, setup guide
- `infra/`: local infrastructure files such as Docker Compose

## Quick start

- Backend health endpoint: `GET /api/v1/status`
- Backend websocket endpoint: `ws://localhost:8080/ws`
- Frontend dev server: `http://localhost:5173`

## Notes

- The original root `src/` directory was left untouched because it was empty.
- This repository now contains project setup files, but the current machine does not have Gradle or Node installed yet.
