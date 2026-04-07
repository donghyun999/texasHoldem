# State Flow

## Tournament lifecycle

- `WAITING`: players can join, toggle ready, and the owner can start once at least two players are ready
- `IN_HAND`: blinds are posted, a hand is active, and only the acting player can submit an action
- `HAND_RESULT`: action is closed, showdown and settlement are already reflected, and the owner can open the next hand
  - settled pot-by-pot payouts are available in `snapshot.showdownPots`
- `FINISHED`: one player remains and the tournament no longer accepts actions

## Player lifecycle

- `SEATED`: the player occupies a seat but is not committed to the next tournament start
- `READY`: the player is eligible for the next tournament start
- `ACTIVE`: the player is alive in the current hand and may still act
- `FOLDED`: the player has folded the current hand
- `ALL_IN`: the player has no chips left to act with but remains eligible for showdown
- `BUSTED_OUT`: the player has zero chips after settlement and is eliminated from the tournament
- `DISCONNECTED`: the player connection dropped; `WAITING` removes the seat immediately, while live hands keep the seat and apply fold fallback when action reaches that player

## Hand flow

1. Collect ready players and assign each a starting stack of 1000 chips
2. Move dealer, small blind, and big blind over surviving seated players
3. Post blinds, including forced all-in when a stack is shorter than the blind
4. Run preflop, flop, turn, and river betting rounds while tracking per-round and total contributions
5. Build the main pot and any side pots from matched contribution tiers, ignoring uncalled excess chips
6. Resolve showdown, distribute chips, refund unmatched excess chips, and mark busted-out players
   Result snapshots keep both aggregate pot totals and per-pot payouts for the result panel
7. Wait in `HAND_RESULT` for the owner to open the next hand, or transition to `FINISHED`

## Current engine notes

- `CALL` supports short all-in calls when the stack is smaller than the amount to call
- `ALL_IN` can either call or reopen action depending on whether it raises the current round bet
- The hand moves to `HAND_RESULT` as soon as one player remains eligible for the pot or no player can act because everyone left is all-in
- Showdown uses deterministic hidden hole cards and awards main pots and side pots before the snapshot is broadcast
- Blind levels advance only on the next hand boundary, never in the middle of an active hand
- Waiting-room disconnects remove the player immediately and delegate owner rights by lowest eligible seat
- In-hand disconnects mark the player offline, auto-fold active actors, and allow reconnect by the same `guestId`

## Persistence notes

- Tournament mutations are persisted as one JSON aggregate after create, join, ready, start, action, disconnect, and reconnect flows
- `TournamentService` first reads from the in-memory cache and falls back to persisted state on cache miss or service restart
- Waiting-room tournaments are deleted only when the last player leaves the table
- `HAND_RESULT` and `FINISHED` tournaments are currently retained so reconnect and result-screen fetches can still resolve the latest snapshot
