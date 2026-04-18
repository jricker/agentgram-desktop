import { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { useChatStore } from "../stores/chatStore";
import { usePresenceStore } from "../stores/presenceStore";
import { ws } from "../services/websocket";

/**
 * Connects the Phoenix socket, joins the user channel, wires store listeners,
 * and kicks off the initial conversations + unread-count fetches. Mount once
 * near the top of the authenticated tree. Tears everything down on logout.
 */
export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const participant = useAuthStore((s) => s.participant);

  useEffect(() => {
    if (!token || !participant) return;

    ws.connect(token);
    ws.joinUserChannel(participant.id);

    const unsubChat = useChatStore.getState().initWsListeners();
    const unsubPresence = usePresenceStore.getState().initWsListeners();

    // Fire initial loads — UI renders loading states from the store
    useChatStore.getState().fetchConversations();
    useChatStore.getState().fetchUnreadCounts();

    return () => {
      unsubChat();
      unsubPresence();
      ws.disconnect();
    };
  }, [token, participant]);
}
