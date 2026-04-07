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
  - example: an all-in call that ends the tournament can co-broadcast `potsUpdated`, `showdownStarted`, `handEnded`, `playerBusted`, `tournamentFinished`, then `actionApplied`
- `tournamentSnapshot` is currently emitted on reconnect recovery rather than on every state change
- `showdownStarted` is an alias over the first fully settled showdown snapshot
  - current engine does not expose a separate pre-settlement showdown phase between `IN_HAND` and `HAND_RESULT`
- Existing primary events `readyChanged`, `handStarted`, `actionApplied`, `playerDisconnected`, and `playerReconnected` remain intact for backward compatibility

## Snapshot additions

- `showdownPots`: settled per-pot payout detail exposed in `HAND_RESULT` and preserved through `FINISHED`
  - shape: `[{ id, type, amount, payouts: [{ guestId, nickname, amount }] }]`
  - existing `mainPot` and `sidePots` remain unchanged for in-hand rendering
