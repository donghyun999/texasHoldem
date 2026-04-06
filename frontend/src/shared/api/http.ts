import type { TournamentSnapshot } from "@/entities/tournament/model/types";

const API_BASE_URL = "http://localhost:8080";

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

// Reads a typed API payload and normalizes transport failures into one error path.
async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

// Fetches backend liveness information for the landing screen.
export function getBackendStatus(): Promise<BackendStatus> {
  return fetchJson<BackendStatus>("/api/v1/status");
}

// Fetches the latest tournament snapshot from the backend API.
export function getTournamentSnapshot(code: string): Promise<TournamentSnapshot> {
  return fetchJson<TournamentSnapshot>(`/api/v1/tournaments/${code}`);
}
