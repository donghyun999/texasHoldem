const STORAGE_KEY = "texas-holdem-guest-session";

function readStoredGuestIdFromStorage(storageKey: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return "";
  }

  try {
    const parsed = JSON.parse(raw) as { guestId?: string };
    return parsed.guestId?.trim() || "";
  } catch {
    return "";
  }
}

export function readPersistedGuestId() {
  const guestId = readStoredGuestIdFromStorage(STORAGE_KEY);
  if (guestId) {
    return guestId;
  }

  return readStoredGuestIdFromStorage("texas-holdem-ui");
}

export function writePersistedGuestId(guestId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedGuestId = guestId.trim();
  if (!normalizedGuestId) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ guestId: normalizedGuestId }));
}

export function clearPersistedGuestId() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
