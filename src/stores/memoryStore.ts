import { create } from "zustand";
import { getConversationMemory } from "../lib/api";
import { ws } from "../services/websocket";
import type { ConversationMemory } from "../lib/api";

/**
 * Conversation memory — the summary / decisions / open questions that agents
 * consume on entry to a conversation and that the MemoryAutoSummaryWorker +
 * MemoryIdleSummaryWorker keep refreshed. Ported from
 * web/src/stores/memoryStore.ts with no behavior change.
 *
 * Cache keyed by conversation id. WS events `conv:conversation_memory` and
 * `conv:memory_updated` keep the cache live without a refetch.
 */

interface MemoryEntry {
  memory: ConversationMemory;
  version: number;
}

interface MemoryState {
  memories: Record<string, MemoryEntry>;
  loading: Record<string, boolean>;

  fetchMemory: (conversationId: string) => Promise<void>;
  initWsListeners: () => () => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  memories: {},
  loading: {},

  fetchMemory: async (conversationId) => {
    set((s) => ({ loading: { ...s.loading, [conversationId]: true } }));
    try {
      const data = await getConversationMemory(conversationId);
      set((s) => {
        // Only apply if strictly newer than what's already cached. A WS
        // `conversation_memory` event (pushed on channel join) frequently
        // races this REST round-trip and lands first; overwriting with a
        // stale REST version makes the panel render once, swap, and
        // visually "flash".
        const existing = s.memories[conversationId];
        if (existing && existing.version >= (data.version ?? 0)) {
          return { loading: { ...s.loading, [conversationId]: false } };
        }
        return {
          memories: {
            ...s.memories,
            [conversationId]: { memory: data.memory, version: data.version },
          },
          loading: { ...s.loading, [conversationId]: false },
        };
      });
    } catch (e) {
      console.warn(`[memory] fetchMemory(${conversationId}) failed`, e);
      set((s) => ({ loading: { ...s.loading, [conversationId]: false } }));
    }
  },

  initWsListeners: () => {
    const handleMemory = (payload: Record<string, unknown>) => {
      const convId = payload._conversationId as string;
      const memory = payload.memory as ConversationMemory;
      const version = (payload.version as number) ?? 0;
      if (!convId || !memory) return;
      set((s) => {
        const existing = s.memories[convId];
        if (existing && existing.version >= version) return s;
        return {
          memories: {
            ...s.memories,
            [convId]: { memory, version },
          },
        };
      });
    };

    const unsub1 = ws.on("conv:conversation_memory", handleMemory);
    const unsub2 = ws.on("conv:memory_updated", handleMemory);

    return () => {
      unsub1();
      unsub2();
    };
  },
}));
