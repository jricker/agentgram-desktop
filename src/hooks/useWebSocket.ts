import { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { useChatStore } from "../stores/chatStore";
import { usePresenceStore } from "../stores/presenceStore";
import { useStreamingStore } from "../stores/streamingStore";
import { useTaskStore } from "../stores/taskStore";
import { useAgentStore } from "../stores/agentStore";
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
    const unsubAgents = useAgentStore.getState().initWsListeners();

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

    // Resync on every reconnect. WS has an auto-rejoin under the hood, but
    // any events the server pushed during the gap (while the socket was
    // closed or before the channel's onJoin fired) are gone. A REST refetch
    // of the active conversation's recent messages + the conversation list
    // + unread counts makes state converge to the server's truth.
    let firstConnect = true;
    const unsubReconnect = ws.on("connection_change", (payload) => {
      if (!payload.connected) return;
      joinActiveIfAny();
      if (firstConnect) {
        // Skip resync on the very first connect — we just loaded everything
        // from REST above. Only run it on subsequent connects (true reconnects).
        firstConnect = false;
        return;
      }
      console.log("[ws] reconnected → resyncing");
      useChatStore.getState().fetchConversations();
      useChatStore.getState().fetchUnreadCounts();
      const activeId = useChatStore.getState().activeConversationId;
      if (activeId) useChatStore.getState().fetchMessages(activeId);
    });

    // Fire initial loads — UI renders loading states from the store.
    // fetchTasks() also seeds taskLifecycleMeta[id].effectiveStatus from
    // the server's authoritative task list, which is critical for task
    // cards to render the correct status when the completion message is
    // outside the conversation's recent_messages window. Without this
    // a completed task still appears as "assigned" until the user visits
    // the Tasks tab for the first time.
    useChatStore.getState().fetchConversations();
    useChatStore.getState().fetchUnreadCounts();
    useTaskStore.getState().fetchTasks();
    // Agents bootstrap sequence:
    //   1. refreshProcessStatuses — populate local `processStatus` from Rust
    //      so we know which bridges are actually running on this machine.
    //   2. fetchAgents — pull the backend's view (may include stale
    //      `online: true` from last session's ExecutorRegistry entries).
    //   3. reconcileStaleExecutors — any agent the server thinks is online
    //      that has no local bridge is stale; call markAgentOffline. The
    //      backend then broadcasts `agent_status_changed online: false`,
    //      which the presence store applies to clear any leftover green dots.
    const agentStore = useAgentStore.getState();
    agentStore
      .refreshProcessStatuses()
      .then(() => agentStore.fetchAgents())
      .then(() => agentStore.reconcileStaleExecutors())
      .catch((e) =>
        console.warn("[useWebSocket] agent bootstrap failed", e)
      );

    return () => {
      unsubReconnect();
      unsubChat();
      unsubPresence();
      unsubStreaming();
      unsubTasks();
      unsubAgents();
      ws.disconnect();
    };
  }, [token, participantId]);
}
