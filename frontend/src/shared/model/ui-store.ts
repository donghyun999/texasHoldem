import { create } from "zustand";
import type { StackDisplayMode } from "@/features/table/model/stack-display";

const STORAGE_KEY = "texas-holdem-ui";

type UiState = {
  guestId: string;
  nickname: string;
  stackDisplayMode: StackDisplayMode;
  setGuestSession: (guestId: string, nickname: string) => void;
  setNickname: (nickname: string) => void;
  setStackDisplayMode: (mode: StackDisplayMode) => void;
};

type PersistedUiState = {
  guestId: string;
  nickname: string;
  stackDisplayMode: StackDisplayMode;
};

// Restores locally persisted guest identity for the current browser.
function readPersistedUiState(): PersistedUiState {
  if (typeof window === "undefined") {
    return { guestId: "", nickname: "player_one", stackDisplayMode: "chips" };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initialState = { guestId: "", nickname: "player_one", stackDisplayMode: "chips" as StackDisplayMode };
    writePersistedUiState(initialState);
    return initialState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;
    const nextState: PersistedUiState = {
      guestId: parsed.guestId?.trim() || "",
      nickname: parsed.nickname?.trim() || "player_one",
      stackDisplayMode: parsed.stackDisplayMode === "bb" ? "bb" : "chips",
    };
    writePersistedUiState(nextState);
    return nextState;
  } catch {
    const fallbackState = { guestId: "", nickname: "player_one", stackDisplayMode: "chips" as StackDisplayMode };
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
const initialState = readPersistedUiState();

export const useUiStore = create<UiState>((set) => ({
  guestId: initialState.guestId,
  nickname: initialState.nickname,
  stackDisplayMode: initialState.stackDisplayMode,
  setGuestSession: (guestId, nickname) =>
    set((state) => {
      const nextState = {
        guestId: guestId.trim(),
        nickname: nickname.trim() || "player_one",
        stackDisplayMode: state.stackDisplayMode,
      };
      writePersistedUiState(nextState);
      return nextState;
    }),
  setNickname: (nickname) =>
    set((state) => {
      const nextState = { guestId: state.guestId, nickname, stackDisplayMode: state.stackDisplayMode };
      writePersistedUiState(nextState);
      return { nickname };
    }),
  setStackDisplayMode: (stackDisplayMode) =>
    set((state) => {
      const nextState = { guestId: state.guestId, nickname: state.nickname, stackDisplayMode };
      writePersistedUiState(nextState);
      return { stackDisplayMode };
    }),
}));
