import { useState, useMemo, useEffect } from "react";
import { useAgentStore } from "../stores/agentStore";
import { useLlmKeyStore } from "../stores/llmKeyStore";
import {
  PROVIDERS,
  EXECUTION_MODES,
  EFFORT_LEVELS,
  getModelsForProvider,
  getSupportedModes,
  providerRequiresLlmKey,
} from "../lib/models";
import {
  presignAvatarUpload,
  updateAgent,
  listSkills,
  assignSkill,
  type Skill,
} from "../lib/api";
import { Bot, Workflow, Camera, Eye, EyeOff, ShieldOff, Sparkles, Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "../lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarCropDialog } from "./AvatarCropDialog";

export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const { createAgent, selectAgent, fetchAgents } = useAgentStore();
  const llmKeyStore = useLlmKeyStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState("worker");
  const [backend, setBackend] = useState("claude_cli");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState("tool_use");
  const [effort, setEffort] = useState<string | null>(null);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available skills on mount
  const [skillsError, setSkillsError] = useState<string | null>(null);
  useEffect(() => {
    listSkills()
      .then((res) => setAvailableSkills(res.skills || []))
      .catch((err) => {
        console.warn("[CreateAgentModal] listSkills failed:", err);
        setSkillsError(
          err instanceof Error ? err.message : "Failed to load skills"
        );
      });
  }, []);

  const models = useMemo(() => getModelsForProvider(backend), [backend]);
  const supportedModes = useMemo(() => getSupportedModes(backend), [backend]);
  const needsApiKey = providerRequiresLlmKey(backend);
  const hasDefaultKey = llmKeyStore.getDefaultKey(backend) !== null;
  const showApiKeyInput = needsApiKey && !hasDefaultKey;
  const showEffort = backend === "claude_cli";

  // Split skills into auto-included vs optional.
  // A skill is auto-included if it's global/owner AND either:
  //   - has no activation_rules, OR
  //   - only has agent_types gating that matches the selected agent type
  // Skills gated on tools (requires_tools, requires_any_tools) are conditional
  // and hidden — they activate at runtime when the agent gets matching tools.
  const isAutoIncluded = (s: Skill) => {
    if (s.scope !== "global" && s.scope !== "owner") return false;
    const rules = s.activationRules;
    if (!rules || Object.keys(rules).length === 0) return true;
    // Tool-gated skills are not auto-included
    const rt = rules.requires_tools as unknown[] | undefined;
    const rat = rules.requires_any_tools as unknown[] | undefined;
    if ((rt && rt.length > 0) || (rat && rat.length > 0)) return false;
    // agent_types gating — include if the selected type matches
    const types = rules.agent_types as string[] | undefined;
    if (types && types.length > 0) return types.includes(agentType);
    return true;
  };

  const autoSkills = useMemo(
    () => availableSkills.filter(isAutoIncluded),
    [availableSkills, agentType]
  );
  const optionalSkills = useMemo(
    () => availableSkills.filter((s) => s.scope === "agent"),
    [availableSkills]
  );

  const toggleSkill = (id: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBackendChange = (newBackend: string) => {
    setBackend(newBackend);
    const newModels = getModelsForProvider(newBackend);
    if (newModels.length > 0) {
      setModel(newModels[0].id);
    }
    // Reset execution mode if not supported by new backend
    const newModes = getSupportedModes(newBackend);
    if (!newModes.includes(executionMode)) {
      setExecutionMode(newModes.includes("tool_use") ? "tool_use" : newModes[0]);
    }
    // Reset effort if not claude_cli
    if (newBackend !== "claude_cli") {
      setEffort(null);
    }
    setApiKey("");
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

  const handleCropConfirm = (blob: Blob) => {
    setCropImage(null);
    setAvatarFile(blob);
    setAvatarPreview(URL.createObjectURL(blob));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (showApiKeyInput && !apiKey.trim()) return;

    setLoading(true);
    setError(null);
    try {
      // If user entered an API key, save it as the provider default
      if (apiKey.trim() && needsApiKey) {
        const provider = PROVIDERS.find((p) => p.id === backend);
        const label = `${provider?.label || backend} Key`;
        llmKeyStore.addKey(backend, label, apiKey.trim());
      }

      const id = await createAgent({
        displayName: name.trim(),
        description: description.trim() || undefined,
        agentType,
        backend,
        model,
        executionMode,
        effort: effort || undefined,
        dangerouslySkipPermissions: skipPermissions,
      });

      // Upload avatar if one was selected
      if (avatarFile) {
        try {
          const filename = `avatars/${id}.jpg`;
          const contentType = "image/jpeg";
          const { url: uploadUrl, publicUrl } = await presignAvatarUpload(
            filename,
            contentType
          );
          await fetch(uploadUrl, {
            method: "PUT",
            body: avatarFile,
            headers: { "Content-Type": contentType },
          });
          await updateAgent(id, {
            avatarUrl: `${publicUrl}?t=${Date.now()}`,
          });
          await fetchAgents();
        } catch {
          // Avatar upload is non-fatal — agent is still created
          console.error("Avatar upload failed, agent created without avatar");
        }
      }

      // Assign selected optional skills
      if (selectedSkillIds.size > 0) {
        await Promise.allSettled(
          Array.from(selectedSkillIds).map((skillId) => assignSkill(skillId, id))
        );
      }

      selectAgent(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  const types = [
    {
      id: "worker",
      label: "Worker",
      desc: "Does tasks when asked",
      icon: Bot,
    },
    {
      id: "orchestrator",
      label: "Orchestrator",
      desc: "Coordinates other agents",
      icon: Workflow,
    },
  ];

  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            {/* Avatar + Name row */}
            <div className="flex items-end gap-3">
              <button
                type="button"
                onClick={handleAvatarClick}
                className="relative flex-shrink-0 group"
                title="Add profile picture"
              >
                <Avatar className="h-14 w-14 rounded-lg">
                  {avatarPreview && (
                    <AvatarImage
                      src={avatarPreview}
                      className="rounded-lg object-cover"
                    />
                  )}
                  <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-lg font-semibold">
                    {initials || (
                      <Camera className="w-5 h-5 text-text-muted" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </button>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Scout"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-desc">Description</Label>
              <Input
                id="agent-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Research assistant"
              />
            </div>

            {/* Agent Type */}
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-3">
                {types.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAgentType(t.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors",
                      agentType === t.id
                        ? "border-accent bg-accent-light"
                        : "border-border hover:border-border-strong"
                    )}
                  >
                    <t.icon
                      className={cn(
                        "w-5 h-5",
                        agentType === t.id ? "text-accent" : "text-text-muted"
                      )}
                    />
                    <div>
                      <div
                        className={cn(
                          "text-sm font-medium",
                          agentType === t.id ? "text-accent" : "text-text"
                        )}
                      >
                        {t.label}
                      </div>
                      <div className="text-xs text-text-muted">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* LLM Provider + Model — same grid as Type cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={backend} onValueChange={(v) => v && handleBackendChange(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Select value={model} onValueChange={(v) => v && setModel(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Execution Mode + Effort — same grid layout */}
            <div className={cn("grid gap-3", showEffort ? "grid-cols-2" : "grid-cols-1")}>
              <div className="space-y-1.5">
                <Label>Execution Mode</Label>
                <Select value={executionMode} onValueChange={(v) => v && setExecutionMode(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXECUTION_MODES.filter((m) => supportedModes.includes(m.id)).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showEffort && (
                <div className="space-y-1.5">
                  <Label>Effort</Label>
                  <Select value={effort || "high"} onValueChange={(v) => v && setEffort(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EFFORT_LEVELS.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* API Key — only if provider needs one and no default is set */}
            {showApiKeyInput && (
              <div className="space-y-1.5">
                <Label htmlFor="llm-api-key">
                  {PROVIDERS.find((p) => p.id === backend)?.label} API Key
                </Label>
                <div className="relative">
                  <Input
                    id="llm-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-text-muted">
                  This will be saved as your default key for{" "}
                  {PROVIDERS.find((p) => p.id === backend)?.label}.
                </p>
              </div>
            )}

            {/* API key already configured notice */}
            {needsApiKey && hasDefaultKey && (
              <p className="text-xs text-text-muted bg-surface-raised px-3 py-2 rounded-md">
                Using your saved{" "}
                {PROVIDERS.find((p) => p.id === backend)?.label} API key.
              </p>
            )}

            {/* Skip permissions — Anthropic / Claude Code only */}
            {(backend === "claude_cli" || backend === "anthropic") && (
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={skipPermissions}
                  onChange={(e) => setSkipPermissions(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-text group-hover:text-accent transition-colors">
                    <ShieldOff className="w-3.5 h-3.5" />
                    Skip permission prompts
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Agent won't ask for confirmation before running tools. Faster but less safe.
                  </p>
                </div>
              </label>
            )}

            {/* Skills */}
            {skillsError && (
              <p className="text-[11px] text-destructive">
                Couldn't load skills: {skillsError}
              </p>
            )}
            {availableSkills.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Skills
                </Label>

                {/* Auto-included skills */}
                {autoSkills.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-text-muted uppercase tracking-wider font-medium">
                      Included automatically
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {autoSkills.map((s) => (
                        <Badge
                          key={s.id}
                          variant="secondary"
                          className="text-xs py-0.5 gap-1"
                        >
                          <Check className="w-3 h-3 text-green-500" />
                          {s.displayName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optional skills */}
                {optionalSkills.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-text-muted uppercase tracking-wider font-medium">
                      Optional — click to add
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {optionalSkills.map((s) => {
                        const selected = selectedSkillIds.has(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleSkill(s.id)}
                            className={cn(
                              "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors",
                              selected
                                ? "border-accent bg-accent-light text-accent"
                                : "border-border text-text-muted hover:border-border-strong hover:text-text"
                            )}
                          >
                            {selected ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            {s.displayName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="text-sm text-danger bg-danger-light px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  loading ||
                  !name.trim() ||
                  (showApiKeyInput && !apiKey.trim())
                }
              >
                {loading ? "Creating..." : "Create Agent"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AvatarCropDialog
        open={!!cropImage}
        imageSrc={cropImage || ""}
        onClose={() => setCropImage(null)}
        onConfirm={handleCropConfirm}
      />
    </>
  );
}
