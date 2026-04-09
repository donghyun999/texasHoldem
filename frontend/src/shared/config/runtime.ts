function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveRailwayApiBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const { protocol, hostname } = window.location;
  if (!hostname.endsWith(".up.railway.app") || !hostname.includes("frontend")) {
    return null;
  }

  const backendHostname = hostname.replace("frontend", "backend");
  if (backendHostname === hostname) {
    return null;
  }

  return trimTrailingSlash(`${protocol}//${backendHostname}`);
}

function resolveApiBaseUrl() {
  const explicitUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (explicitUrl) {
    return trimTrailingSlash(explicitUrl);
  }

  const railwayUrl = resolveRailwayApiBaseUrl();
  if (railwayUrl) {
    return railwayUrl;
  }

  return "http://localhost:8080";
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
