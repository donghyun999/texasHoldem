# Guest Token Session Transition

## Goal

- Remove deployed runtime dependence on cross-site session cookies.
- Keep local development flow working with `SPRING_PROFILES_ACTIVE=local`.
- Migrate in a compatible way so existing cookie-backed browsers do not break during rollout.

## Current Problem

- The browser stores `guestId` locally, but protected REST/WebSocket commands are authorized by backend HTTP session.
- In Railway deployment, frontend and backend run on separate origins.
- Safari/iPhone class browsers can block cross-site session cookies by default, causing `401 Unauthorized` on join/ready/start/action.

## Target Model

- `POST /api/v1/guests` returns:
  - `guestId`
  - `nickname`
  - `guestToken`
- The frontend persists `guestId` and `guestToken`.
- Protected REST requests send the token in `Authorization: Bearer <guestToken>`.
- WebSocket STOMP `CONNECT` sends the same token via connect headers.
- Backend resolves guest identity from token first and falls back to HTTP session during compatibility phase.

## Compatibility Strategy

### Phase 1

- Backend accepts both:
  - `Authorization: Bearer <guestToken>`
  - existing session cookie
- Frontend starts sending token for all authenticated requests.
- Guest creation still establishes the legacy session cookie so old flows continue working.

### Phase 2

- WebSocket authorization also resolves from token-backed STOMP connect headers.
- Smoke scripts and local verification scripts are updated to persist the issued token when needed.

### Phase 3

- Remove deployment dependence on session cookies.
- Keep optional session fallback only if it still provides local convenience.

## Backend Work Items

1. Add guest token issuer/verifier component.
2. Extend `GuestSession` response contract with `guestToken`.
3. Update `GuestSessionResolver`:
   - HTTP: token header first, session fallback second
   - WebSocket message handling: session attributes populated from STOMP `CONNECT` token
4. Register WebSocket inbound interceptor to extract guest token from connect headers.
5. Keep `GuestController` establishing legacy session during transition.
6. Add tests for:
   - token issuance and verification
   - REST authorization via bearer token
   - WebSocket authorization via connect headers

## Frontend Work Items

1. Persist `guestId` and `guestToken` together.
2. Add auth header helper in shared HTTP client.
3. Update guest bootstrap/validation flow to use token-backed auth.
4. Recreate STOMP client when guest auth changes and send connect headers.
5. Preserve backward compatibility with legacy `guestId`-only storage where possible.

## Verification Workflow

1. Backend tests for token issuance and controller authorization.
2. Frontend build or targeted typecheck for auth contract changes.
3. Local manual flow:
   - create
   - join
   - ready
   - start
   - first action
4. Deployed manual flow:
   - Safari/iPhone join
   - existing Chrome session still works

## Deployment Notes

- Add backend secret configuration for guest token signing:
  - `APP_GUEST_TOKEN_SECRET`
- Keep the value stable across deploys so active guest tokens remain valid during rollout.
- During transition, cookie settings can remain unchanged because token-based auth becomes the primary path.
