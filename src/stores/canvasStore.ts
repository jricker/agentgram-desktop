import { create } from "zustand";
import { getCanvasDefinition, listCanvasDefinitions } from "../lib/api";
import type { CanvasDefinitionSummary } from "../lib/api";

/**
 * Read-only canvas store for the desktop Canvas view.
 *
 * List endpoint returns summaries (no full `definition` JSON). When the
 * user picks a canvas, we lazy-fetch the full record via
 * `getCanvasDefinition(id)` and cache it in `details[id]`.
 */
interface CanvasState {
  definitions: CanvasDefinitionSummary[];
  loading: boolean;
  loadedAt: number;
  selectedId: string | null;
  /** Full records keyed by id — populated as the user selects each one. */
  details: Record<string, CanvasDefinitionSummary>;
  detailLoading: Record<string, boolean>;

  fetchDefinitions: () => Promise<void>;
  selectCanvas: (id: string | null) => void;
  fetchDetail: (id: string) => Promise<void>;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  definitions: [],
  loading: false,
  loadedAt: 0,
  selectedId: null,
  details: {},
  detailLoading: {},

  fetchDefinitions: async () => {
    set({ loading: true });
    try {
      const { definitions } = await listCanvasDefinitions();
      set({ definitions, loadedAt: Date.now() });
    } catch (e) {
      console.warn("[canvas] fetch failed", e);
    } finally {
      set({ loading: false });
    }
  },

  selectCanvas: (id) => {
    set({ selectedId: id });
    if (id && !get().details[id]) {
      get().fetchDetail(id);
    }
  },

  fetchDetail: async (id) => {
    set((s) => ({ detailLoading: { ...s.detailLoading, [id]: true } }));
    try {
      const full = await getCanvasDefinition(id);
      set((s) => ({
        details: { ...s.details, [id]: full },
        detailLoading: { ...s.detailLoading, [id]: false },
      }));
    } catch (e) {
      console.warn(`[canvas] fetchDetail(${id}) failed`, e);
      set((s) => ({ detailLoading: { ...s.detailLoading, [id]: false } }));
    }
  },
}));
