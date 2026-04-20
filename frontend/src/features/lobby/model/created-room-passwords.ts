const STORAGE_KEY = "texas-holdem-created-room-passwords";

type StoredRoomPasswords = Record<string, string>;

function readStoredRoomPasswords(): StoredRoomPasswords {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as StoredRoomPasswords;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredRoomPasswords(passwords: StoredRoomPasswords) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(passwords));
}

export function rememberCreatedRoomPassword(code: string, password: string) {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedPassword = password.trim();
  if (!normalizedCode || !normalizedPassword) {
    return;
  }

  writeStoredRoomPasswords({
    ...readStoredRoomPasswords(),
    [normalizedCode]: normalizedPassword,
  });
}

export function findCreatedRoomPassword(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const storedPassword = readStoredRoomPasswords()[normalizedCode];
  return storedPassword?.trim() ? storedPassword.trim() : null;
}
