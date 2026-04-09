import { useState, useMemo, useCallback, useEffect } from "react";
import { useAgentStore, type ManagedAgent } from "../stores/agentStore";
import {
  deleteAgent,
  deleteAgentPermanently,
  listConnections,
  revokeConnection,
  presignAvatarUpload,
  updateAgent,
  getAgentHealthDetail,
  forceResetAgent,
  clearAgentMessages,
  clearAgentTasks,
  killExecutor,
  unstickAgent,
  getAgentHeartbeat,
  updateAgentHeartbeat,
  enableAgentHeartbeat,
  disableAgentHeartbeat,
  triggerAgentHeartbeat,
  type Connection,
  type AgentHealthDetail,
  type HeartbeatData,
} from "../lib/api";
import { LogViewer } from "./LogViewer";
import { SoulEditor } from "./SoulEditor";
import { TemplateGallery } from "./TemplateGallery";
import {
  PROVIDERS,
  EXECUTION_MODES,
  EFFORT_LEVELS,
  getModelsForProvider,
  getSupportedModes,
  normalizeModelName,
} from "../lib/models";
import { useLlmKeyStore } from "../stores/llmKeyStore";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  X,
  Settings2,
  ScrollText,
  Activity,
  Sparkles,
  FileText,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  HelpCircle,
  LayoutTemplate,
  Palette,
  Timer,
  Trash2,
  AlertTriangle,
  Unlink,
  Camera,
  Pencil,
  Check,
  FolderOpen,
  Zap,
  Inbox,
  ListTodo,
  Cpu,
  Clock,
  HeartPulse,
  Play,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentSkills } from "./AgentSkills";
import { AgentTemplates } from "./AgentTemplates";
import { AgentCanvas } from "./AgentCanvas";
import { AgentRoutines } from "./AgentRoutines";
import { AvatarCropDialog } from "./AvatarCropDialog";

