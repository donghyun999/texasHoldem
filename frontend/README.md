# Frontend

React + Vite frontend for the Texas Holdem application.

## Folder intent

- `app`: app bootstrap, router, providers
- `pages`: route-level screens
- `widgets`: larger composed UI blocks
- `features`: user-facing feature modules
- `entities`: core UI models such as player, room, game state
- `shared`: shared API client, hooks, ui, model utilities

## Initial pages

- `/`: lobby landing page
- `/table/:roomCode`: table prototype page

## Initial integrations

- REST status check to `http://localhost:8080/api/v1/status`
- STOMP client scaffold for `ws://localhost:8080/ws`
