# Status

## Purpose

- This document is a maintained summary of current project status
- Update this file by replacing or refining outdated summaries
- Do not use this file as an append-only session log

## Current phase

- Tournament MVP implementation
- Local development target uses native PostgreSQL
- Final deployment target should remain Docker-ready
- MVP staging can now be prepared on Railway without changing the local PostgreSQL workflow

## Completed

- Guest-based tournament create, join, ready, and owner-start flow
- Guest-level active-tournament detection and resume path on the home screen
- Shared tournament snapshot contract across backend REST, WebSocket, and frontend UI
- Blind-level progression on hand boundaries
- In-hand action flow with fold, check, call, raise, and all-in handling
- Betting-rule alignment for minimum raise sizing and short all-in raise-reopen behavior
- Follow-up validation for betting rules across preflop, postflop, snapshot `availableActions`, and persisted reloads
- Reconnect validation for disconnected folded/all-in players across persisted reload and reconnect recovery
- Reconnect hardening for expired `HAND_RESULT` recovery and table-message continuity
- Main pot and side pot calculation
- Showdown settlement, bust-out handling, and tournament finish flow
- Richer showdown/result payload detail and frontend result-panel summaries
- Showdown hand-class labels now flow from backend settlement into result snapshots and frontend rendering
- Hand-local elimination summary preserved in snapshots and result payloads for reconnect-safe result rendering
- Shuffled deck-based hole-card dealing and board runout with persisted in-hand card recovery
- Result-state auto-advance after 5 seconds
- Final-hand result hold before `FINISHED`, including expired reconnect/reload normalization
- Basic reconnect and persistence flow
- WebSocket origin allowlist now follows the shared environment-driven local frontend origin configuration
- Custom tournament-code creation now works end-to-end for create and join flows
- REST mirror endpoints for ready, start, disconnect, and reconnect now accept the tournament code from the URL path, so fallback disconnect and waiting-room leave flow no longer fail validation
- Frontend disconnect fallback now applies returned snapshots locally and keeps active-tournament cache aligned after waiting-room leave
- Table-entry disconnect cleanup now ignores the initial React `StrictMode` effect cleanup, so owner create/join flow no longer auto-removes the table immediately after navigation
- Table-page WebSocket lifecycle no longer re-creates the STOMP client on every render, so the realtime session now stays connected in browser play instead of falling back to a looping `LIVE SNAPSHOT` state
- Explicit in-hand disconnect from the browser no longer auto-reconnects immediately on the same page, so manual reconnect flow is now testable and consistent with the UI
- Waiting-room join now fan-outs a fresh `tournamentSnapshot`, so already seated browsers refresh the participant list immediately when a new player enters
- Browser refresh no longer auto-sends the fallback disconnect for in-hand seats, so reloading the active actor restores the latest snapshot instead of forcing an immediate fold
- Table REST snapshot now accepts an optional viewing `guestId` and returns `selfHoleCards`, so the current player can see their own hand without exposing opponents' cards
- Finished tournaments now clean themselves up after the result screen window, either 20 seconds after `FINISHED` or earlier when the last connected player leaves
- Persisted stale tournaments now clean themselves up from `updated_at` TTL rules before active-tournament lookup and capacity-sensitive create/join flows, so abandoned waiting or in-hand rows no longer block new MVP testing sessions
- Railway deployment profile and service manifests now separate MVP hosting concerns from the local `local` profile workflow

## In progress / focus

- Keep the MVP working against local PostgreSQL
- Preserve a clean path to final Docker-based deployment
- Harden reconnect and persistence behavior
- Keep backend betting state, snapshot actions, and persisted hand state aligned with the tournament spec
- Finish MVP closeout by separating true must-fix items from explicit out-of-scope items
- Run the first real Railway smoke deploy against the new deployment profile and service settings

## Next work

- Final reconnect and persistence hardening review for any newly found edge case
- Final browser smoke test across create, join, leave, resume, and reconnect flows
- First Railway deployment smoke test with public domains, Postgres variable references, and single-replica websocket verification
- Final MVP closeout review for features that should stay explicitly out of scope
- Continue organizing runtime configuration so local and Docker profiles stay easy to switch

## Current assessment

- The recent betting-rule change is currently consistent in backend action flow, persisted hand state, and snapshot-driven client behavior
- No additional frontend or websocket contract changes are currently required for minimum-raise or short all-in raise-reopen handling
- Current reconnect flow is consistent with the MVP scope for seat-level recovery, including persisted offline state and reconnect after reload
- Home-screen UX now surfaces when the current guest is already seated in another active tournament instead of only failing after a create/join request
- Reconnect now normalizes stale expired `HAND_RESULT` state before reconnect/disconnect snapshots are published, so recovery lands on the real current hand
- Final-hand results now stay visible for the full 5-second window before `FINISHED`, and expired recovery normalizes both next-hand and final-finish branches
- Result handling now exposes richer websocket payload summaries while keeping the snapshot-driven client contract
- Result snapshots now include server-evaluated showdown hand labels, so the UI can name revealed hands without client-side re-evaluation
- Result snapshots now preserve hand-local bust context, so split-pot / side-pot result screens no longer have to infer eliminations from cumulative tournament state
- Hand setup now consumes cards from a shuffled 52-card deck while preserving board and hole-card consistency across persisted reloads
- Local PostgreSQL development flow remains unchanged, and the changes do not add Docker-host-specific assumptions
- Local browser dev hosts now share one origin allowlist for REST and WebSocket entry, so `127.0.0.1:5173` no longer fails the STOMP handshake by configuration
- The most recent smoke check found and fixed a validation mismatch between REST mirror endpoints and frontend fallback disconnect behavior
- The most recent smoke check also found and fixed an unintended auto-disconnect on initial table entry in frontend dev `StrictMode`
- The latest browser verification also confirmed stable `LIVE WS` state through create, join, ready, start, waiting-room leave, disconnect, and reconnect flows
- Waiting-room participant lists now refresh immediately on join because REST join mirrors one websocket snapshot broadcast to existing subscribers
- Reload recovery now preserves the current in-hand seat instead of converting the refresh into an automatic disconnect/fold path
- The main remaining work is MVP boundary confirmation and any newly discovered reconnect edge case, not a known blocker in waiting-room leave or basic browser websocket stability
- Active-player capacity now has a stale-row safety valve based on persisted `updated_at`, so old abandoned tournaments should stop accumulating into repeated `503 at capacity` failures during local MVP testing
- Railway-targeted deployment config now exists separately from the local profile, so the MVP can be hosted without reusing the verbose `local` runtime settings in production-like hosting

## MVP closeout boundary

### Keep in scope

- Snapshot-driven result rendering for board cards, settled pot payouts, split pots, side pots, and hand-local eliminations
- Server-evaluated showdown hand-class labels preserved in result snapshots and result payloads
- Reconnect / reload recovery that lands on the correct live hand, `HAND_RESULT`, or `FINISHED` snapshot after stale-result normalization
- Persistence behavior that remains compatible with local PostgreSQL development and a later Docker profile split

### Leave out of scope for this MVP

- Card-by-card showdown reveal sequencing or staged reveal animation contracts
- Replay, hand history, or event-timeline reconstruction
- Final standings ladder beyond the winner and the latest settled snapshot

## Remaining gaps

- Reconnect recovery is still snapshot-level and does not attempt richer in-hand session restoration beyond seat ownership and latest snapshot
- Showdown reveal sequencing, replay metadata, and final standings history remain intentionally out of scope for this MVP

## Notes

- Prefer updating this summary when the project meaningfully changes
- If old status details are no longer useful, rewrite them instead of stacking more history