export function AgentConfig({ managed }: { managed: ManagedAgent }) {
  const { updateConfig, regenerateKey, selectAgent } = useAgentStore();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const { agent, config, apiKey } = managed;
  const backend = config.backend || "anthropic";
  const model = config.model || "";
  const executionMode = config.executionMode || "single_shot";
  const availableModels = getModelsForProvider(backend);
  const currentModelInList = availableModels.some((m) => m.id === model);
  const supportedModes = getSupportedModes(backend);
  const providerExists = PROVIDERS.some((p) => p.id === backend);

  const [keyError, setKeyError] = useState<string | null>(null);
  const [confirmingRegen, setConfirmingRegen] = useState(false);

  const handleRegenerate = async () => {
    // If there's an existing key, require confirmation first
    if (apiKey && !confirmingRegen) {
      setConfirmingRegen(true);
      return;
    }
    setConfirmingRegen(false);
    setRegenerating(true);
    setKeyError(null);
    try {
      await regenerateKey(agent.id);
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : "Failed to generate key");
    } finally {
      setRegenerating(false);
    }
  };

  const { keys: llmKeys, defaults: llmDefaults, getKeysForProvider: getLlmKeysForProvider } = useLlmKeyStore();
  const providerKeys = useMemo(() => getLlmKeysForProvider(backend), [getLlmKeysForProvider, backend, llmKeys]);
  const hasAppDefault = useMemo(() => !!llmDefaults[backend], [llmDefaults, backend]);
  const keyMode = config.llmApiKey ? "custom" : config.llmApiKeyId || (hasAppDefault ? "__default__" : "__default__");

  const [activeSection, setActiveSection] = useState("config");
  const [showGallery, setShowGallery] = useState(false);

  const sections = [
    { value: "config", label: "Config", icon: Settings2 },
    { value: "logs", label: "Logs", icon: ScrollText },
    { value: "soul", label: "Soul", icon: FileText },
    { value: "skills", label: "Skills", icon: Sparkles },
    { value: "templates", label: "Templates", icon: LayoutTemplate },
    { value: "routines", label: "Routines", icon: Timer },
    { value: "canvas", label: "Canvas", icon: Palette },
    { value: "heartbeat", label: "Heartbeat", icon: HeartPulse },
    { value: "health", label: "Health", icon: Activity },
  ];

  return (
    <div className="flex h-full">
      {/* Vertical icon sidebar */}
      <TooltipProvider delay={300}>
        <div className="w-12 border-r border-border bg-muted/30 flex flex-col items-center py-3 gap-1 flex-shrink-0">
          {/* Agent avatar at top */}
          <div className="mb-2">
            <Avatar className="h-8 w-8 rounded-lg">
              {agent.avatarUrl && <AvatarImage src={agent.avatarUrl} className="rounded-lg" />}
              <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                {agent.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <Separator className="w-6 mb-1" />

          {sections.map((section) => (
            <Tooltip key={section.value}>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => setActiveSection(section.value)}
                    className={cn(
                      "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
                      activeSection === section.value
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <section.icon className="w-4 h-4" />
                  </button>
                }
              />
              <TooltipContent side="right" className="text-xs">
                {section.label}
              </TooltipContent>
            </Tooltip>
          ))}

          {/* Close button at bottom */}
          <div className="mt-auto">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => selectAgent(null)}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                }
              />
              <TooltipContent side="right" className="text-xs">
                Close
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>

      {/* Content panel */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {/* Header — editable name + avatar */}
        <AgentHeader agent={agent} />

        {activeSection === "config" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* LLM Provider — Primary section */}
            <Section title="LLM Provider">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Provider</Label>
                  <Select
                    value={backend}
                    onValueChange={(val: string | null) => {
                      if (!val) return;
                      const models = getModelsForProvider(val);
                      const modes = getSupportedModes(val);
                      const updates: Record<string, unknown> = {
                        backend: val,
                        model: models[0]?.id || "",
                      };
                      if (!modes.includes(config.executionMode)) {
                        updates.executionMode = modes[0] || "single_shot";
                      }
                      updateConfig(agent.id, updates);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!providerExists && backend && (
                        <SelectItem value={backend}>
                          {backend} (custom)
                        </SelectItem>
                      )}
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Model</Label>
                  <Select
                    value={model}
                    onValueChange={(val: string | null) => {
                      if (val) updateConfig(agent.id, { model: val });
                    }
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!currentModelInList && config.model && (
                        <SelectItem value={config.model}>
                          {normalizeModelName(config.model) || config.model} (custom)
                        </SelectItem>
                      )}
                      {availableModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">API Key</Label>
                  <Select
                    value={keyMode}
                    onValueChange={(val: string | null) => {
                      if (!val) return;
                      if (val === "__default__") {
                        updateConfig(agent.id, { llmApiKeyId: null, llmApiKey: null });
                      } else if (val === "__custom__") {
                        updateConfig(agent.id, { llmApiKeyId: null, llmApiKey: "" });
                      } else {
                        updateConfig(agent.id, { llmApiKeyId: val, llmApiKey: null });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        {hasAppDefault ? "Provider Default" : "None (set in Settings)"}
                      </SelectItem>
                      {providerKeys.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Custom Key...</SelectItem>
                    </SelectContent>
                  </Select>
                  {keyMode === "custom" && (
                    <div className="flex gap-2">
                      <Input
                        type={showLlmKey ? "text" : "password"}
                        value={config.llmApiKey || ""}
                        onChange={(e) =>
                          updateConfig(agent.id, {
                            llmApiKey: e.target.value || null,
                          })
                        }
                        placeholder="sk-..."
                        className="flex-1 font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setShowLlmKey(!showLlmKey)}
                      >
                        {showLlmKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Section>

            {/* Execution Mode */}
            <Section title="Execution Mode">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs">Mode</Label>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[280px]">
                      <p className="font-medium mb-1">How the agent calls the LLM</p>
                      <p className="text-xs text-muted-foreground">
                        Controls whether the agent gets a single response, can
                        use tools iteratively, or runs code.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={executionMode}
                  onValueChange={(val: string | null) => {
                    if (val) updateConfig(agent.id, { executionMode: val });
                  }
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXECUTION_MODES.map((m) => {
                      const supported = supportedModes.includes(m.id);
                      return (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          disabled={!supported}
                        >
                          {m.label}
                          {!supported && " (not available)"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {
                    EXECUTION_MODES.find(
                      (m) => m.id === executionMode
                    )?.description
                  }
                </p>
                {!supportedModes.includes(executionMode) && (
                  <p className="text-xs text-destructive">
                    Not supported by{" "}
                    {PROVIDERS.find((p) => p.id === backend)?.label ||
                      backend}
                    . Falls back to Single Shot at runtime.
                  </p>
                )}
              </div>
            </Section>

            {/* Effort Level (Claude CLI only) */}
            {config.backend === "claude_cli" && (
              <Section title="Effort Level">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">Effort</Label>
                    <Tooltip>
                      <TooltipTrigger className="cursor-help">
                        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[280px]">
                        <p className="font-medium mb-1">Reasoning depth</p>
                        <p className="text-xs text-muted-foreground">
                          Controls how much thinking the model does. Lower effort
                          = faster responses, higher effort = more thorough.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={config.effort || "default"}
                    onValueChange={(val: string | null) => {
                      if (val === "default") {
                        updateConfig(agent.id, { effort: null });
                      } else if (val) {
                        updateConfig(agent.id, { effort: val });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (high)</SelectItem>
                      {EFFORT_LEVELS.map((level) => (
                        <SelectItem key={level.id} value={level.id}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {config.effort
                      ? EFFORT_LEVELS.find((l) => l.id === config.effort)?.description
                      : "Default reasoning depth — thorough and careful."}
                  </p>
                </div>
              </Section>
            )}

            {/* Behavior */}
            <Section title="Behavior">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Skip permissions</Label>
                    <p className="text-xs text-muted-foreground">
                      Claude Code only
                    </p>
                  </div>
                  <Switch
                    checked={config.dangerouslySkipPermissions}
                    onCheckedChange={(v) =>
                      updateConfig(agent.id, {
                        dangerouslySkipPermissions: v,
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Auto-restart on crash or stall</Label>
                  <Switch
                    checked={config.autoRestart}
                    onCheckedChange={(v) =>
                      updateConfig(agent.id, { autoRestart: v })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Start on app launch</Label>
                  <Switch
                    checked={config.autoStart}
                    onCheckedChange={(v) =>
                      updateConfig(agent.id, { autoStart: v })
                    }
                  />
                </div>
              </div>
            </Section>

            {/* Agent API Key */}
            <Section title="Agent API Key">
              {apiKey ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      readOnly
                      className="flex-1 font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => navigator.clipboard.writeText(apiKey)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  {confirmingRegen ? (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs text-destructive">This will invalidate the current key.</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleRegenerate}
                        disabled={regenerating}
                      >
                        {regenerating ? "Regenerating..." : "Confirm"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmingRegen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 text-warning border-warning/30 hover:bg-warning/10 hover:text-warning"
                      onClick={handleRegenerate}
                      disabled={regenerating}
                    >
                      <RefreshCw className="w-3 h-3 mr-1.5" />
                      Regenerate
                    </Button>
                  )}
                  {keyError && (
                    <p className="text-xs text-destructive mt-1">{keyError}</p>
                  )}
                </>
              ) : (
                <div className="rounded-md border border-dashed border-border p-3 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    No key stored on this machine
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Generate a new key to run this agent from here. This will invalidate any existing key.
                  </p>
                  {keyError && (
                    <p className="text-xs text-destructive mb-2">{keyError}</p>
                  )}
                  <Button
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={regenerating}
                  >
                    <RefreshCw
                      className={cn(
                        "w-3 h-3 mr-1.5",
                        regenerating && "animate-spin"
                      )}
                    />
                    {regenerating ? "Generating..." : "Generate API Key"}
                  </Button>
                </div>
              )}
            </Section>


            {/* Working Directories (Claude CLI only) */}
            {config.backend === "claude_cli" && (
              <Section title="Working Directories">
                <p className="text-xs text-muted-foreground mb-2">
                  Directories this agent can access. Adding directories also enables CLI tools
                  (Bash, Read, Edit, Web) alongside AgentGram tools.
                </p>
                <div className="space-y-1.5">
                  {config.addDirs.map((dir, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-mono truncate flex-1">{dir}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const updated = config.addDirs.filter((_, j) => j !== i);
                          updateConfig(agent.id, { addDirs: updated });
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      try {
                        const { open } = await import("@tauri-apps/plugin-dialog");
                        const selected = await open({ directory: true, multiple: false });
                        if (selected && typeof selected === "string") {
                          updateConfig(agent.id, { addDirs: [...config.addDirs, selected] });
                        }
                      } catch {
                        const path = window.prompt("Enter directory path:");
                        if (path?.trim()) {
                          updateConfig(agent.id, { addDirs: [...config.addDirs, path.trim()] });
                        }
                      }
                    }}
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                    Add Directory
                  </Button>
                </div>
              </Section>
            )}

            {/* Danger Zone */}
            <DangerZone agent={agent} onDeleted={() => selectAgent(null)} />
          </div>
        )}

        {activeSection === "logs" && (
          <div className="flex-1 overflow-hidden">
            <LogViewer agentId={agent.id} />
          </div>
        )}

        {activeSection === "soul" && (
          <div className="flex-1 overflow-hidden">
            <SoulEditor agentId={agent.id} />
          </div>
        )}

        {activeSection === "skills" && (
          <div className="flex-1 overflow-y-auto">
            <AgentSkills agentId={agent.id} />
          </div>
        )}

        {activeSection === "templates" && !showGallery && (
          <div className="flex-1 overflow-y-auto">
            <AgentTemplates managed={managed} />
            <div className="px-5 pb-5">
              <button
                onClick={() => setShowGallery(true)}
                className="w-full py-3 rounded-lg bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
              >
                <LayoutTemplate className="w-4 h-4" />
                Preview All Templates
              </button>
            </div>
          </div>
        )}

        {activeSection === "templates" && showGallery && (
          <div className="flex-1 overflow-hidden">
            <TemplateGallery onClose={() => setShowGallery(false)} />
          </div>
        )}

        {activeSection === "routines" && (
          <div className="flex-1 overflow-y-auto">
            <AgentRoutines agentId={agent.id} />
          </div>
        )}

        {activeSection === "canvas" && (
          <div className="flex-1 overflow-y-auto">
            <AgentCanvas managed={managed} />
          </div>
        )}

        {activeSection === "heartbeat" && (
          <HeartbeatPanel managed={managed} />
        )}

        {activeSection === "health" && (
          <HealthPanel managed={managed} />
        )}
      </div>
    </div>
  );
}

function HeartbeatPanel({ managed }: { managed: ManagedAgent }) {
  const [data, setData] = useState<HeartbeatData | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Editable fields
  const [heartbeatMd, setHeartbeatMd] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [activeStart, setActiveStart] = useState(8);
  const [activeEnd, setActiveEnd] = useState(22);
  const [timezone, setTimezone] = useState("Etc/UTC");
  const [dirty, setDirty] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const d = await getAgentHeartbeat(managed.agent.id);
      setData(d);
      setHeartbeatMd(d.heartbeatMd || "");
      setIntervalMinutes(d.heartbeatConfig?.intervalMinutes ?? 30);
      setActiveStart(d.heartbeatConfig?.activeHours?.start ?? 8);
      setActiveEnd(d.heartbeatConfig?.activeHours?.end ?? 22);
      setTimezone(d.heartbeatConfig?.timezone ?? "Etc/UTC");
      setDirty(false);
    } catch {
      // Non-fatal
    }
  }, [managed.agent.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isEnabled = data?.heartbeatConfig?.enabled ?? false;
  const status = data?.heartbeatConfig?.status ?? "active";
  const runCount = data?.heartbeatConfig?.runCount ?? 0;
  const failures = data?.heartbeatConfig?.consecutiveFailures ?? 0;
  const lastRun = data?.heartbeatConfig?.lastRunAt;
  const nextRun = data?.heartbeatConfig?.nextRunAt;

  const handleToggle = async () => {
    setActionLoading("toggle");
    try {
      if (isEnabled) {
        await disableAgentHeartbeat(managed.agent.id);
      } else {
        await enableAgentHeartbeat(managed.agent.id);
      }
      await fetchData();
    } catch {
      // ignore
    }
    setActionLoading(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAgentHeartbeat(managed.agent.id, {
        heartbeat_md: heartbeatMd,
        interval_minutes: intervalMinutes,
        active_hours: { start: activeStart, end: activeEnd },
        timezone,
      });
      await fetchData();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleTrigger = async () => {
    setActionLoading("trigger");
    try {
      await triggerAgentHeartbeat(managed.agent.id);
    } catch {
      // ignore
    }
    setActionLoading(null);
  };

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      <Section title="Heartbeat Mind">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {isEnabled ? "Enabled" : "Disabled"}
            </p>
            <p className="text-xs text-muted-foreground">
              Periodic autonomous thinking
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isEnabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleTrigger}
                disabled={actionLoading === "trigger"}
              >
                <Play className="h-3 w-3 mr-1" />
                {actionLoading === "trigger" ? "..." : "Trigger Now"}
              </Button>
            )}
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggle}
              disabled={actionLoading === "toggle"}
            />
          </div>
        </div>

        {isEnabled && (
          <div className="space-y-1 text-xs text-muted-foreground mt-2">
            <FieldRow label="Status" value={
              <Badge variant={status === "active" ? "default" : "secondary"}>
                {status === "active" ? "Active" : status === "paused" ? "Paused (auto)" : status}
              </Badge>
            } />
            <FieldRow label="Runs" value={String(runCount)} />
            {failures > 0 && (
              <FieldRow label="Consecutive Failures" value={
                <span className="text-destructive">{failures}</span>
              } />
            )}
            <FieldRow label="Last Run" value={formatTime(lastRun)} />
            <FieldRow label="Next Run" value={formatTime(nextRun)} />
          </div>
        )}
      </Section>

      <Separator />

      <Section title="Schedule">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Interval (minutes)</Label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={intervalMinutes}
              onChange={(e) => {
                setIntervalMinutes(Number(e.target.value));
                setDirty(true);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Active From</Label>
              <Select
                value={String(activeStart)}
                onValueChange={(v) => { setActiveStart(Number(v)); setDirty(true); }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {String(i).padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Active Until</Label>
              <Select
                value={String(activeEnd)}
                onValueChange={(v) => { setActiveEnd(Number(v)); setDirty(true); }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {String(i).padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Timezone</Label>
            <Select value={timezone} onValueChange={(v) => { if (v) { setTimezone(v); setDirty(true); } }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Europe/Berlin", "Europe/London", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "Etc/UTC"].map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Separator />

      <Section title="Checklist">
        <p className="text-xs text-muted-foreground mb-2">
          What should the agent evaluate on each heartbeat? The agent will message you only if something needs attention.
        </p>
        <textarea
          className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          value={heartbeatMd}
          onChange={(e) => { setHeartbeatMd(e.target.value); setDirty(true); }}
          placeholder="e.g., Check if any reminders are due..."
        />
      </Section>

      {dirty && (
        <div className="sticky bottom-0 bg-background border-t border-border pt-3 pb-1">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}

function HealthPanel({ managed }: { managed: ManagedAgent }) {
  const [detail, setDetail] = useState<AgentHealthDetail | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const data = await getAgentHealthDetail(managed.agent.id);
      setDetail(data);
    } catch {
      // Fleet health is still available via managed.health
    }
  }, [managed.agent.id]);

  useEffect(() => {
    fetchDetail();
    const interval = setInterval(fetchDetail, 5000);
    return () => clearInterval(interval);
  }, [fetchDetail]);

  const health = managed.health;
  if (!health) {
    return (
      <div className="text-center text-muted-foreground py-10 text-sm">
        No health data available
      </div>
    );
  }

  const handleAction = async (key: string, action: () => Promise<unknown>) => {
    setActionLoading(key);
    try {
      await action();
      await fetchDetail();
    } catch (e) {
      console.error(`Health action ${key} failed:`, e);
    } finally {
      setActionLoading(null);
    }
  };

  // Used for conditional action buttons
  const _hasStuckItems = (detail?.stuckTasks.length ?? 0) > 0 || (detail?.unackedMessages.length ?? 0) > 0;
  void _hasStuckItems;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Status Overview */}
      <Section title="Status">
        <FieldRow
          label="Health"
          value={
            <Badge
              variant="outline"
              className={cn(
                health.healthStatus === "healthy" && "border-success/30 text-success bg-success/10",
                health.healthStatus === "degraded" && "border-warning/30 text-warning bg-warning/10",
                (health.healthStatus === "stuck" || health.healthStatus === "offline") &&
                  "border-destructive/30 text-destructive bg-destructive/10"
              )}
            >
              {health.healthStatus}
            </Badge>
          }
        />
        <FieldRow
          label="Executors"
          value={`${health.onlineExecutorCount} / ${health.executorCount} online`}
        />
        <FieldRow label="Queued Tasks" value={String(health.queuedTasks)} />
        <FieldRow label="Queued Messages" value={String(health.queuedMessages)} />
        {health.stuckCount > 0 && (
          <FieldRow
            label="Stuck Items"
            value={
              <span className="text-destructive font-medium">{health.stuckCount}</span>
            }
          />
        )}
      </Section>

      {/* Quick Actions — always show Unstick, conditionally show others */}
      <Section title="Actions">
        <div className="flex flex-wrap gap-2 py-1">
          <Button
            size="sm"
            variant="outline"
            disabled={actionLoading !== null}
            onClick={() =>
              handleAction("unstick", () => unstickAgent(managed.agent.id))
            }
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            {actionLoading === "unstick" ? "Unsticking..." : "Unstick Agent"}
          </Button>
          {(health.queuedMessages > 0 || (detail?.unackedMessages.length ?? 0) > 0) && (
            <Button
              size="sm"
              variant="outline"
              disabled={actionLoading !== null}
              onClick={() =>
                handleAction("clear-messages", () => clearAgentMessages(managed.agent.id))
              }
            >
              <Inbox className="w-3.5 h-3.5 mr-1.5" />
              {actionLoading === "clear-messages" ? "Clearing..." : "Clear Messages"}
            </Button>
          )}
          {(health.queuedTasks > 0 || (detail?.stuckTasks.length ?? 0) > 0) && (
            <Button
              size="sm"
              variant="outline"
              disabled={actionLoading !== null}
              onClick={() =>
                handleAction("clear-tasks", () => clearAgentTasks(managed.agent.id))
              }
            >
              <ListTodo className="w-3.5 h-3.5 mr-1.5" />
              {actionLoading === "clear-tasks" ? "Clearing..." : "Clear Tasks"}
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={actionLoading !== null}
            onClick={() =>
              handleAction("reset", () => forceResetAgent(managed.agent.id))
            }
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            {actionLoading === "reset" ? "Resetting..." : "Force Reset"}
          </Button>
        </div>
      </Section>

      {/* Executors */}
      {detail && detail.executors.length > 0 && (
        <Section title="Executors">
          <div className="space-y-2">
            {detail.executors.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{ex.displayName || ex.executorKey}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0",
                      ex.status === "online" && "border-success/30 text-success",
                      ex.status === "offline" && "border-destructive/30 text-destructive",
                      ex.status === "disabled" && "border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {ex.status}
                  </Badge>
                  {ex.activeTaskCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">{ex.activeTaskCount} active</span>
                  )}
                </div>
                {ex.status !== "disabled" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={actionLoading !== null}
                    onClick={() =>
                      handleAction(`kill-${ex.id}`, () => killExecutor(managed.agent.id, ex.id))
                    }
                  >
                    {actionLoading === `kill-${ex.id}` ? "..." : "Kill"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Stuck Tasks */}
      {detail && detail.stuckTasks.length > 0 && (
        <Section title={`Stuck Tasks (${detail.stuckTasks.length})`}>
          <div className="space-y-1.5">
            {detail.stuckTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-md bg-destructive/5 border border-destructive/10"
              >
                <div className="min-w-0">
                  <div className="text-sm truncate">{task.title || "Untitled task"}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {task.status} for {formatDuration(task.elapsedSeconds)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Stuck Messages */}
      {detail && detail.unackedMessages.length > 0 && (
        <Section title={`Unacknowledged Messages (${detail.unackedMessages.length})`}>
          <div className="space-y-1.5">
            {detail.unackedMessages.map((msg) => (
              <div
                key={msg.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-md bg-warning/5 border border-warning/10"
              >
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Claimed for {formatDuration(msg.elapsedSeconds)}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

// --- Agent Header (editable name + avatar) ---

function AgentHeader({
  agent,
}: {
  agent: { id: string; displayName: string; avatarUrl?: string; description?: string; agentType?: string };
}) {
  const { fetchAgents } = useAgentStore();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(agent.displayName);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(agent.description || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === agent.displayName) {
      setEditingName(false);
      setName(agent.displayName);
      return;
    }
    setSaving(true);
    try {
      await updateAgent(agent.id, { displayName: trimmed });
      await fetchAgents();
      setEditingName(false);
    } catch {
      setName(agent.displayName);
      setEditingName(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDesc = async () => {
    const trimmed = desc.trim();
    if (trimmed === (agent.description || "")) {
      setEditingDesc(false);
      setDesc(agent.description || "");
      return;
    }
    setSaving(true);
    try {
      await updateAgent(agent.id, { description: trimmed || null });
      await fetchAgents();
      setEditingDesc(false);
    } catch {
      setDesc(agent.description || "");
      setEditingDesc(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setCropImage(url);
    };
    input.click();
  };

  const handleCropConfirm = async (blob: Blob) => {
    setCropImage(null);
    setUploadingAvatar(true);
    try {
      const filename = `avatars/${agent.id}.jpg`;
      const contentType = "image/jpeg";

      const { url: uploadUrl, publicUrl } = await presignAvatarUpload(filename, contentType);

      await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });

      const newUrl = `${publicUrl}?t=${Date.now()}`;
      await updateAgent(agent.id, { avatarUrl: newUrl });
      await fetchAgents();
    } catch (e) {
      console.error("Avatar upload failed:", e);
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <>
    <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
      {/* Clickable avatar with always-visible camera badge */}
      <button
        onClick={handleAvatarClick}
        disabled={uploadingAvatar}
        className="relative flex-shrink-0"
        title="Change avatar"
      >
        <Avatar className="h-9 w-9 rounded-lg">
          {agent.avatarUrl && <AvatarImage src={agent.avatarUrl} className="rounded-lg" />}
          <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
            {agent.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center border-2 border-card">
          <Camera className="w-2 h-2 text-primary-foreground" />
        </div>
      </button>

      {/* Editable name */}
      <div className="flex-1 min-w-0">
        {editingName ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 text-sm font-semibold"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") {
                  setName(agent.displayName);
                  setEditingName(false);
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleSaveName}
              disabled={saving}
            >
              <Check className="w-3.5 h-3.5 text-primary" />
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={() => {
              setName(agent.displayName);
              setEditingName(true);
            }}
          >
            <p className="text-sm font-semibold truncate">
              {agent.displayName}
            </p>
            <Pencil className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          </div>
        )}
        {editingDesc ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="h-6 text-[11px] text-muted-foreground"
              placeholder="Add a description..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveDesc();
                if (e.key === "Escape") {
                  setDesc(agent.description || "");
                  setEditingDesc(false);
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 flex-shrink-0"
              onClick={handleSaveDesc}
              disabled={saving}
            >
              <Check className="w-3 h-3 text-primary" />
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-1 cursor-pointer mt-0.5 group"
            onClick={() => {
              setDesc(agent.description || "");
              setEditingDesc(true);
            }}
          >
            <p className="text-[11px] text-muted-foreground truncate">
              {agent.description || "Add description..."}
            </p>
            <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
          </div>
        )}
      </div>
    </div>
    {cropImage && (
      <AvatarCropDialog
        open={!!cropImage}
        imageSrc={cropImage}
        onClose={() => {
          URL.revokeObjectURL(cropImage);
          setCropImage(null);
        }}
        onConfirm={(blob) => {
          URL.revokeObjectURL(cropImage);
          handleCropConfirm(blob);
        }}
      />
    )}
    </>
  );
}

// --- Danger Zone ---

function DangerZone({
  agent,
  onDeleted,
}: {
  agent: { id: string; displayName: string; metadata?: Record<string, unknown> };
  onDeleted: () => void;
}) {
  const { fetchAgents, stopAgent } = useAgentStore();
  const [showDelete, setShowDelete] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleDeactivate = async () => {
    setDeactivating(true);
    setError(null);
    try {
      await stopAgent(agent.id).catch(() => {});
      await deleteAgent(agent.id);
      await fetchAgents();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate");
    } finally {
      setDeactivating(false);
    }
  };

  const handleDeletePermanently = async () => {
    if (confirmName !== agent.displayName) return;
    setDeleting(true);
    setError(null);
    try {
      await stopAgent(agent.id).catch(() => {});
      await deleteAgentPermanently(agent.id, confirmName);
      setShowDelete(false);
      await fetchAgents();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const fetchConnections = useCallback(async () => {
    setLoadingConns(true);
    try {
      const { connections: conns } = await listConnections();
      // Filter to connections involving this agent
      const relevant = conns.filter(
        (c) => c.agentId === agent.id || c.requesterId === agent.id
      );
      setConnections(relevant);
    } catch {
      setConnections([]);
    } finally {
      setLoadingConns(false);
    }
  }, [agent.id]);

  const handleRevoke = async (connId: string) => {
    setRevokingId(connId);
    try {
      await revokeConnection(connId);
      setConnections((prev) => prev.filter((c) => c.id !== connId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <>
      <Separator className="my-2" />
      <Section title="Danger Zone">
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => {
              setShowConnections(true);
              fetchConnections();
            }}
          >
            <Unlink className="w-3.5 h-3.5 mr-2" />
            Manage Connections
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-warning hover:text-warning"
            onClick={handleDeactivate}
            disabled={deactivating}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-2" />
            {deactivating ? "Deactivating..." : "Deactivate Agent"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete Permanently
          </Button>
        </div>
      </Section>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Agent Permanently</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete <strong>{agent.displayName}</strong> and all
              associated data. This action cannot be undone.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                Type <strong>{agent.displayName}</strong> to confirm
              </label>
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={agent.displayName}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              variant="destructive"
              className="w-full"
              disabled={confirmName !== agent.displayName || deleting}
              onClick={handleDeletePermanently}
            >
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Connections Dialog */}
      <Dialog open={showConnections} onOpenChange={setShowConnections}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connections</DialogTitle>
          </DialogHeader>
          {loadingConns ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Loading...
            </p>
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No connections for this agent.
            </p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {conn.agentName || conn.requesterName || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {conn.status}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={revokingId === conn.id}
                    onClick={() => handleRevoke(conn.id)}
                  >
                    {revokingId === conn.id ? "..." : "Disconnect"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
