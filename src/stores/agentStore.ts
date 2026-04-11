import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import * as api from "../lib/api";
import { providerRequiresLlmKey } from "../lib/models";
import { useLlmKeyStore } from "./llmKeyStore";

interface AgentConfig {
  backend: string;
  model: string;
  llmApiKey: string | null;
  /** Reference to a named key in llmKeyStore — takes precedence over provider default */
  llmApiKeyId: string | null;
  maxTokens: number;
  historyLimit: number;
  executionMode: string;
  effort: string | null;
  dangerouslySkipPermissions: boolean;
  autoRestart: boolean;
  autoStart: boolean;
  /** Directories for CLI tools access — also enables CLI tools (Bash, Read, etc.) */
  addDirs: string[];
}

export interface ManagedAgent {
  agent: api.Agent;
  apiKey: string | null;
  config: AgentConfig;
  processStatus: "running" | "stopped" | "crashed" | "starting" | "stalled";
  uptimeSecs: number | null;
  crashReason: string | null;
  health: api.AgentHealth | null;
  /** Timestamp (ms) when activity was last detected via health delta */
  lastActivityAt: number | null;
  /** Previous health snapshot for delta detection */
  prevHealth: api.AgentHealth | null;
  /** Timestamp (ms) of last auto-restart attempt for stall recovery */
  stallRestartAttemptAt: number | null;
  /** Timestamp (ms) when the process was started — used for startup grace period */
  startedAt: number | null;
}

interface AgentState {
  agents: Record<string, ManagedAgent>;
  selectedAgentId: string | null;
  loading: boolean;
  error: string | null;

  fetchAgents: () => Promise<void>;
  fetchHealth: () => Promise<void>;
  selectAgent: (id: string | null) => Promise<void>;
  startAgent: (id: string) => Promise<void>;
  stopAgent: (id: string) => Promise<void>;
  updateConfig: (id: string, config: Partial<AgentConfig>) => void;
  setApiKey: (id: string, key: string) => void;
  createAgent: (data: {
    displayName: string;
    description?: string;
    agentType?: string;
    backend?: string;
    model?: string;
    executionMode?: string;
    effort?: string;
    dangerouslySkipPermissions?: boolean;
  }) => Promise<string>;
  regenerateKey: (id: string) => Promise<string>;
  refreshProcessStatuses: () => Promise<void>;
}

const DEFAULT_CONFIG: AgentConfig = {
  backend: "anthropic",
  model: "claude-sonnet-4-5-20250929",
  llmApiKey: null,
  llmApiKeyId: null,
  maxTokens: 16384,
  historyLimit: 20,
  executionMode: "tool_use",
  effort: null,
  dangerouslySkipPermissions: false,
  autoRestart: true,
  autoStart: false,
  addDirs: [],
};

