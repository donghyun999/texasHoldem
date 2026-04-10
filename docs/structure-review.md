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

## Current runtime boundary

- Tournament mutations are serialized per in-memory `TournamentState` with JVM-local synchronization in `TournamentService`
- This is sufficient for the current single backend instance MVP shape
- It is not a multi-instance lock
- Before running multiple backend instances, add a table-level command serialization strategy:
  - PostgreSQL row/advisory lock around a tournament command
  - or a single-consumer command queue keyed by tournament code
  - or another shared lock that works across instances
- Keep the mutation order as: command validation, state change, persistence, snapshot/event creation, topic publish

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

### TournamentService command-handler split

- Current file:
  - `backend/src/main/java/com/texasholdem/tournament/application/TournamentService.java`
- Why this can become a problem:
  - the service currently coordinates lobby, connection, hand engine, persistence, scheduling hints, and broadcast assembly
  - this is still readable for MVP, but future commands can turn it into both orchestrator and rule owner
- Why this should wait:
  - the immediate risk is the snapshot/state contract, not package movement
  - large service splits would add regression risk while gameplay behavior is still being verified
- Preferred future direction:
  - keep `TournamentService` as the public application facade
  - move command-specific flows into focused package-private handlers when the next substantial command is added
  - keep poker rules in engine/domain collaborators, not in the facade

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
