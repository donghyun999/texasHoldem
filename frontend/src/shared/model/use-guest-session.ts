import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createGuestSession } from "@/shared/api/http";
import { useUiStore } from "@/shared/model/ui-store";

// Bootstraps one persisted guest session from the backend when the browser has none yet.
export function useGuestSession() {
  const guestId = useUiStore((state) => state.guestId);
  const nickname = useUiStore((state) => state.nickname);
  const setGuestSession = useUiStore((state) => state.setGuestSession);
  const setNickname = useUiStore((state) => state.setNickname);
  const guestSessionQuery = useQuery({
    queryKey: ["guest-session-bootstrap"],
    queryFn: () => createGuestSession(nickname),
    enabled: !guestId,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
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

    const session = await createGuestSession(nickname);
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
