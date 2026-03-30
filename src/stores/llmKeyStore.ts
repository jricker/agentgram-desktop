import { create } from "zustand";

export interface LlmApiKey {
  id: string;
  provider: string;
  label: string;
  apiKey: string;
}

interface LlmKeyState {
  keys: LlmApiKey[];
  /** provider → key ID that is the default for that provider */
  defaults: Record<string, string>;

  addKey: (provider: string, label: string, apiKey: string) => string;
  updateKey: (id: string, updates: Partial<Pick<LlmApiKey, "label" | "apiKey">>) => void;
  removeKey: (id: string) => void;
  setDefault: (provider: string, keyId: string) => void;
  getDefaultKey: (provider: string) => LlmApiKey | null;
  getKeyById: (id: string) => LlmApiKey | null;
  getKeysForProvider: (provider: string) => LlmApiKey[];
}

const STORAGE_KEY = "llmApiKeys";
const DEFAULTS_KEY = "llmApiKeyDefaults";
const LEGACY_KEY = "llmDefaults";

function generateId(): string {
  return crypto.randomUUID();
}

function loadKeys(): LlmApiKey[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

function loadDefaults(): Record<string, string> {
  const raw = localStorage.getItem(DEFAULTS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function saveKeys(keys: LlmApiKey[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

function saveDefaults(defaults: Record<string, string>) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
}

/**
 * Migrate from old single-key-per-provider format (`llmDefaults`)
 * to the new multi-key format. Runs once on first load.
 */
function migrateFromLegacy(): { keys: LlmApiKey[]; defaults: Record<string, string> } | null {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;

  // Only migrate if new storage doesn't exist yet
  if (localStorage.getItem(STORAGE_KEY)) return null;

  try {
    const legacy: Record<string, { apiKey: string; defaultModel: string }> = JSON.parse(raw);
    const keys: LlmApiKey[] = [];
    const defaults: Record<string, string> = {};

    for (const [provider, data] of Object.entries(legacy)) {
      if (data.apiKey) {
        const id = generateId();
        keys.push({
          id,
          provider,
          label: `${providerDisplayName(provider)} Key`,
          apiKey: data.apiKey,
        });
        defaults[provider] = id;
      }
    }

    if (keys.length > 0) {
      saveKeys(keys);
      saveDefaults(defaults);
      // Keep legacy key around briefly for safety, but mark as migrated
      localStorage.setItem(LEGACY_KEY + ":migrated", "true");
    }

    return { keys, defaults };
  } catch {
    return null;
  }
}

function providerDisplayName(id: string): string {
  const names: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    xai: "xAI",
  };
  return names[id] || id;
}

function initState(): { keys: LlmApiKey[]; defaults: Record<string, string> } {
  // Try migration first
  const migrated = migrateFromLegacy();
  if (migrated) return migrated;

  return { keys: loadKeys(), defaults: loadDefaults() };
}

const initial = initState();

export const useLlmKeyStore = create<LlmKeyState>((set, get) => ({
  keys: initial.keys,
  defaults: initial.defaults,

  addKey: (provider, label, apiKey) => {
    const id = generateId();
    const key: LlmApiKey = { id, provider, label, apiKey };
    const keys = [...get().keys, key];
    const defaults = { ...get().defaults };

    // Auto-set as default if it's the first key for this provider
    if (!defaults[provider]) {
      defaults[provider] = id;
      saveDefaults(defaults);
    }

    saveKeys(keys);
    set({ keys, defaults });
    // Keep llmDefaults in sync for backward compat with existing agent resolution
    syncLegacyDefaults(keys, defaults);
    return id;
  },

  updateKey: (id, updates) => {
    const keys = get().keys.map((k) =>
      k.id === id ? { ...k, ...updates } : k
    );
    saveKeys(keys);
    set({ keys });
    syncLegacyDefaults(keys, get().defaults);
  },

  removeKey: (id) => {
    const keyToRemove = get().keys.find((k) => k.id === id);
    const keys = get().keys.filter((k) => k.id !== id);
    const defaults = { ...get().defaults };

    // If removing the default, pick the next available key for that provider
    if (keyToRemove && defaults[keyToRemove.provider] === id) {
      const remaining = keys.filter((k) => k.provider === keyToRemove.provider);
      if (remaining.length > 0) {
        defaults[keyToRemove.provider] = remaining[0].id;
      } else {
        delete defaults[keyToRemove.provider];
      }
      saveDefaults(defaults);
    }

    saveKeys(keys);
    set({ keys, defaults });
    syncLegacyDefaults(keys, defaults);
  },

  setDefault: (provider, keyId) => {
    const defaults = { ...get().defaults, [provider]: keyId };
    saveDefaults(defaults);
    set({ defaults });
    syncLegacyDefaults(get().keys, defaults);
  },

  getDefaultKey: (provider) => {
    const { keys, defaults } = get();
    const defaultId = defaults[provider];
    if (!defaultId) return null;
    return keys.find((k) => k.id === defaultId) || null;
  },

  getKeyById: (id) => {
    return get().keys.find((k) => k.id === id) || null;
  },

  getKeysForProvider: (provider) => {
    return get().keys.filter((k) => k.provider === provider);
  },
}));

/**
 * Keep the legacy `llmDefaults` localStorage in sync so that
 * `getAppLlmDefaults` in agentStore continues to work without changes
 * to the agent start flow.
 */
function syncLegacyDefaults(keys: LlmApiKey[], defaults: Record<string, string>) {
  const legacy: Record<string, { apiKey: string; defaultModel: string }> = {};
  for (const [provider, keyId] of Object.entries(defaults)) {
    const key = keys.find((k) => k.id === keyId);
    if (key) {
      legacy[provider] = { apiKey: key.apiKey, defaultModel: "" };
    }
  }
  localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
}
