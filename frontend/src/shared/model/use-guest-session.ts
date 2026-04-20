import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createGuestSession, getActiveTournamentForCurrentGuest, isUnauthorizedError } from "@/shared/api/http";
import {
  clearPersistedGuestId,
  readPersistedGuestId,
  writePersistedGuestId,
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
  const nickname = useUiStore((state) => state.nickname);
  const setNickname = useUiStore((state) => state.setNickname);
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
    enabled: !!guestId.trim(),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const guestSessionQuery = useQuery({
    ...guestSessionQueryOptions,
    enabled: autoBootstrap && !guestId && !guestSessionValidationQuery.isPending,
  });

  useEffect(() => {
    if (guestSessionValidationQuery.data !== false) {
      return;
    }

    setGuestId("");
    clearPersistedGuestId();
    void queryClient.resetQueries({ queryKey: guestSessionBootstrapQueryKey, exact: true });
  }, [guestSessionValidationQuery.data, queryClient]);

  // Stores the backend-issued guest identity once the bootstrap request completes.
  useEffect(() => {
    if (!guestSessionQuery.data) {
      return;
    }

    setGuestId(guestSessionQuery.data.guestId);
    writePersistedGuestId(guestSessionQuery.data.guestId);
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
        clearPersistedGuestId();
      }
    }

    const session = await queryClient.fetchQuery(guestSessionQueryOptions);
    setGuestId(session.guestId);
    writePersistedGuestId(session.guestId);
    setNickname(session.nickname);
    return session.guestId;
  }

  return {
    guestId,
    nickname,
    setNickname,
    ensureGuestSession,
    isBootstrappingGuest: (autoBootstrap && guestSessionQuery.isPending) || guestSessionValidationQuery.isPending,
  };
}
