import { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { useChatStore } from "../stores/chatStore";
import { usePresenceStore } from "../stores/presenceStore";
import { useStreamingStore } from "../stores/streamingStore";
import { useTaskStore } from "../stores/taskStore";
import { ws } from "../services/websocket";

/**
 * Connects the Phoenix socket, joins the user channel, wires store listeners,
 * and kicks off the initial conversations + unread-count fetches. Mount once
 * near the top of the authenticated tree. Tears everything down on logout.
 *
 * Deps are *primitive* (`token`, `participantId`) rather than the full
 * participant object. authStore.restoreSession() sets a participant from
 * localStorage and then fetchProfile() overwrites it with a fresh API
 * response — same id, different object reference. If we depended on the
 * object, every profile refresh would disconnect + reconnect the socket,
 * opening a gap where pushed messages are missed. Depending on the id
 * keeps the socket stable across profile refreshes.
 */
export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const participantId = useAuthStore((s) => s.participant?.id);

  useEffect(() => {
    if (!token || !participantId) return;

    ws.connect(token);
    ws.joinUserChannel(participantId);

    const unsubChat = useChatStore.getState().initWsListeners();
    const unsubPresence = usePresenceStore.getState().initWsListeners();
    const unsubStreaming = useStreamingStore.getState().initWsListeners();
    const unsubTasks = useTaskStore.getState().initWsListeners();

    // Re-join whichever conversation is currently open whenever the socket
    // comes up. Fixes a missed-message bug where `disconnect()` clears the
    // conversation-channel map, and we only re-joined `user:{id}` on the
    // next connect — the active conversation's channel stayed dead until
    // the user navigated away and back. Now every connect also re-subscribes
    // to the active conv (joinConversation is a no-op if already joined).
    const joinActiveIfAny = () => {
      const activeId = useChatStore.getState().activeConversationId;
      if (activeId) ws.joinConversation(activeId);
    };
    joinActiveIfAny();
    const unsubReconnect = ws.on("connection_change", (payload) => {
      if (payload.connected) joinActiveIfAny();
    });

    // Fire initial loads — UI renders loading states from the store
    useChatStore.getState().fetchConversations();
    useChatStore.getState().fetchUnreadCounts();

    return () => {
      unsubReconnect();
      unsubChat();
      unsubPresence();
      unsubStreaming();
      unsubTasks();
      ws.disconnect();
    };
  }, [token, participantId]);
}
