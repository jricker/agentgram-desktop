import { useState, useMemo } from "react";
import { useAgentStore, type ManagedAgent } from "../stores/agentStore";
import { LogViewer } from "./LogViewer";
import { SoulEditor } from "./SoulEditor";
import {
  PROVIDERS,
  EXECUTION_MODES,
  getModelsForProvider,
  getSupportedModes,
  normalizeModelName,
} from "../lib/models";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronRight,
  LayoutTemplate,
} from "lucide-react";
import { AgentSkills } from "./AgentSkills";
import { AgentTemplates } from "./AgentTemplates";

export function AgentConfig({ managed }: { managed: ManagedAgent }) {
  const { updateConfig, regenerateKey, selectAgent } = useAgentStore();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const hasAppDefault = useMemo(() => {
    const raw = localStorage.getItem("llmDefaults");
    if (!raw) return false;
    try {
      const defaults = JSON.parse(raw);
      return !!defaults[backend]?.apiKey;
    } catch {
      return false;
    }
  }, [backend]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10 rounded-lg">
            {agent.avatarUrl && <AvatarImage src={agent.avatarUrl} className="rounded-lg" />}
            <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-sm font-semibold">
              {agent.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {agent.displayName}
            </p>
            <p className="text-xs text-muted-foreground">
              {agent.agentType || "worker"}
              {agent.description && ` · ${agent.description}`}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => selectAgent(null)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Separator />

      <Tabs defaultValue="config" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-3 h-auto py-0">
          {([
            { value: "config", label: "Config", icon: Settings2 },
            { value: "logs", label: "Logs", icon: ScrollText },
            { value: "soul", label: "Soul", icon: FileText },
            { value: "skills", label: "Skills", icon: Sparkles },
            { value: "templates", label: "Templates", icon: LayoutTemplate },
            { value: "health", label: "Health", icon: Activity },
          ] as const).map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-2.5 py-2 text-xs"
            >
              <tab.icon className="w-3 h-3 mr-1" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="config" className="flex-1 overflow-y-auto mt-0">
          <div className="p-5 space-y-6">
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
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">API Key</Label>
                    {!config.llmApiKey && hasAppDefault && (
                      <Badge variant="secondary" className="text-[10px] py-0">
                        App default
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type={showLlmKey ? "text" : "password"}
                      value={config.llmApiKey || ""}
                      onChange={(e) =>
                        updateConfig(agent.id, {
                          llmApiKey: e.target.value || null,
                        })
                      }
                      placeholder={
                        hasAppDefault ? "Using app default" : "sk-..."
                      }
                      className="flex-1"
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

            {/* Advanced */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full">
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 transition-transform",
                    advancedOpen && "rotate-90"
                  )}
                />
                Advanced
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max Tokens</Label>
                    <Input
                      type="number"
                      value={config.maxTokens}
                      onChange={(e) =>
                        updateConfig(agent.id, {
                          maxTokens: parseInt(e.target.value) || 4096,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum tokens the LLM can generate per response
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">History Limit</Label>
                    <Input
                      type="number"
                      value={config.historyLimit}
                      min={1}
                      max={30}
                      onChange={(e) =>
                        updateConfig(agent.id, {
                          historyLimit: parseInt(e.target.value) || 20,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of prior messages included as context (max 30)
                    </p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="flex-1 overflow-hidden mt-0">
          <LogViewer agentId={agent.id} />
        </TabsContent>

        <TabsContent value="soul" className="flex-1 overflow-hidden mt-0">
          <SoulEditor agentId={agent.id} />
        </TabsContent>

        <TabsContent value="skills" className="flex-1 overflow-y-auto mt-0">
          <AgentSkills agentId={agent.id} />
        </TabsContent>

        <TabsContent value="templates" className="flex-1 overflow-y-auto mt-0">
          <AgentTemplates managed={managed} />
        </TabsContent>

        <TabsContent value="health" className="flex-1 overflow-y-auto mt-0">
          <div className="p-5">
            {managed.health ? (
              <Section title="Agent Health">
                <FieldRow
                  label="Status"
                  value={
                    <Badge
                      variant="outline"
                      className={cn(
                        managed.health.healthStatus === "healthy" &&
                          "border-success/30 text-success bg-success/10",
                        managed.health.healthStatus === "degraded" &&
                          "border-warning/30 text-warning bg-warning/10",
                        (managed.health.healthStatus === "stuck" ||
                          managed.health.healthStatus === "offline") &&
                          "border-destructive/30 text-destructive bg-destructive/10"
                      )}
                    >
                      {managed.health.healthStatus}
                    </Badge>
                  }
                />
                <FieldRow
                  label="Executors"
                  value={`${managed.health.onlineExecutorCount} / ${managed.health.executorCount} online`}
                />
                <FieldRow
                  label="Queued Tasks"
                  value={String(managed.health.queuedTasks)}
                />
                <FieldRow
                  label="Queued Messages"
                  value={String(managed.health.queuedMessages)}
                />
                <FieldRow
                  label="Stuck"
                  value={String(managed.health.stuckCount)}
                />
              </Section>
            ) : (
              <div className="text-center text-muted-foreground py-10 text-sm">
                No health data available
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
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
