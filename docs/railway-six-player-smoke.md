# Railway 6-Player Smoke Test

## Scope

- Date: 2026-04-10 KST
- Frontend URL: `https://texasholdemfrontend-production.up.railway.app`
- Backend URL inferred from frontend runtime: `https://texasholdembackend-production.up.railway.app`
- Purpose: verify the deployed frontend with six independent browser sessions, focusing on the reported seat 5 hole-card visibility / wrong-card issue.
- Constraint: no product code fixes were made during this verification pass.

## Method

- Used six isolated Chromium browser contexts against the deployed frontend URL.
- Created one tournament from player 1 and joined players 2-6 through the live UI.
- Used UI controls for `Mark Ready`, `Start Tournament`, and in-hand action buttons.
- Compared each browser's visible `YOU` seat against the backend personalized snapshot returned by `GET /api/v1/tournaments/{code}?guestId=...`.
- Treated a visible `HOLD` label inside the `YOU` seat as a self-card rendering failure.
- Recorded browser console warnings/errors and page errors.

## Runs

| Run | Tournament | UI actions | Hand-result windows observed | Result |
| --- | --- | ---: | ---: | --- |
| 1 | `RS2KLSH` | 36 | 1 | Pass |
| 2 | `RS2P8CK` | 36 | 7 | Pass |

## Seat 5 Checks

| Run | Seat 5 guest | Final API `selfHoleCards` | DOM `YOU` seat found | DOM hidden-card count in self seat | Result |
| --- | --- | --- | --- | ---: | --- |
| `RS2KLSH` | `guest-910b8e60` | `JH,4S` | Yes | 0 | Pass |
| `RS2P8CK` | `guest-97c3f016` | `TH,8D` | Yes | 0 | Pass |

## Findings

- No reproduction of the reported seat 5 missing-card, disappearing-card, or wrong-neighbor-card bug in the redeployed build.
- All six players received two personalized `selfHoleCards` from the backend after tournament start.
- All six browser sessions found their own `YOU` seat in the DOM.
- The `YOU` seat did not render hidden `HOLD` cards for active self seats in either run.
- No browser page errors were recorded.
- No browser console warnings or errors were recorded.

## Artifacts

- `test-results/railway-six-player-smoke.json`
- `test-results/railway-six-player-smoke-fold-priority.json`
- `test-results/railway-six-player-smoke.cjs`

## Remaining Risk

- This pass used deterministic automated actions, mostly simple check/call/fold paths. It did not exhaustively cover manual rapid tab switching, mobile browser backgrounding, network flapping, or reconnect after seat 5 reload.
- If the original issue returns, the next useful capture is a failing tournament code, seat number, guest nickname, and whether the browser was refreshed or switched between multiple players before the card mismatch appeared.
