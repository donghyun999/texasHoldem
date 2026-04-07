# Status

## Purpose

- This document is a maintained summary of current project status
- Update this file by replacing or refining outdated summaries
- Do not use this file as an append-only session log

## Current phase

- Tournament MVP implementation
- Local development target uses native PostgreSQL
- Final deployment target should remain Docker-ready

## Completed

- Guest-based tournament create, join, ready, and owner-start flow
- Shared tournament snapshot contract across backend REST, WebSocket, and frontend UI
- Blind-level progression on hand boundaries
- In-hand action flow with fold, check, call, raise, and all-in handling
- Main pot and side pot calculation
- Showdown settlement, bust-out handling, and tournament finish flow
- Result-state auto-advance after 5 seconds
- Basic reconnect and persistence flow

## In progress / focus

- Keep the MVP working against local PostgreSQL
- Preserve a clean path to final Docker-based deployment
- Harden reconnect and persistence behavior

## Next work

- Improve reconnect and persistence hardening
- Expand hand-result event detail for richer client presentation
- Replace deterministic MVP card flow with production-grade deck/randomness
- Continue organizing runtime configuration so local and Docker profiles stay easy to switch

## Notes

- Prefer updating this summary when the project meaningfully changes
- If old status details are no longer useful, rewrite them instead of stacking more history
