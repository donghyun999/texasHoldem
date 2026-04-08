# WebSocket Events

## Transport

- Endpoint: `ws://localhost:8080/ws`
- Subscribe: `/topic/tournament.{code}`

## Client send destinations

- `/app/tournament.ready`
  - payload: `code`, `guestId`, `ready`
- `/app/tournament.disconnect`
  - payload: `code`, `guestId`
- `/app/tournament.reconnect`
  - payload: `code`, `guestId`
- `/app/tournament.start`
  - payload: `code`, `guestId`
- `/app/game.action`
  - payload: `code`, `guestId`, `action`, `amount`

## REST mirrors

- `GET /api/v1/tournaments/{code}`
  - optional query: `guestId`
  - when `guestId` is present, the snapshot may include `selfHoleCards` for that viewing player only
- `POST /api/v1/tournaments/{code}/ready`
  - payload: `guestId`, `ready`
- `POST /api/v1/tournaments/{code}/disconnect`
  - payload: `guestId`
- `POST /api/v1/tournaments/{code}/reconnect`
  - payload: `guestId`
- `POST /api/v1/tournaments/{code}/start`
  - payload: `guestId`
- the REST path code is now the source of truth for these mirrors, while WebSocket payloads continue to send `code` explicitly

## Broadcast events

### Spec-required taxonomy

- `tournamentSnapshot`: full snapshot refresh for reconnect recovery
- `readyChanged`: waiting-room ready state changed
- `levelChanged`: blind level changed and the next hand uses the new level
- `handStarted`: players, blinds, and acting seat were initialized
- `actionApplied`: an in-hand action was accepted and the acting seat advanced
- `potsUpdated`: pot structure or showdown payout detail changed during action or forced-fold resolution
- `showdownStarted`: the current broadcasted snapshot represents a real showdown path
- `handEnded`: the hand closed into `HAND_RESULT` or `FINISHED`
- `playerBusted`: one or more players were eliminated from the tournament
- `tournamentFinished`: the winner is final and no more actions are accepted

### Implementation extensions

- `playerDisconnected`: a player left the waiting room or went offline during tournament play
  - waiting-room disconnects may remove the seat entirely, auto-fold the active actor, and transfer owner rights
- `playerReconnected`: the same `guestId` restored seat connectivity and can receive fresh snapshots again

### Current implementation notes

- Every broadcast event still carries the full `snapshot` object, so the frontend can remain snapshot-driven
- One websocket command may publish multiple events to the same topic when a single transition satisfies multiple taxonomy names
  - example: an all-in call that creates the final result can co-broadcast `potsUpdated`, `showdownStarted`, `handEnded`, `playerBusted`, then `actionApplied`
  - `tournamentFinished` is emitted later when that final `HAND_RESULT` window expires, or immediately when stale expired final-result state is normalized on reload/reconnect
- `tournamentSnapshot` is currently emitted on reconnect recovery and on waiting-room join so seated browsers refresh participant lists immediately
- reconnect recovery may co-broadcast `handStarted` or `tournamentFinished` first if the server has to normalize a stale expired `HAND_RESULT` before restoring the seat
- the frontend now keeps a stable STOMP client per table route instead of re-subscribing on every render, so browser realtime state should remain `LIVE WS` during normal play
- explicit in-page `disconnect` no longer triggers an immediate automatic `reconnect` on the same page; manual reconnect remains the intended UI path after a deliberate disconnect
- browser refresh no longer triggers the fallback `disconnect` request automatically, so the same `guestId` can reload an in-hand snapshot without being forced to fold
- `showdownStarted` is an alias over the first fully settled showdown snapshot
  - current engine does not expose a separate pre-settlement showdown phase between `IN_HAND` and `HAND_RESULT`
- Existing primary events `readyChanged`, `handStarted`, `actionApplied`, `playerDisconnected`, and `playerReconnected` remain intact for backward compatibility

### Result-event payload detail

- `showdownStarted`
  - payload includes `boardCards`, `showdownPotCount`, and `pots`
  - `pots` shape: `[{ id, type, amount, winnerGuestIds, split, payouts: [{ guestId, nickname, amount }] }]`
- `handEnded`
  - payload includes `status`, `showdown`, `boardCards`, `mainPot`, `sidePotCount`, `showdownPotCount`, `pots`, `recentlyBustedGuestIds`, and `recentlyBustedPlayers`
- `playerBusted`
  - payload keeps `guestIds` and `nicknames`
  - payload also includes `players`: `[{ guestId, nickname, seatIndex, finalStack }]`
- `tournamentFinished`
  - payload includes `winnerGuestId`, `winnerNickname`, `winnerStack`, `boardCards`, `showdownPotCount`, `pots`, `recentlyBustedGuestIds`, and `recentlyBustedPlayers`

## Snapshot additions

- `showdownPots`: settled per-pot payout detail exposed in `HAND_RESULT` and preserved through `FINISHED`
  - shape: `[{ id, type, amount, payouts: [{ guestId, nickname, amount }] }]`
- `recentlyBustedGuestIds`: hand-local elimination summary preserved through `HAND_RESULT` and `FINISHED`
  - shape: `["guest-1", "guest-4"]`
- `selfHoleCards`: the current viewer's own hole cards, exposed only on personalized REST snapshot fetches
  - shape: `["AS", "KH"]`
  - existing `mainPot` and `sidePots` remain unchanged for in-hand rendering
