import { create } from "zustand";

export type View = "chat" | "tasks" | "agents" | "templates" | "canvas";

interface NavState {
  view: View;
  setView: (view: View) => void;
}

export const useNavStore = create<NavState>((set) => ({
  view: "chat",
  setView: (view) => set({ view }),
}));
