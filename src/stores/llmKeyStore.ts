import { create } from "zustand";
import * as api from "../lib/api";

/**
 * LLM API key registry for the user.
 *
 * Storage moved from localStorage to the backend (`user_credentials`,
 * encrypted at rest). The local store now holds METADATA ONLY — id,
 * provider, label, default flag — never the raw token. When a local
 * agent needs the actual key, the bridge resolves it through
 * `/api/integrations/:provider/resolve` (optionally passing a key_id),
 * which is the single authoritative path for both local-bridge and
 * hosted-execution code paths.
 *
 * On first launch after the migration, any keys still in legacy
 * localStorage are pushed to the backend and the localStorage entries
 * cleared. The store fetches the backend list afterwards.
 */
export interface LlmApiKey {
  id: string;
  provider: string;
  label: string;
  isDefault: boolean;
  /** Active / revoked / refresh_failed — mirror of backend status. */
  status?: string;
}

interface LlmKeyState {
  keys: LlmApiKey[];
  loading: boolean;
  loaded: boolean;
  error: string | null;

  /** Pull the current list from the backend. Idempotent — call freely. */
  refresh: () => Promise<void>;

  /** Create a new key. Returns the new id on success. */
  addKey: (
    provider: string,
    label: string,
    apiKey: string,
    opts?: { makeDefault?: boolean }
  ) => Promise<string>;

  /** Update label and/or rotate the key value. */
  updateKey: (
    id: string,
    updates: { label?: string; apiKey?: string }
  ) => Promise<void>;

  /** Mark a key as the default for its provider. */
  setDefault: (provider: string, keyId: string) => Promise<void>;

  /** Delete a key. If it was the default, the backend promotes the next. */
  removeKey: (id: string) => Promise<void>;

  /** Synchronous convenience accessors for components that already
   *  loaded the list. */
  getDefaultKey: (provider: string) => LlmApiKey | null;
  getKeyById: (id: string) => LlmApiKey | null;
  getKeysForProvider: (provider: string) => LlmApiKey[];
}

const LEGACY_KEYS_STORAGE_KEY = "llmApiKeys";
const LEGACY_DEFAULTS_STORAGE_KEY = "llmApiKeyDefaults";
const LEGACY_DEFAULTS_OLD_KEY = "llmDefaults";
const MIGRATION_DONE_KEY = "llmApiKeysBackendMigrated";

interface LegacyKey {
  id: string;
  provider: string;
  label: string;
  apiKey: string;
}

/**
 * One-shot migration: if the user has keys still in localStorage from
 * before the backend store existed, push them up to the new endpoints
 * and wipe the localStorage entries. Called once on first list load
 * after the upgrade. Idempotent — uses MIGRATION_DONE_KEY as a flag.
 */
async function migrateLegacyKeysIfAny(): Promise<void> {
  if (localStorage.getItem(MIGRATION_DONE_KEY) === "1") return;

  // Drop the very old single-key-per-provider format into the new array
  // shape so the rest of the migration handles it uniformly.
  promoteVeryLegacyShape();

  const rawKeys = localStorage.getItem(LEGACY_KEYS_STORAGE_KEY);
  const rawDefaults = localStorage.getItem(LEGACY_DEFAULTS_STORAGE_KEY);
  if (!rawKeys) {
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    return;
  }

  let keys: LegacyKey[] = [];
  let defaults: Record<string, string> = {};
  try {
    keys = JSON.parse(rawKeys) as LegacyKey[];
  } catch {
    keys = [];
  }
  try {
    defaults = rawDefaults
      ? (JSON.parse(rawDefaults) as Record<string, string>)
      : {};
  } catch {
    defaults = {};
  }

  if (keys.length === 0) {
    localStorage.removeItem(LEGACY_KEYS_STORAGE_KEY);
    localStorage.removeItem(LEGACY_DEFAULTS_STORAGE_KEY);
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
    return;
  }

  // Push each legacy key. The backend marks the first per provider as
  // default automatically; we then explicitly set the user's chosen
  // default if it wasn't the first one.
  const created: Array<{ legacyId: string; provider: string; serverId: string }> = [];
  for (const k of keys) {
    try {
      const { key } = await api.createLlmKey({
        provider: k.provider,
        token: k.apiKey,
        label: k.label,
        // Don't force default here — we'll explicitly set it after
        // creating all of them so the order matches the user's choice.
        makeDefault: false,
      });
      created.push({ legacyId: k.id, provider: k.provider, serverId: key.id });
    } catch (e) {
      console.warn("[llmKeyStore] migration: failed to push key", k.id, e);
    }
  }

  // Resolve the desired default per provider via the legacy id mapping.
  for (const provider of Object.keys(defaults)) {
    const legacyDefaultId = defaults[provider];
    const match = created.find(
      (c) => c.legacyId === legacyDefaultId && c.provider === provider
    );
    if (match) {
      try {
        await api.setDefaultLlmKey(match.serverId);
      } catch (e) {
        console.warn(
          "[llmKeyStore] migration: failed to set default",
          provider,
          e
        );
      }
    }
  }

  // Wipe localStorage so the bridge / agentStore stop reading from it.
  localStorage.removeItem(LEGACY_KEYS_STORAGE_KEY);
  localStorage.removeItem(LEGACY_DEFAULTS_STORAGE_KEY);
  localStorage.removeItem(LEGACY_DEFAULTS_OLD_KEY);
  localStorage.setItem(MIGRATION_DONE_KEY, "1");
}

