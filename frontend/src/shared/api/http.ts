import type { ActiveTournamentSession, TournamentEvent, TournamentSnapshot } from "@/entities/tournament/model/types";
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

// Extracts the most useful server-side failure message for the UI.
async function buildError(response: Response, path: string) {
  try {
    const payload = (await response.json()) as Partial<ApiResponse<unknown>> & ErrorPayload;
    const message =
      payload.message?.trim() ||
      payload.detail?.trim() ||
      payload.error?.trim() ||
      payload.title?.trim();
    return new Error(message || `Request failed for ${path}`);
  } catch {
    return new Error(`Request failed for ${path}`);
  }
}

// Reads a typed API payload and normalizes transport failures into one error path.
async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    ...init,
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

// Finds the active non-finished tournament already occupied by one guest, when present.
export function getActiveTournamentForGuest(guestId: string): Promise<ActiveTournamentSession | null> {
  return fetchJson<ActiveTournamentSession | null>(`/api/v1/guests/${guestId}/active-tournament`);
}

// Fetches the latest tournament snapshot from the backend API.
export function getTournamentSnapshot(code: string, guestId?: string): Promise<TournamentSnapshot> {
  const params = new URLSearchParams();
  if (guestId?.trim()) {
    params.set("guestId", guestId.trim());
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";
  return fetchJson<TournamentSnapshot>(`/api/v1/tournaments/${code}${query}`);
}

// Creates one waiting tournament and immediately seats the owner.
export function createTournament(guestId: string, nickname: string, code?: string): Promise<TournamentSnapshot> {
  return postJson<{ guestId: string; nickname: string; code?: string }, TournamentSnapshot>("/api/v1/tournaments", {
    guestId,
    nickname,
    ...(code ? { code } : {}),
  });
}

// Joins one waiting tournament with the current persisted guest identity.
export function joinTournament(code: string, guestId: string, nickname: string): Promise<TournamentSnapshot> {
  return postJson<{ guestId: string; nickname: string }, TournamentSnapshot>(`/api/v1/tournaments/${code}/join`, {
    guestId,
    nickname,
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
