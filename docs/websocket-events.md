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

- `tournamentSnapshot`: full snapshot refresh for late join or reconnect flows
- `readyChanged`: waiting-room ready state changed
- `playerDisconnected`: a player left the waiting room or went offline during tournament play
  - waiting-room disconnects may remove the seat entirely, auto-fold the active actor, and transfer owner rights
- `playerReconnected`: the same `guestId` restored seat connectivity and can receive fresh snapshots again
- `levelChanged`: blind level changed and the next hand will use the new level
- `handStarted`: players, blinds, and acting seat were initialized
  - the same event is used for the first hand and for owner-triggered next-hand starts from `HAND_RESULT`
- `actionApplied`: an in-hand action was accepted and the acting seat advanced
  - the snapshot may also reveal the next street, recalculate main/side pots, settle showdown, close the hand into `HAND_RESULT`, or finish the tournament
- `potsUpdated`: main pot or side pots changed after an all-in or settlement step
- `showdownStarted`: remaining cards are exposed and showdown begins
- `handEnded`: settlement completed and the hand-result state is visible
- `playerBusted`: one or more players were eliminated from the tournament
- `tournamentFinished`: the winner is final and no more actions are accepted

## Snapshot additions

- `showdownPots`: settled per-pot payout detail exposed in `HAND_RESULT` and preserved through `FINISHED`
  - shape: `[{ id, type, amount, payouts: [{ guestId, nickname, amount }] }]`
  - existing `mainPot` and `sidePots` remain unchanged for in-hand rendering
