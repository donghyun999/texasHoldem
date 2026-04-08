# AGENTS.md

## Project context

- Project: Texas Holdem single-table tournament MVP
- Current phase: MVP development
- Database policy for MVP: use a local native PostgreSQL instance during development
- Deployment policy for final release: move the runtime to Docker-based deployment

## Environment rules

- Default development assumption: backend runs with `SPRING_PROFILES_ACTIVE=local`
- Local development should continue to work against native PostgreSQL on `localhost:5432`
- Do not optimize the project only for local execution if that makes later Docker conversion harder
- Prefer environment-driven configuration over hardcoded hostnames, ports, or credentials
- Keep backend, frontend, and infra changes compatible with a later Docker transition

## Working guidance for future agents

- When changing runtime configuration, preserve the current local PostgreSQL developer workflow
- When introducing new services, env vars, or startup steps, consider how they will map into Docker later
- Favor separate local and docker profiles/configs instead of one-off conditional hacks
- Treat Docker support as a planned deployment target, even if MVP work still runs locally
- Do not turn `AGENTS.md` into a session log or append-only change history
- Keep `AGENTS.md` limited to durable rules, constraints, and recurring project guidance
- Record progress in a separate status document and update it by summarizing the current state rather than endlessly appending old notes

## Current source of truth

- `README.md` documents the overall workflow and environment strategy
- `docs/setup.md` documents local setup details
- `docs/status.md` tracks current progress, completed work, and next work as a maintained summary
- `infra/` is the place for Docker Compose and deployment-oriented infrastructure files
