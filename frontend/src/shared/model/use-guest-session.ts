import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createGuestSession } from "@/shared/api/http";
import { useUiStore } from "@/shared/model/ui-store";

const guestSessionBootstrapQueryKey = ["guest-session-bootstrap"] as const;

// Bootstraps one persisted guest session from the backend when the browser has none yet.
export function useGuestSession() {
  const queryClient = useQueryClient();
  const guestId = useUiStore((state) => state.guestId);
  const nickname = useUiStore((state) => state.nickname);
  const setGuestSession = useUiStore((state) => state.setGuestSession);
  const setNickname = useUiStore((state) => state.setNickname);
  const guestSessionQueryOptions = {
    queryKey: guestSessionBootstrapQueryKey,
    queryFn: () => createGuestSession(nickname),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  } as const;
  const guestSessionQuery = useQuery({
    ...guestSessionQueryOptions,
    enabled: !guestId,
  });

  // Stores the backend-issued guest identity once the bootstrap request completes.
  useEffect(() => {
    if (!guestSessionQuery.data) {
      return;
    }

    setGuestSession(guestSessionQuery.data.guestId, guestSessionQuery.data.nickname);
  }, [guestSessionQuery.data, setGuestSession]);

  async function ensureGuestSession() {
    if (guestId.trim()) {
      return guestId.trim();
    }

    const session = await queryClient.fetchQuery(guestSessionQueryOptions);
    setGuestSession(session.guestId, session.nickname);
    return session.guestId;
  }

  return {
    guestId,
    nickname,
    setNickname,
    ensureGuestSession,
    isBootstrappingGuest: guestSessionQuery.isPending,
  };
}
