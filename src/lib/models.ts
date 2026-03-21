/**
 * Model & provider definitions — single source of truth.
 *
 * Mirrors mobile/lib/normalizeModelName.ts.
 * When adding models, update BOTH files (or extract to a shared package).
 */

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderConfig {
  id: string;
  label: string;
  models: ModelOption[];
  /** Execution modes supported by this provider's SDK backend */
  supportedModes: string[];
  /** Whether this provider requires an LLM API key to run */
  requiresLlmKey: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    requiresLlmKey: true,
    supportedModes: ["single_shot", "tool_use", "code_action"],
    models: [
      // Current (latest generation)
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      // Previous generation
      { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    requiresLlmKey: true,
    supportedModes: ["single_shot", "tool_use", "code_action"],
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { id: "gpt-4", label: "GPT-4" },
      { id: "o4-mini", label: "o4 Mini" },
      { id: "o3", label: "o3" },
      { id: "o3-mini", label: "o3 Mini" },
      { id: "o1", label: "o1" },
      { id: "o1-mini", label: "o1 Mini" },
      { id: "o1-preview", label: "o1 Preview" },
    ],
  },
  {
    id: "google",
    label: "Google",
    requiresLlmKey: true,
    supportedModes: ["single_shot", "code_action"],
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    ],
  },
  {
    id: "claude_cli",
    label: "Claude Code",
    requiresLlmKey: false,
    supportedModes: ["single_shot", "tool_use", "code_action"],
    models: [
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
  },
];

/** Known model ID patterns -> friendly display names.
 *  normalizeModelName() strips date suffixes before lookup,
 *  so "claude-opus-4-6" matches "claude-opus-4-6-20260101" too.
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Claude 4.6 (current)
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  // Claude 4.5
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
  "claude-opus-4-5": "Claude Opus 4.5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  // Claude 4.1
  "claude-opus-4-1": "Claude Opus 4.1",
  // Claude 4.0
  "claude-sonnet-4": "Claude Sonnet 4",
  "claude-opus-4": "Claude Opus 4",
  // Claude 3.x (deprecated/legacy)
  "claude-3-opus": "Claude 3 Opus",
  "claude-3-5-sonnet": "Claude 3.5 Sonnet",
  "claude-3-5-haiku": "Claude 3.5 Haiku",
  "claude-3-haiku": "Claude 3 Haiku",
  "claude-3-sonnet": "Claude 3 Sonnet",
  // OpenAI
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4-turbo": "GPT-4 Turbo",
  "gpt-4": "GPT-4",
  "o1": "o1",
  "o1-mini": "o1 Mini",
  "o1-preview": "o1 Preview",
  "o3": "o3",
  "o3-mini": "o3 Mini",
  "o4-mini": "o4 Mini",
  // Google
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-1.5-pro": "Gemini 1.5 Pro",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
};

const BACKEND_DISPLAY_NAMES: Record<string, string> = {
  claude_cli: "Claude Code",
  openclaw: "OpenClaw",
};

export function normalizeModelName(raw: string): string | null {
  if (!raw) return null;
  let cleaned = raw.replace(/^(anthropic|openai|google|meta|mistral)\//i, "");
  cleaned = cleaned.replace(/-\d{4}-?\d{2}-?\d{2}$/, "");
  const friendly = MODEL_DISPLAY_NAMES[cleaned.toLowerCase()];
  if (friendly) return friendly;
  return cleaned;
}

export function formatModelLabel(
  rawModel: string | undefined | null,
  backend: string | undefined | null,
): string | null {
  const model = normalizeModelName(rawModel || "");
  if (!model) return null;
  const prefix = backend ? BACKEND_DISPLAY_NAMES[backend] : null;
  if (prefix) {
    if (model === prefix) return prefix;
    return `${prefix} · ${model}`;
  }
  return model;
}

export function providerRequiresLlmKey(providerId: string): boolean {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  return provider?.requiresLlmKey ?? true;
}

export function getSupportedModes(providerId: string): string[] {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  return provider?.supportedModes || ["single_shot"];
}

export function getModelsForProvider(providerId: string): ModelOption[] {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  return provider?.models || [];
}

export function getProviderLabel(providerId: string): string {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  return provider?.label || providerId;
}

export const EXECUTION_MODES = [
  {
    id: "single_shot",
    label: "Single Shot",
    description:
      "The agent sends one prompt to the LLM and returns the response. Tools are invoked via XML tags in the output. Best for simple Q&A agents.",
  },
  {
    id: "tool_use",
    label: "Tool Use",
    description:
      "The agent runs an agentic loop — the LLM can call tools natively (API-level tool calling), see the results, and iterate until done. Best for agents that need to search, fetch data, or take actions.",
  },
  {
    id: "code_action",
    label: "Code Action",
    description:
      "The agent generates Python code which runs in a sandboxed environment. The output is returned as the result. Best for data processing or computation tasks.",
  },
];
