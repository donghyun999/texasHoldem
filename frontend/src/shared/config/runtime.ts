function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveApiBaseUrl() {
  return trimTrailingSlash(import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8080");
}

function resolveTournamentWsUrl(apiBaseUrl: string) {
  const explicitUrl = import.meta.env.VITE_TOURNAMENT_WS_URL?.trim();
  if (explicitUrl) {
    return trimTrailingSlash(explicitUrl);
  }

  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return trimTrailingSlash(url.toString());
}

export const API_BASE_URL = resolveApiBaseUrl();
export const TOURNAMENT_WS_URL = resolveTournamentWsUrl(API_BASE_URL);