/**
 * The pre-multi-key format stored a single key per provider under
 * `llmDefaults` (each value: `{ apiKey, defaultModel }`). Upgrade it
 * into the modern array shape so `migrateLegacyKeysIfAny` can ship it
 * all to the backend in one pass.
 */
function promoteVeryLegacyShape() {
  if (localStorage.getItem(LEGACY_KEYS_STORAGE_KEY)) return;
  const raw = localStorage.getItem(LEGACY_DEFAULTS_OLD_KEY);
  if (!raw) return;

  try {
    const legacy: Record<string, { apiKey: string }> = JSON.parse(raw);
    const keys: LegacyKey[] = [];
    const defaults: Record<string, string> = {};
    for (const [provider, data] of Object.entries(legacy)) {
      if (!data?.apiKey) continue;
      const id = crypto.randomUUID();
      keys.push({ id, provider, label: provider, apiKey: data.apiKey });
      defaults[provider] = id;
    }
    if (keys.length > 0) {
      localStorage.setItem(LEGACY_KEYS_STORAGE_KEY, JSON.stringify(keys));
      localStorage.setItem(
        LEGACY_DEFAULTS_STORAGE_KEY,
        JSON.stringify(defaults)
      );
    }
  } catch {
    // ignore — nothing to migrate.
  }
}

function fromApi(key: api.LlmApiKey): LlmApiKey {
  return {
    id: key.id,
    provider: key.provider,
    label: key.label || key.provider,
    isDefault: key.isDefault,
    status: key.status,
  };
}

export const useLlmKeyStore = create<LlmKeyState>((set, get) => ({
  keys: [],
  loading: false,
  loaded: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      // Migrate first, so the backend already has the user's keys
      // before we list. Subsequent calls short-circuit on the flag.
      await migrateLegacyKeysIfAny();

      const { keys } = await api.listLlmKeys();
      set({
        keys: keys.map(fromApi),
        loading: false,
        loaded: true,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load keys",
      });
    }
  },

  addKey: async (provider, label, apiKey, opts) => {
    const { key } = await api.createLlmKey({
      provider,
      token: apiKey,
      label,
      makeDefault: opts?.makeDefault ?? false,
    });
    // Refresh from the backend so the default flag reflects whatever
    // the server actually decided (first-key-per-provider auto-default).
    await get().refresh();
    return key.id;
  },

  updateKey: async (id, updates) => {
    await api.updateLlmKey(id, {
      label: updates.label,
      token: updates.apiKey,
    });
    await get().refresh();
  },

  setDefault: async (_provider, keyId) => {
    await api.setDefaultLlmKey(keyId);
    await get().refresh();
  },

  removeKey: async (id) => {
    await api.deleteLlmKey(id);
    await get().refresh();
  },

  getDefaultKey: (provider) => {
    return (
      get().keys.find((k) => k.provider === provider && k.isDefault) || null
    );
  },

  getKeyById: (id) => {
    return get().keys.find((k) => k.id === id) || null;
  },

  getKeysForProvider: (provider) => {
    return get().keys.filter((k) => k.provider === provider);
  },
}));