function loadLocalConfig(agentId: string): Partial<AgentConfig> {
  const raw = localStorage.getItem(`agent:config:${agentId}`);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function saveLocalConfig(agentId: string, config: AgentConfig) {
  localStorage.setItem(`agent:config:${agentId}`, JSON.stringify(config));
}

function loadApiKey(agentId: string): string | null {
  return localStorage.getItem(`agent:apikey:${agentId}`);
}

function saveApiKey(agentId: string, key: string) {
  localStorage.setItem(`agent:apikey:${agentId}`, key);
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: {},
  selectedAgentId: null,
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null });
    try {
      const result = await api.listAgents();
      const current = get().agents;
      const updated: Record<string, ManagedAgent> = {};

      for (const agent of result.agents) {
        const existing = current[agent.id];
        const localConfig = loadLocalConfig(agent.id);
        const localKey = loadApiKey(agent.id);

        // Merge: defaults <- server modelConfig <- local overrides
        const serverConfig: Partial<AgentConfig> = {};
        const mc = agent.modelConfig as Record<string, unknown> | undefined;
        if (mc) {
          if (mc.backend) serverConfig.backend = mc.backend as string;
          if (mc.model) serverConfig.model = mc.model as string;
          if (mc.max_tokens) serverConfig.maxTokens = mc.max_tokens as number;
          if (mc.execution_mode) serverConfig.executionMode = mc.execution_mode as string;
          if (mc.history_limit) serverConfig.historyLimit = mc.history_limit as number;
        }

        updated[agent.id] = {
          agent,
          apiKey: existing?.apiKey || localKey,
          config: { ...DEFAULT_CONFIG, ...serverConfig, ...localConfig },
          processStatus: existing?.processStatus || "stopped",
          uptimeSecs: existing?.uptimeSecs || null,
          crashReason: existing?.crashReason || null,
          health: existing?.health || null,
          lastActivityAt: existing?.lastActivityAt || null,
          prevHealth: existing?.prevHealth || null,
          stallRestartAttemptAt: existing?.stallRestartAttemptAt || null,
          startedAt: existing?.startedAt || null,
        };
      }

      set({ agents: updated, loading: false });
    } catch (e) {
      console.error("fetchAgents failed:", e);
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to fetch agents",
      });
    }
  },

  fetchHealth: async () => {
    try {
      const result = await api.getAgentHealth();
      const current = get().agents;
      const now = Date.now();
      let changed = false;

      const agents = { ...current };
      for (const health of result.agents) {
        const managed = agents[health.agentId];
        if (managed) {
          // Detect activity by comparing with previous health snapshot
          let activityDetected = false;
          if (managed.prevHealth) {
            const prev = managed.prevHealth;
            activityDetected =
              health.queuedTasks !== prev.queuedTasks ||
              health.queuedMessages !== prev.queuedMessages ||
              health.stuckCount !== prev.stuckCount ||
              health.onlineExecutorCount !== prev.onlineExecutorCount;
          }
          if (health.queuedTasks > 0 || health.queuedMessages > 0) {
            activityDetected = true;
          }

          // Only update if health data actually changed
          const prevH = managed.health;
          const healthChanged =
            !prevH ||
            prevH.healthStatus !== health.healthStatus ||
            prevH.queuedTasks !== health.queuedTasks ||
            prevH.queuedMessages !== health.queuedMessages ||
            prevH.stuckCount !== health.stuckCount ||
            prevH.onlineExecutorCount !== health.onlineExecutorCount ||
            prevH.executorCount !== health.executorCount;
          const activityChanged =
            activityDetected && managed.lastActivityAt !== now;

          if (healthChanged || activityChanged) {
            agents[health.agentId] = {
              ...managed,
              health,
              prevHealth: health,
              lastActivityAt: activityDetected ? now : managed.lastActivityAt,
            };
            changed = true;
          }

          // --- Stall detection ---
          const backendDead =
            health.healthStatus === "offline" || health.healthStatus === "stuck";
          const processAlive =
            managed.processStatus === "running" || managed.processStatus === "stalled";
          // Grace period: don't mark as stalled during bridge startup (warmup, executor registration)
          const STARTUP_GRACE_MS = 90_000;
          const inStartupGrace =
            managed.startedAt != null && now - managed.startedAt < STARTUP_GRACE_MS;

          if (backendDead && processAlive && !inStartupGrace) {
            // Process is alive but backend says executor is dead/stuck = stall
            if (managed.processStatus !== "stalled") {
              agents[health.agentId] = {
                ...agents[health.agentId],
                processStatus: "stalled",
              };
              changed = true;
              console.log(`[StallDetector] Agent ${health.agentId} marked stalled (backend: ${health.healthStatus})`);
            }

            // Auto-restart with 30s cooldown
            const STALL_COOLDOWN_MS = 30_000;
            const lastRestart = agents[health.agentId].stallRestartAttemptAt || 0;
            const current = agents[health.agentId];
            if (
              current.config.autoRestart &&
              current.processStatus === "stalled" &&
              now - lastRestart > STALL_COOLDOWN_MS
            ) {
              agents[health.agentId] = {
                ...agents[health.agentId],
                stallRestartAttemptAt: now,
              };
              changed = true;
              // Defer restart to avoid blocking the health poll
              const store = get();
              setTimeout(() => {
                console.log(`[StallDetector] Auto-restarting stalled agent ${health.agentId}`);
                store.stopAgent(health.agentId).then(() => {
                  store.startAgent(health.agentId).catch((err: unknown) => {
                    console.error(`[StallDetector] Failed to restart ${health.agentId}:`, err);
                  });
                });
              }, 0);
            }
          } else if (!backendDead && managed.processStatus === "stalled") {
            // Backend recovered — clear stall status
            agents[health.agentId] = {
              ...agents[health.agentId],
              processStatus: "running",
              stallRestartAttemptAt: null,
            };
            changed = true;
            console.log(`[StallDetector] Agent ${health.agentId} recovered from stall`);
          }
        }
      }

      if (changed) set({ agents });
    } catch {
      // Health check failure is non-fatal
    }
  },

  selectAgent: async (id) => {
    set({ selectedAgentId: id });

    // Refresh agent profile data (avatar, description, etc.) from server
    if (id) {
      try {
        const freshAgent = await api.getAgent(id);
        const agents = { ...get().agents };
        const managed = agents[id];
        if (managed) {
          agents[id] = { ...managed, agent: freshAgent };
          set({ agents });
        }
      } catch {
        // Non-fatal — stale data is better than no data
      }
    }
  },

  startAgent: async (id) => {
    const managed = get().agents[id];
    if (!managed || !managed.apiKey) {
      throw new Error("Agent not configured — missing API key");
    }

    const needsLlmKey = providerRequiresLlmKey(managed.config.backend);
    const llmApiKey = resolveLlmApiKey(managed.config);

    if (needsLlmKey && !llmApiKey) {
      throw new Error(
        `No LLM API key configured for ${managed.config.backend}. Set one in Settings or in the agent config.`
      );
    }

    set({ agents: { ...get().agents, [id]: { ...managed, processStatus: "starting", crashReason: null } } });

    try {
      await invoke("start_agent", {
        args: {
          agentId: id,
          agentName: managed.agent.displayName,
          apiKey: managed.apiKey,
          backend: managed.config.backend,
          model: managed.config.model,
          llmApiKey: llmApiKey,
          maxTokens: managed.config.maxTokens,
          historyLimit: managed.config.historyLimit,
          executionMode: managed.config.executionMode,
          dangerouslySkipPermissions: managed.config.dangerouslySkipPermissions,
          effort: managed.config.effort || undefined,
          addDirs: managed.config.addDirs.length > 0 ? managed.config.addDirs : undefined,
        },
      });

      const current = get().agents[id];
      if (current) {
        set({ agents: { ...get().agents, [id]: { ...current, processStatus: "running", uptimeSecs: 0, startedAt: Date.now() } } });
      }
    } catch (e) {
      const current = get().agents[id];
      if (current) {
        const msg = e instanceof Error ? e.message : String(e);
        set({ agents: { ...get().agents, [id]: { ...current, processStatus: "crashed", crashReason: msg } } });
      }
      throw e;
    }
  },

  stopAgent: async (id) => {
    try {
      await invoke("stop_agent", { agentId: id });
    } catch {
      // Process may already be dead
    }

    // Mark executors offline immediately so web/mobile apps see the change
    // without waiting 45-105s for the cleanup worker
    try {
      await api.markAgentOffline(id);
    } catch {
      // Non-fatal — cleanup worker will handle it eventually
    }

    const managed = get().agents[id];
    if (managed) {
      set({ agents: { ...get().agents, [id]: { ...managed, processStatus: "stopped", uptimeSecs: null, crashReason: null, startedAt: null } } });
    }
  },

  updateConfig: (id, partial) => {
    const managed = get().agents[id];
    if (managed) {
      const config = { ...managed.config, ...partial };
      set({ agents: { ...get().agents, [id]: { ...managed, config } } });
      saveLocalConfig(id, config);
    }
  },

  setApiKey: (id, key) => {
    const managed = get().agents[id];
    if (managed) {
      set({ agents: { ...get().agents, [id]: { ...managed, apiKey: key } } });
      saveApiKey(id, key);
    }
  },

  createAgent: async (data) => {
    const { backend: selectedBackend, model: selectedModel, executionMode: selectedMode, effort: selectedEffort, dangerouslySkipPermissions: skipPerms, ...apiData } = data;
    const result = await api.createAgent(apiData);
    const config = {
      ...DEFAULT_CONFIG,
      ...(selectedBackend ? { backend: selectedBackend } : {}),
      ...(selectedModel ? { model: selectedModel } : {}),
      ...(selectedMode ? { executionMode: selectedMode } : {}),
      ...(selectedEffort ? { effort: selectedEffort } : {}),
      ...(skipPerms ? { dangerouslySkipPermissions: true } : {}),
    };

    set({
      agents: {
        ...get().agents,
        [result.agent.id]: {
          agent: result.agent,
          apiKey: result.apiKey,
          config,
          processStatus: "stopped",
          uptimeSecs: null,
          crashReason: null,
          health: null,
          lastActivityAt: null,
          prevHealth: null,
          stallRestartAttemptAt: null,
          startedAt: null,
        },
      },
    });

    saveApiKey(result.agent.id, result.apiKey);
    saveLocalConfig(result.agent.id, config);
    return result.agent.id;
  },

  regenerateKey: async (id) => {
    const result = await api.regenerateApiKey(id);
    const managed = get().agents[id];
    if (managed) {
      set({
        agents: {
          ...get().agents,
          [id]: { ...managed, agent: result.agent, apiKey: result.apiKey },
        },
      });
      saveApiKey(id, result.apiKey);
    }
    return result.apiKey;
  },

  refreshProcessStatuses: async () => {
    try {
      const statuses: Array<{
        agentId: string;
        status: string;
        uptimeSecs: number | null;
        crashReason: string | null;
      }> = await invoke("get_all_statuses");

      const current = get().agents;
      const statusMap = new Map(statuses.map((s) => [s.agentId, s]));
      let changed = false;

      const agents = { ...current };
      for (const id of Object.keys(agents)) {
        const status = statusMap.get(id);
        if (status) {
          const managed = agents[id];
          let newStatus = status.status as ManagedAgent["processStatus"];
          const newCrash = status.crashReason || null;

          // Preserve "stalled" status when OS process is still alive —
          // stall detection in fetchHealth sets this; only clear it when
          // the process actually dies or fetchHealth clears it on recovery.
          if (managed.processStatus === "stalled" && newStatus === "running") {
            newStatus = "stalled";
          }

          if (
            managed.processStatus !== newStatus ||
            managed.uptimeSecs !== status.uptimeSecs ||
            managed.crashReason !== newCrash
          ) {
            agents[id] = {
              ...managed,
              processStatus: newStatus,
              uptimeSecs: status.uptimeSecs,
              crashReason: newCrash,
            };
            changed = true;
          }
        }
      }

      if (changed) set({ agents });
    } catch {
      // Non-fatal
    }
  },
}));

/**
 * Resolve the LLM API key for an agent config.
 * Priority: direct llmApiKey → named llmApiKeyId → provider default.
 */
function resolveLlmApiKey(config: AgentConfig): string | null {
  // 1. Direct key override
  if (config.llmApiKey) return config.llmApiKey;

  const keyStore = useLlmKeyStore.getState();

  // 2. Named key reference
  if (config.llmApiKeyId) {
    const namedKey = keyStore.getKeyById(config.llmApiKeyId);
    if (namedKey) return namedKey.apiKey;
  }

  // 3. Provider default
  const defaultKey = keyStore.getDefaultKey(config.backend);
  return defaultKey?.apiKey || null;
}
