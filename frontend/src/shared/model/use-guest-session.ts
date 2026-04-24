import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createGuestSession, getActiveTournamentForCurrentGuest, isUnauthorizedError } from "@/shared/api/http";
import {
  clearPersistedGuestId,
  readPersistedGuestId,
  readPersistedGuestToken,
  writePersistedGuestAuth,
} from "@/shared/model/guest-session-storage";
import { useUiStore } from "@/shared/model/ui-store";

const guestSessionBootstrapQueryKey = ["guest-session-bootstrap"] as const;
const guestSessionValidationQueryKey = ["guest-session-validation"] as const;

type UseGuestSessionOptions = {
  autoBootstrap?: boolean;
};

// Optionally bootstraps one persisted guest session from the backend when the browser has none yet.
export function useGuestSession({ autoBootstrap = true }: UseGuestSessionOptions = {}) {
  const queryClient = useQueryClient();
  const [guestId, setGuestId] = useState(() => readPersistedGuestId());
  const [guestToken, setGuestToken] = useState(() => readPersistedGuestToken());
  const nickname = useUiStore((state) => state.nickname);
  const setNickname = useUiStore((state) => state.setNickname);
  const persistedGuestId = guestId.trim();
  const guestSessionQueryOptions = {
    queryKey: guestSessionBootstrapQueryKey,
    queryFn: () => createGuestSession(nickname),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  } as const;
  const guestSessionValidationQuery = useQuery({
    queryKey: [...guestSessionValidationQueryKey, guestId] as const,
    queryFn: async () => {
      try {
        await getActiveTournamentForCurrentGuest();
        return true;
      } catch (error) {
        if (isUnauthorizedError(error)) {
          return false;
        }

        throw error;
      }
    },
    enabled: !!persistedGuestId,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const isValidatingPersistedGuest =
    !!persistedGuestId && guestSessionValidationQuery.fetchStatus === "fetching";
  const guestSessionQuery = useQuery({
    ...guestSessionQueryOptions,
    enabled: autoBootstrap && !persistedGuestId && !isValidatingPersistedGuest,
  });
  const isBootstrappingGuest =
    isValidatingPersistedGuest || (autoBootstrap && guestSessionQuery.fetchStatus === "fetching");

  useEffect(() => {
    if (guestSessionValidationQuery.data !== false) {
      return;
    }

    setGuestId("");
    setGuestToken("");
    clearPersistedGuestId();
    void queryClient.resetQueries({ queryKey: guestSessionBootstrapQueryKey, exact: true });
  }, [guestSessionValidationQuery.data, queryClient]);

  // Stores the backend-issued guest identity once the bootstrap request completes.
  useEffect(() => {
    if (!guestSessionQuery.data) {
      return;
    }

    setGuestId(guestSessionQuery.data.guestId);
    setGuestToken(guestSessionQuery.data.guestToken);
    writePersistedGuestAuth(guestSessionQuery.data.guestId, guestSessionQuery.data.guestToken);
    setNickname(guestSessionQuery.data.nickname);
  }, [guestSessionQuery.data, setNickname]);

  async function ensureGuestSession() {
    const persistedGuestId = guestId.trim();
    if (persistedGuestId) {
      try {
        await queryClient.fetchQuery({
          queryKey: [...guestSessionValidationQueryKey, persistedGuestId] as const,
          queryFn: async () => {
            await getActiveTournamentForCurrentGuest();
            return true;
          },
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        });
        return persistedGuestId;
      } catch (error) {
        if (!isUnauthorizedError(error)) {
          throw error;
        }

        setGuestId("");
        setGuestToken("");
        clearPersistedGuestId();
      }
    }

    const session = await queryClient.fetchQuery(guestSessionQueryOptions);
    setGuestId(session.guestId);
    setGuestToken(session.guestToken);
    writePersistedGuestAuth(session.guestId, session.guestToken);
    setNickname(session.nickname);
    return session.guestId;
  }

  return {
    guestId,
    guestToken,
    nickname,
    setNickname,
    ensureGuestSession,
    isBootstrappingGuest,
  };
}
