import { create } from "zustand";

const STORAGE_KEY = "texas-holdem-ui";

type UiState = {
  guestId: string;
  nickname: string;
  setNickname: (nickname: string) => void;
};

type PersistedUiState = {
  guestId: string;
  nickname: string;
};

// Restores locally persisted guest identity for the current browser.
function readPersistedUiState(): PersistedUiState {
  if (typeof window === "undefined") {
    return { guestId: createGuestId(), nickname: "player_one" };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initialState = { guestId: createGuestId(), nickname: "player_one" };
    writePersistedUiState(initialState);
    return initialState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;
    const nextState = {
      guestId: parsed.guestId?.trim() || createGuestId(),
      nickname: parsed.nickname?.trim() || "player_one",
    };
    writePersistedUiState(nextState);
    return nextState;
  } catch {
    const fallbackState = { guestId: createGuestId(), nickname: "player_one" };
    writePersistedUiState(fallbackState);
    return fallbackState;
  }
}

// Persists the guest identity that drives tournament joins.
function writePersistedUiState(state: PersistedUiState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Creates a short guest id that is stable across reloads once persisted.
function createGuestId() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

const initialState = readPersistedUiState();

export const useUiStore = create<UiState>((set) => ({
  guestId: initialState.guestId,
  nickname: initialState.nickname,
  setNickname: (nickname) =>
    set((state) => {
      const nextState = { guestId: state.guestId, nickname };
      writePersistedUiState(nextState);
      return { nickname };
    }),
}));
