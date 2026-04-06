# Roadmap

## Phase 1

- Refactor the prototype around tournament terminology instead of generic lobby and room wording
- Define a shared tournament snapshot contract for backend REST, WebSocket, and frontend UI
- Build the waiting-room flow with guest join, ready toggle, and owner start

## Phase 2

- Implement blind-level timing that advances on the next hand boundary
- Add hand-start orchestration for dealer, small blind, and big blind assignment
- Bind the frontend table to live tournament snapshot broadcasts

## Phase 3

- Implement all-in handling and side-pot calculation with dedicated tests
- Add showdown, pot settlement, player bust-out, and tournament-finished events
- Improve reconnect behavior and persistence for production hardening
