const STORAGE_KEY = "texas-holdem-guest-session";

type PersistedGuestAuth = {
  guestId?: string;
  guestToken?: string;
};

function readStoredGuestAuthFromStorage(storageKey: string): PersistedGuestAuth | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedGuestAuth;
    return {
      guestId: parsed.guestId?.trim() || "",
      guestToken: parsed.guestToken?.trim() || "",
    };
  } catch {
    return null;
  }
}

export function readPersistedGuestId() {
  const auth = readStoredGuestAuthFromStorage(STORAGE_KEY);
  if (auth?.guestId) {
    return auth.guestId;
  }

  return readStoredGuestAuthFromStorage("texas-holdem-ui")?.guestId || "";
}

export function readPersistedGuestToken() {
  return readStoredGuestAuthFromStorage(STORAGE_KEY)?.guestToken || "";
}

export function writePersistedGuestAuth(guestId: string, guestToken?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedGuestId = guestId.trim();
  const normalizedGuestToken = guestToken?.trim() || "";
  if (!normalizedGuestId) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      guestId: normalizedGuestId,
      ...(normalizedGuestToken ? { guestToken: normalizedGuestToken } : {}),
    }),
  );
}

export function writePersistedGuestId(guestId: string) {
  writePersistedGuestAuth(guestId, readPersistedGuestToken());
}

export function writePersistedGuestToken(guestToken: string) {
  const currentGuestId = readPersistedGuestId();
  if (!currentGuestId) {
    return;
  }
  writePersistedGuestAuth(currentGuestId, guestToken);
}

export function clearPersistedGuestId() {
  if (typeof window === "undefined") {
      return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
