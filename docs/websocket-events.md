# WebSocket Events

## Transport

- Endpoint: `ws://localhost:8080/ws`
- Subscribe: `/topic/tournament.{code}`

## Client send destinations

- `/app/tournament.ready`
  - payload: `code`, `guestId`, `ready`
- `/app/tournament.start`
  - payload: `code`, `guestId`
- `/app/game.action`
  - payload: `code`, `guestId`, `action`, `amount`

## Broadcast events

- `tournamentSnapshot`: full snapshot refresh for late join or reconnect flows
- `readyChanged`: waiting-room ready state changed
- `levelChanged`: blind level changed and the next hand will use the new level
- `handStarted`: players, blinds, and acting seat were initialized
- `actionApplied`: an in-hand action was accepted and the acting seat advanced
  - the snapshot may also reveal the next street, recalculate main/side pots, or close the hand into `HAND_RESULT`
- `potsUpdated`: main pot or side pots changed after an all-in or settlement step
- `showdownStarted`: remaining cards are exposed and showdown begins
- `handEnded`: settlement completed and the hand-result state is visible
- `playerBusted`: one or more players were eliminated from the tournament
- `tournamentFinished`: the winner is final and no more actions are accepted
