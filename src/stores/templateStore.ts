import { create } from "zustand";
import { listResponseTemplates } from "../lib/api";
import type { ResponseTemplate } from "../lib/api";

/**
 * Read-only template store for the desktop Templates view.
 *
 * Desktop treats the Templates section as a reference / preview surface —
 * creation and editing happen in the web app. If we ever add inline editing
 * here, extend this with `createTemplate`, `updateTemplate`, `deleteTemplate`.
 */
interface TemplateState {
  templates: ResponseTemplate[];
  loading: boolean;
  loadedAt: number;
  selectedId: string | null;

  fetchTemplates: () => Promise<void>;
  selectTemplate: (id: string | null) => void;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  loading: false,
  loadedAt: 0,
  selectedId: null,

  fetchTemplates: async () => {
    set({ loading: true });
    try {
      const { templates } = await listResponseTemplates();
      set({ templates, loadedAt: Date.now() });
    } catch (e) {
      console.warn("[templates] fetch failed", e);
    } finally {
      set({ loading: false });
    }
  },

  selectTemplate: (id) => set({ selectedId: id }),
}));
