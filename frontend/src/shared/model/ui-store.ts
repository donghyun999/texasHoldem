import { create } from "zustand";
import type { StackDisplayMode } from "@/features/table/model/stack-display";
import { writePersistedGuestId } from "@/shared/model/guest-session-storage";

const STORAGE_KEY = "texas-holdem-ui";

type UiState = {
  nickname: string;
  stackDisplayMode: StackDisplayMode;
  setNickname: (nickname: string) => void;
  setStackDisplayMode: (mode: StackDisplayMode) => void;
};

type PersistedUiState = {
  nickname: string;
  stackDisplayMode: StackDisplayMode;
};

// Restores locally persisted guest identity for the current browser.
function readPersistedUiState(): PersistedUiState {
  if (typeof window === "undefined") {
    return { nickname: "", stackDisplayMode: "chips" };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initialState = { nickname: "", stackDisplayMode: "chips" as StackDisplayMode };
    writePersistedUiState(initialState);
    return initialState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;
    const legacyParsed = parsed as Partial<PersistedUiState & { guestId: string }>;
    if (legacyParsed.guestId?.trim()) {
      writePersistedGuestId(legacyParsed.guestId);
    }

    const nextState: PersistedUiState = {
      nickname: parsed.nickname?.trim() || "",
      stackDisplayMode: parsed.stackDisplayMode === "bb" ? "bb" : "chips",
    };
    writePersistedUiState(nextState);
    return nextState;
  } catch {
    const fallbackState = { nickname: "", stackDisplayMode: "chips" as StackDisplayMode };
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
  nickname: initialState.nickname,
  stackDisplayMode: initialState.stackDisplayMode,
  setNickname: (nickname) =>
    set((state) => {
      const nextState = { nickname, stackDisplayMode: state.stackDisplayMode };
      writePersistedUiState(nextState);
      return { nickname };
    }),
  setStackDisplayMode: (stackDisplayMode) =>
    set((state) => {
      const nextState = { nickname: state.nickname, stackDisplayMode };
      writePersistedUiState(nextState);
      return { stackDisplayMode };
    }),
}));
