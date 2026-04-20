# orchestrator status

- last_updated: `2026-04-17 Asia/Seoul`
- status: `closing`
- branch: `main`
- worktree: `C:\Users\user\texasHoldem`
- role: `main-orchestrator`

## Session Summary

- Collected handoffs from `backend-agent`, `frontend-agent`, and `verification-agent`.
- Confirmed one live root cause from Railway investigation:
  - legacy `tournament_state` rows exist with `players[*].guestId = null`
  - `PersistentTournamentStateStore.findActiveTournamentCodeByGuestId(...)` dereferenced `player.guestId` without null safety
  - `create`, `join`, and `active-tournament` failed with `500`
  - `lobby/public` stayed `200` because it did not dereference `guestId`
- Backend defensive fix for legacy payload handling was added and pushed.
- A separate compile blocker was found and fixed:
  - invalid declarations had been added to `TournamentStateJpaRepository`
  - compile was restored and the fix was pushed
- Frontend review concluded no further mandatory code change was needed for the legacy payload fix beyond the already landed `HomePage`/`http.ts` recovery alignment.

## Handoffs Collected

- `backend-agent`
  - null-safe fix in `PersistentTournamentStateStore` and `InMemoryTournamentStateStore`
  - persistence tests added for legacy null `guestId`
  - websocket identity contract also aligned earlier in the session
  - compile blocker in `TournamentStateJpaRepository` removed
- `frontend-agent`
  - no extra frontend patch required for the confirmed legacy payload bug
  - current `HomePage` active-tournament fallback and prior viewer/self fixes judged sufficient for re-test
- `verification-agent`
  - repeatedly confirmed live pattern:
    - `create` / `active-tournament` / `join` were failing
    - `lobby/public` remained `200`
  - before session close, re-verification after the latest compile-fix push had not yet been run

## Pushed Commits This Session

- `59b48a0` `Harden tournament persistence against legacy payloads`
- `0d3ce1a` `Restore JPA repository typing for tournament state`

## Unintegrated Local Changes

- `docs/session-restart-prompts.md`
- `.gradle-fresh/`
- `.gradle/`
- `agent-output/`
- `backend/.gradle-user/`
- `backend/.gradle-verification/`
- `cookies.txt`

## Next Actions

1. Redeploy backend with `0d3ce1a` included.
2. Run live verification in this order:
   - `POST /api/v1/tournaments`
   - `GET /api/v1/guests/{guestId}/active-tournament`
   - `GET /api/v1/guests/me/active-tournament`
   - `POST /api/v1/tournaments/{code}/join`
   - `GET /api/v1/tournaments/lobby/public`
3. If `create/join/active-tournament` still fail, inspect Railway logs again for the next malformed payload shape.
4. After server-side stability returns, resume the separate hole-card regression investigation:
   - backend event snapshots are likely public-only on transition paths
   - frontend hydration still has risk during reload/reconnect/hand-start transitions

## Remaining Risks

- Live DB may contain malformed payload fields beyond `guestId = null`.
- `payload::jsonb` assumptions are still an operational risk because payload storage was observed as large-object/OID text in production.
- Hole-card visibility regression is not closed; backend event snapshot design and frontend hydration timing both remain suspects.
