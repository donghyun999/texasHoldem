# State Flow

## Tournament lifecycle

- `WAITING`: players can join, toggle ready, and the owner can start once at least two players are ready
- `IN_HAND`: blinds are posted, a hand is active, and only the acting player can submit an action
- `HAND_RESULT`: action is closed and the server prepares showdown, pot settlement, and bust-out updates
- `FINISHED`: one player remains and the tournament no longer accepts actions

## Player lifecycle

- `SEATED`: the player occupies a seat but is not committed to the next tournament start
- `READY`: the player is eligible for the next tournament start
- `ACTIVE`: the player is alive in the current hand and may still act
- `FOLDED`: the player has folded the current hand
- `ALL_IN`: the player has no chips left to act with but remains eligible for showdown
- `BUSTED_OUT`: the player has zero chips after settlement and is eliminated from the tournament
- `DISCONNECTED`: the player connection dropped and the server applies waiting-room removal or in-hand fallback rules

## Hand flow

1. Collect ready players and assign each a starting stack of 1000 chips
2. Move dealer, small blind, and big blind over surviving seated players
3. Post blinds, including forced all-in when a stack is shorter than the blind
4. Run preflop, flop, turn, and river betting rounds while tracking per-round and total contributions
5. Build the main pot and any side pots from matched contribution tiers, ignoring uncalled excess chips
6. Resolve showdown, distribute chips, and mark busted-out players
7. Return to `IN_HAND` for the next hand or transition to `FINISHED`

## Current engine notes

- `CALL` supports short all-in calls when the stack is smaller than the amount to call
- `ALL_IN` can either call or reopen action depending on whether it raises the current round bet
- The hand moves to `HAND_RESULT` as soon as one player remains eligible for the pot or no player can act because everyone left is all-in
