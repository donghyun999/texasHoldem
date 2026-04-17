import type {
  ActiveTournamentSession,
  PublicTournamentSummary,
  TournamentEvent,
  TournamentSnapshot,
  TournamentVisibility,
} from "@/entities/tournament/model/types";
import { API_BASE_URL } from "@/shared/config/runtime";

export type GuestSession = {
  guestId: string;
  nickname: string;
};

export type BackendStatus = {
  service: string;
  status: string;
  mode: string;
  timestamp: string;
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
};

type ErrorPayload = {
  message?: string;
  error?: string;
  detail?: string;
  title?: string;
};

type HttpError = Error & {
  status: number;
  path: string;
};

// Extracts the most useful server-side failure message for the UI.
async function buildError(response: Response, path: string) {
  try {
    const payload = (await response.json()) as Partial<ApiResponse<unknown>> & ErrorPayload;
    const message =
      payload.message?.trim() ||
      payload.detail?.trim() ||
      payload.error?.trim() ||
      payload.title?.trim();
    const error = new Error(message || `Request failed for ${path}`) as HttpError;
    error.status = response.status;
    error.path = path;
    return error;
  } catch {
    const error = new Error(`Request failed for ${path}`) as HttpError;
    error.status = response.status;
    error.path = path;
    return error;
  }
}

function canFallbackToLegacy(error: unknown) {
  return error instanceof Error && "status" in error && typeof (error as HttpError).status === "number" && [400, 404, 405].includes((error as HttpError).status);
}

// Reads a typed API payload and normalizes transport failures into one error path.
async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await buildError(response, path);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

// Sends a typed JSON body and reuses the shared API envelope parser.
async function postJson<TRequest, TResponse>(
  path: string,
  body: TRequest,
  init?: RequestInit,
): Promise<TResponse> {
  const { headers: initHeaders, credentials: initCredentials, ...restInit } = init ?? {};
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(initHeaders ?? {}),
    },
    body: JSON.stringify(body),
    ...restInit,
    credentials: initCredentials ?? "include",
  });

  if (!response.ok) {
    throw await buildError(response, path);
  }

  const payload = (await response.json()) as ApiResponse<TResponse>;
  return payload.data;
}

// Fetches backend liveness information for the landing screen.
export function getBackendStatus(): Promise<BackendStatus> {
  return fetchJson<BackendStatus>("/api/v1/status");
}

// Creates a backend-issued guest session that the browser can persist locally.
export function createGuestSession(nickname: string): Promise<GuestSession> {
  return postJson<{ nickname: string }, GuestSession>("/api/v1/guests", { nickname });
}

// Finds the active non-finished tournament for the current session, falling back to legacy guest identity when needed.
export async function getActiveTournamentForCurrentGuest(legacyGuestId?: string): Promise<ActiveTournamentSession | null> {
  try {
    return await fetchJson<ActiveTournamentSession | null>("/api/v1/guests/me/active-tournament");
  } catch (error) {
    if (legacyGuestId?.trim() && canFallbackToLegacy(error)) {
      return getActiveTournamentForGuest(legacyGuestId);
    }

    if (canFallbackToLegacy(error)) {
      return null;
    }

    throw error;
  }
}

// Finds the active non-finished tournament already occupied by one guest, when present.
export function getActiveTournamentForGuest(guestId: string): Promise<ActiveTournamentSession | null> {
  return fetchJson<ActiveTournamentSession | null>(`/api/v1/guests/${guestId}/active-tournament`);
}

// Fetches the latest tournament snapshot from the backend API using the current session when available.
export function getTournamentSnapshot(code: string, guestId?: string): Promise<TournamentSnapshot> {
  return fetchJson<TournamentSnapshot>(`/api/v1/tournaments/${code}`).catch((error) => {
    if (guestId?.trim() && canFallbackToLegacy(error)) {
      const params = new URLSearchParams();
      params.set("guestId", guestId.trim());
      return fetchJson<TournamentSnapshot>(`/api/v1/tournaments/${code}?${params.toString()}`);
    }

    throw error;
  });
}

// Fetches the current list of joinable waiting rooms for the lobby.
export function getPublicWaitingTournaments(): Promise<PublicTournamentSummary[]> {
  return fetchJson<PublicTournamentSummary[]>("/api/v1/tournaments/lobby/public");
}

// Creates one waiting tournament and immediately seats the owner.
export function createTournament(
  guestId: string,
  nickname: string,
  roomName: string,
  visibility: TournamentVisibility,
  password?: string,
): Promise<TournamentSnapshot> {
  return postJson<
    { nickname: string; roomName: string; visibility: TournamentVisibility; password?: string },
    TournamentSnapshot
  >(
    "/api/v1/tournaments",
    {
      nickname,
      roomName,
      visibility,
      ...(password ? { password } : {}),
    },
  ).catch((error) => {
    if (guestId.trim() && canFallbackToLegacy(error)) {
      return postJson<
        { guestId: string; nickname: string; roomName: string; visibility: TournamentVisibility; password?: string },
        TournamentSnapshot
      >("/api/v1/tournaments", {
        guestId,
        nickname,
        roomName,
        visibility,
        ...(password ? { password } : {}),
      });
    }

    throw error;
  });
}

// Creates one waiting tournament and immediately seats the owner using the current session when available.
export function createTournamentForCurrentGuest(
  nickname: string,
  roomName: string,
  visibility: TournamentVisibility,
  password?: string,
  guestId?: string,
): Promise<TournamentSnapshot> {
  return postJson<
    { nickname: string; roomName: string; visibility: TournamentVisibility; password?: string },
    TournamentSnapshot
  >(
    "/api/v1/tournaments",
    {
      nickname,
      roomName,
      visibility,
      ...(password ? { password } : {}),
    },
  ).catch((error) => {
    if (guestId?.trim() && canFallbackToLegacy(error)) {
      return createTournament(guestId, nickname, roomName, visibility, password);
    }

    throw error;
  });
}

// Joins one waiting tournament with the current persisted guest identity and optional room password.
export function joinTournament(
  code: string,
  guestId: string,
  nickname: string,
  password?: string,
): Promise<TournamentSnapshot> {
  return postJson<{ guestId: string; nickname: string; password?: string }, TournamentSnapshot>(
    `/api/v1/tournaments/${code}/join`,
    {
      guestId,
      nickname,
      ...(password ? { password } : {}),
    },
  );
}

// Joins one waiting tournament using the current session when available.
export function joinTournamentForCurrentGuest(
  code: string,
  nickname: string,
  password?: string,
  guestId?: string,
): Promise<TournamentSnapshot> {
  return postJson<{ nickname: string; password?: string }, TournamentSnapshot>(`/api/v1/tournaments/${code}/join`, {
    nickname,
    ...(password ? { password } : {}),
  }).catch((error) => {
    if (guestId?.trim() && canFallbackToLegacy(error)) {
      return joinTournament(code, guestId, nickname, password);
    }

    throw error;
  });
}

// Notifies the backend that one player left the current tournament page.
export function disconnectTournamentPlayer(
  code: string,
  guestId: string,
  init?: RequestInit,
): Promise<TournamentEvent> {
  return postJson<{ guestId: string }, TournamentEvent>(
    `/api/v1/tournaments/${code}/disconnect`,
    { guestId },
    init,
  );
}
