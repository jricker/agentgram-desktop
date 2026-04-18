import { create } from "zustand";

const STORAGE_KEY = "agentchat:theme";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  // Tauri's webview honors this for the native scrollbar + form controls
  document.documentElement.style.colorScheme = theme;
}

const stored = (localStorage.getItem(STORAGE_KEY) ?? "system") as ThemePreference;
const initialResolved = resolveTheme(stored);
applyTheme(initialResolved);

export const useThemeStore = create<ThemeState>((set) => {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const state = useThemeStore.getState();
      if (state.preference === "system") {
        const resolved = getSystemTheme();
        applyTheme(resolved);
        set({ resolved });
      }
    });

  return {
    preference: stored,
    resolved: initialResolved,
    setPreference: (pref) => {
      localStorage.setItem(STORAGE_KEY, pref);
      const resolved = resolveTheme(pref);
      applyTheme(resolved);
      set({ preference: pref, resolved });
    },
  };
});
