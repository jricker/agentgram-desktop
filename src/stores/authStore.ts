import { create } from "zustand";
import * as api from "../lib/api";

interface AuthState {
  token: string | null;
  participant: api.Participant | null;
  loading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => void;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  participant: null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const result = await api.login(email, password);
      localStorage.setItem("authToken", result.token);
      localStorage.setItem("participant", JSON.stringify(result.participant));
      set({
        token: result.token,
        participant: result.participant,
        loading: false,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Login failed",
      });
    }
  },

  signup: async (email, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const result = await api.signup(email, password, displayName);
      localStorage.setItem("authToken", result.token);
      localStorage.setItem("participant", JSON.stringify(result.participant));
      set({
        token: result.token,
        participant: result.participant,
        loading: false,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Signup failed",
      });
    }
  },

  logout: () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("participant");
    set({ token: null, participant: null });
  },

  restoreSession: () => {
    const token = localStorage.getItem("authToken");
    const raw = localStorage.getItem("participant");
    if (token && raw) {
      try {
        const participant = JSON.parse(raw);
        set({ token, participant });
        // Fetch fresh profile in background (gets avatarUrl etc.)
        useAuthStore.getState().fetchProfile();
      } catch {
        localStorage.removeItem("authToken");
        localStorage.removeItem("participant");
      }
    }
  },

  fetchProfile: async () => {
    try {
      const participant = await api.getProfile();
      localStorage.setItem("participant", JSON.stringify(participant));
      set({ participant });
    } catch {
      // Silently fail — stale data is fine as fallback
    }
  },
}));
