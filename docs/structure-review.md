# Structure Review

## Purpose

- This document captures a conservative structure review for MVP closeout
- Prefer low-risk cleanup now and defer package/file moves that can introduce regressions
- Keep local PostgreSQL development with `SPRING_PROFILES_ACTIVE=local` unchanged

## Safe to do now

- Remove empty root directories that do not participate in the build:
  - `scripts/`
  - `src/`
- Remove ignored temp and log artifacts that add noise but do not affect runtime:
  - root `*.log`
  - `backend/bootRun.local.log`
  - `backend/bootrun*.log`
  - `.tmp_docx/`
  - `.tmp_docx.zip`
- Keep these as cleanup-only tasks
  - no package changes
  - no class renames
  - no import churn

## Defer until after MVP

### Backend persistence packaging

- Current files:
  - `backend/src/main/java/com/texasholdem/tournament/application/PersistentTournamentStateStore.java`
  - `backend/src/main/java/com/texasholdem/tournament/application/InMemoryTournamentStateStore.java`
  - `backend/src/main/java/com/texasholdem/tournament/application/TournamentStatePersistenceMapper.java`
  - `backend/src/main/java/com/texasholdem/tournament/application/TournamentStateStore.java`
- Why the current placement feels off:
  - they are persistence adapters or persistence support, not tournament orchestration
- Why this should wait:
  - several of these types are package-private
  - moving them requires access-level review, test package review, and Spring wiring verification
- Preferred future direction:
  - move concrete adapters and mapper under `com.texasholdem.tournament.infrastructure.persistence`
  - decide whether `TournamentStateStore` remains in `application` as a port or moves with adapters

### Frontend realtime hook split

- Current file:
  - `frontend/src/entities/tournament/model/use-tournament-realtime-snapshot.ts`
- Why the current placement feels off:
  - the hook owns websocket lifecycle, reconnect policy, REST fallback, route-exit disconnect, and query-cache sync
  - that is closer to page orchestration than a narrow entity model concern
- Why this should wait:
  - recent websocket and reconnect bug fixes landed here
  - splitting immediately increases regression risk in MVP closeout
- Preferred future direction:
  - keep snapshot types and query keys in `entities/tournament/model`
  - extract transport/session orchestration into `features/table/model` or a dedicated realtime module
  - leave `TablePage` thin and snapshot-driven

### Placeholder backend packages

- Current empty package roots:
  - `backend/src/main/java/com/texasholdem/auth`
  - `backend/src/main/java/com/texasholdem/lobby`
  - `backend/src/main/java/com/texasholdem/user`
- These are low-risk cleanup candidates later, but they are not worth touching during MVP closeout

## Current recommendation

1. Keep the high-level project split as-is: `backend / frontend / docs / infra`
2. Restrict closeout changes to cleanup, bug fixes, and presentation-only UI improvements
3. Revisit package moves only after MVP behavior is frozen and smoke-tested
