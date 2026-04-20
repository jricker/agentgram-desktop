import { create } from "zustand";
import {
  listResponseTemplates,
  createResponseTemplate,
  updateResponseTemplate,
  deleteResponseTemplate,
  previewResponseTemplate,
} from "../lib/api";
import type { ResponseTemplate } from "../lib/api";

/**
 * Templates store with full CRUD. `selectedId === "new"` is the sentinel for
 * the in-progress create form.
 *
 * CRUD actions only mutate local state *after* the server confirms — so a
 * failed request leaves the list consistent with the server. `error` is a
 * shared string surface the view layer renders as a banner; list fetches set
 * it, per-item actions re-throw so the editor can render an inline message
 * next to the offending action.
 */
interface TemplateState {
  templates: ResponseTemplate[];
  loading: boolean;
  loadedAt: number;
  error: string | null;
  selectedId: string | null;

  fetchTemplates: () => Promise<void>;
  selectTemplate: (id: string | null) => void;
  createTemplate: (attrs: Partial<ResponseTemplate>) => Promise<ResponseTemplate>;
  updateTemplate: (
    id: string,
    attrs: Partial<ResponseTemplate>
  ) => Promise<ResponseTemplate>;
  deleteTemplate: (id: string) => Promise<void>;
  previewTemplate: (
    attrs: Partial<ResponseTemplate>
  ) => Promise<{ html: string; css: string; valid: boolean; errors: string[] }>;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  loading: false,
  loadedAt: 0,
  error: null,
  selectedId: null,

  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const { templates } = await listResponseTemplates();
      set({ templates, loadedAt: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load templates";
      console.warn("[templates] fetch failed", e);
      set({ error: msg });
    } finally {
      set({ loading: false });
    }
  },

  selectTemplate: (id) => set({ selectedId: id }),

  createTemplate: async (attrs) => {
    const { template } = await createResponseTemplate(attrs);
    set((s) => ({ templates: [template, ...s.templates] }));
    return template;
  },

  updateTemplate: async (id, attrs) => {
    const { template } = await updateResponseTemplate(id, attrs);
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? template : t)),
    }));
    return template;
  },

  deleteTemplate: async (id) => {
    await deleteResponseTemplate(id);
    set((s) => ({
      templates: s.templates.filter((t) => t.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  previewTemplate: (attrs) => previewResponseTemplate(attrs),
}));
