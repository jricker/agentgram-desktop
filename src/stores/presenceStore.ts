import { create } from "zustand";
import { ws } from "../services/websocket";

const HUMAN_TYPING_TTL_MS = 3_000;
const AGENT_TYPING_TTL_MS = 30_000;

interface PresenceState {
  connected: boolean;
  online: Set<string>;
  /** convId → Set of participantIds currently typing */
  typing: Record<string, Set<string>>;
  /** participantId → display name (for rendering "X is typing...") */
  typingNames: Record<string, string>;

  initWsListeners: () => () => void;
}

export const usePresenceStore = create<PresenceState>((set) => {
  // Per-key timer (keyed "convId:participantId") so we can cancel/refresh
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearTyping(convId: string, participantId: string) {
    const key = `${convId}:${participantId}`;
    const timer = typingTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      typingTimers.delete(key);
    }
    set((s) => {
      const current = s.typing[convId];
      if (!current || !current.has(participantId)) return s;
      const next = new Set(current);
      next.delete(participantId);
      return { typing: { ...s.typing, [convId]: next } };
    });
  }

  function setTyping(
    convId: string,
    participantId: string,
    displayName: string | undefined,
    isAgent: boolean
  ) {
    const key = `${convId}:${participantId}`;
    const prev = typingTimers.get(key);
    if (prev) clearTimeout(prev);
    const ttl = isAgent ? AGENT_TYPING_TTL_MS : HUMAN_TYPING_TTL_MS;
    typingTimers.set(
      key,
      setTimeout(() => clearTyping(convId, participantId), ttl)
    );

    set((s) => {
      const current = s.typing[convId] ?? new Set();
      if (current.has(participantId) && s.typingNames[participantId] === displayName) {
        return s;
      }
      const next = new Set(current);
      next.add(participantId);
      return {
        typing: { ...s.typing, [convId]: next },
        typingNames: displayName
          ? { ...s.typingNames, [participantId]: displayName }
          : s.typingNames,
      };
    });
  }

  return {
    connected: false,
    online: new Set(),
    typing: {},
    typingNames: {},

    initWsListeners: () => {
      const unsubs: (() => void)[] = [];

      unsubs.push(
        ws.on("connection_change", (payload) => {
          set({ connected: Boolean(payload.connected) });
        })
      );

      unsubs.push(
        ws.on("conv:presence_state", (payload) => {
          const state = payload as Record<string, unknown>;
          const ids = Object.keys(state).filter(
            (k) => !k.startsWith("_") && typeof state[k] === "object"
          );
          set((s) => {
            const next = new Set(s.online);
            ids.forEach((id) => next.add(id));
            return { online: next };
          });
        })
      );

      unsubs.push(
        ws.on("conv:presence_diff", (payload) => {
          const joins = (payload.joins as Record<string, unknown>) ?? {};
          const leaves = (payload.leaves as Record<string, unknown>) ?? {};
          set((s) => {
            const next = new Set(s.online);
            Object.keys(joins).forEach((id) => next.add(id));
            Object.keys(leaves).forEach((id) => next.delete(id));
            return { online: next };
          });
        })
      );

      // Agents go online/offline via the user channel — they never show up in
       // a conversation's presence roster (bridge processes aren't Phoenix
       // sockets). Without this handler the Chats presence dot is frozen at
       // whatever state the conversation load initially reported.
      unsubs.push(
        ws.on("agent_status_changed", (payload) => {
          const agentId = payload.agentId as string | undefined;
          if (!agentId) return;
          const isOnline = Boolean(payload.online);
          set((s) => {
            if (isOnline === s.online.has(agentId)) return s;
            const next = new Set(s.online);
            if (isOnline) next.add(agentId);
            else next.delete(agentId);
            return { online: next };
          });
        })
      );

      unsubs.push(
        ws.on("conv:typing_indicator", (payload) => {
          const convId = payload._conversationId as string;
          const participantId = payload.participantId as string | undefined;
          const displayName = payload.displayName as string | undefined;
          const isAgent = Boolean(payload.isAgent);
          const isTyping = Boolean(payload.isTyping);
          if (!convId || !participantId) return;
          if (isTyping) {
            setTyping(convId, participantId, displayName, isAgent);
          } else {
            clearTyping(convId, participantId);
          }
        })
      );

      return () => {
        unsubs.forEach((u) => u());
        typingTimers.forEach((t) => clearTimeout(t));
        typingTimers.clear();
      };
    },
  };
});
