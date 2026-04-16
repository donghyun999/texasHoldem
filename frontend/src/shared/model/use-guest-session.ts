import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createGuestSession } from "@/shared/api/http";
import { readPersistedGuestId, writePersistedGuestId } from "@/shared/model/guest-session-storage";
import { useUiStore } from "@/shared/model/ui-store";

const guestSessionBootstrapQueryKey = ["guest-session-bootstrap"] as const;

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
  const guestSessionQuery = useQuery({
    ...guestSessionQueryOptions,
    enabled: autoBootstrap && !guestId,
  });

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
    if (guestId.trim()) {
      return guestId.trim();
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
    isBootstrappingGuest: autoBootstrap && guestSessionQuery.isPending,
  };
}
