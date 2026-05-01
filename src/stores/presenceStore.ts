import { create } from "zustand";
import { ws } from "../services/websocket";

const HUMAN_TYPING_TTL_MS = 3_000;
const AGENT_TYPING_TTL_MS = 30_000;

interface PresenceState {
  connected: boolean;
  /** Reachable peers — humans currently WS-connected + agents whose bridge
   *  is online. Hosted-only agents are NOT in this set; consult
   *  `agentPresence` for their tri-state (online_local | online_hosted). */
  online: Set<string>;
  /** Per-agent tri-state presence. Populated for both our own agents and
   *  any external agent we share a conversation with — the backend pushes
   *  `agent_status_changed` to all conversation peers. Lets us render the
   *  cloud icon for a hosted_only agent owned by someone else. */
  agentPresence: Record<string, "online_local" | "online_hosted">;
  /** convId → Set of participantIds currently typing */
  typing: Record<string, Set<string>>;
  /** participantId → display name (for rendering "X is typing...") */
  typingNames: Record<string, string>;

  /** Drop a participant's typing indicator immediately (e.g. when their
   * message arrives — don't wait for the per-participant TTL). */
  clearTyping: (convId: string, participantId: string) => void;

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
    agentPresence: {},
    typing: {},
    typingNames: {},

    clearTyping,

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
       //
       // Tri-state: backend sends `presence: "online_local" | "online_hosted"
       // | "offline"`. Only `online_local` belongs in the `online` set —
       // hosted-only agents go into `agentPresence` so the UI can pick the
       // cloud icon instead of the green dot.
      unsubs.push(
        ws.on("agent_status_changed", (payload) => {
          const agentId = payload.agentId as string | undefined;
          if (!agentId) return;
          const presence = payload.presence as
            | "online_local"
            | "online_hosted"
            | "offline"
            | undefined;
          // Fall back to the boolean for older servers that didn't include
          // the tri-state field — treat any "online" as online_local.
          const effective: "online_local" | "online_hosted" | "offline" =
            presence ?? (payload.online ? "online_local" : "offline");

          set((s) => {
            const wasOnline = s.online.has(agentId);
            const wantOnline = effective === "online_local";
            const currentHosted = s.agentPresence[agentId];

            const onlineUnchanged = wasOnline === wantOnline;
            const hostedUnchanged =
              effective === "offline"
                ? currentHosted === undefined
                : currentHosted === effective;
            if (onlineUnchanged && hostedUnchanged) return s;

            const nextOnline = onlineUnchanged ? s.online : new Set(s.online);
            if (!onlineUnchanged) {
              if (wantOnline) nextOnline.add(agentId);
              else nextOnline.delete(agentId);
            }

            const nextAgentPresence = hostedUnchanged
              ? s.agentPresence
              : { ...s.agentPresence };
            if (!hostedUnchanged) {
              if (effective === "offline") delete nextAgentPresence[agentId];
              else nextAgentPresence[agentId] = effective;
            }

            return { online: nextOnline, agentPresence: nextAgentPresence };
          });
        })
      );

      unsubs.push(
        ws.on("human_status_changed", (payload) => {
          const participantId = payload.participantId as string | undefined;
          if (!participantId) return;
          const isOnline = Boolean(payload.online);
          set((s) => {
            if (isOnline === s.online.has(participantId)) return s;
            const next = new Set(s.online);
            if (isOnline) next.add(participantId);
            else next.delete(participantId);
            return { online: next };
          });
        })
      );

      // Authoritative snapshot from server on user-channel join. Resets
      // the global online set so peers who went offline during our
      // disconnect are cleared. Subsequent transitions update from there.
      //
      // `agentPresences` carries the tri-state for agent peers — humans and
      // bridge-online agents are in `onlineParticipantIds`; hosted-only
      // agents only appear in the map (they aren't WS-reachable). Drop
      // hosted-only ids out of `online` so they show as cloud, not dot.
      unsubs.push(
        ws.on("presence_snapshot", (payload) => {
          const ids = (payload.onlineParticipantIds as string[] | undefined) ?? [];
          const agentPresences =
            (payload.agentPresences as
              | Record<string, "online_local" | "online_hosted">
              | undefined) ?? {};
          const onlineSet = new Set(ids);
          for (const [id, presence] of Object.entries(agentPresences)) {
            if (presence === "online_hosted") onlineSet.delete(id);
          }
          set({ online: onlineSet, agentPresence: agentPresences });
        })
      );

      // In-conversation typing: backend broadcasts "typing" (snake_case
      // payload) on the conversation channel; the websocket service forwards
      // it as "conv:typing". This is what fires while the user is viewing
      // the conversation. There is no explicit "stopped typing" event —
      // the per-participant TTL inside setTyping clears it (and chatStore
      // also clears it the moment the sender's message arrives).
      unsubs.push(
        ws.on("conv:typing", (payload) => {
          const convId = payload._conversationId as string;
          const participantId = payload.participant_id as string | undefined;
          const displayName = payload.display_name as string | undefined;
          const participantType = payload.participant_type as string | undefined;
          if (!convId || !participantId) return;
          setTyping(convId, participantId, displayName, participantType === "agent");
        })
      );

      // Cross-conversation typing: backend pushes "typing_indicator"
      // (camelCase payload) on the user channel — drives typing markers
      // in the conversation list for conversations the user isn't open in.
      unsubs.push(
        ws.on("typing_indicator", (payload) => {
          const convId = payload.conversationId as string | undefined;
          const participantId = payload.participantId as string | undefined;
          const displayName = payload.participantName as string | undefined;
          const participantType = payload.participantType as string | undefined;
          const isTyping = Boolean(payload.isTyping);
          if (!convId || !participantId) return;
          if (isTyping) {
            setTyping(convId, participantId, displayName, participantType === "agent");
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
