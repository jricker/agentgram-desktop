import { useState, useMemo, useEffect } from "react";
import { useAgentStore } from "../stores/agentStore";
import { useLlmKeyStore } from "../stores/llmKeyStore";
import {
  EXECUTION_MODES,
  EFFORT_LEVELS,
} from "../lib/models";
import { useModelCatalog } from "../stores/modelCatalogStore";
import {
  updateAgent,
  listSkills,
  assignSkill,
  type Skill,
} from "../lib/api";
import { uploadProcessedBlob } from "../lib/imageProcessor";
import { useFieldLimits } from "../lib/fieldLimits";
import { useAgentTypes } from "../lib/agentTypes";
import {
  Bot,
  Workflow,
  Camera,
  Eye,
  EyeOff,
  ShieldOff,
  Sparkles,
  Check,
  Plus,
  ArrowLeft,
  ClipboardCheck,
} from "lucide-react";

// Icons stay client-side (UX choice, not catalog data). Backend supplies
// the canonical id/label/description list via /api/agent-types.
const TYPE_ICONS: Record<string, typeof Bot> = {
  worker: Bot,
  orchestrator: Workflow,
  reviewer: ClipboardCheck,
  observer: Eye,
};
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
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { BotMascot } from "./onboarding/BotMascot";
import { LetterReveal } from "./onboarding/LetterReveal";
import { AmbientParticles } from "./onboarding/AmbientParticles";

const STEPS = ["identity", "type", "brain", "skills", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_TITLES: Record<Step, string> = {
  identity: "Bring an agent to life",
  type: "How do they work?",
  brain: "Pick a brain",
  skills: "Add a few skills",
  review: "Last look",
};

const STEP_SUBTITLES: Record<Step, string> = {
  identity: "Pick something memorable — you can always change it later.",
  type: "Set the rhythm. You can change this later.",
  brain: "Which AI model powers them.",
  skills: "Optional add-ons. Auto-included ones are shown for context.",
  review: "Review and create. Anything can be changed later.",
};

export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const { createAgent, selectAgent, fetchAgents } = useAgentStore();
  const llmKeyStore = useLlmKeyStore();
  // The keys list is backend-backed and lazily loaded. Mounting this
  // modal might be the first time anything in the app touches the
  // store (Profile / AgentConfig refresh on mount, but the user can
  // open Create Agent before either screen). Without this refresh,
  // getDefaultKey() returns null and the brain step shows the raw
  // API-key input instead of "Provider Default".
  const llmKeysLoaded = useLlmKeyStore((s) => s.loaded);
  const refreshLlmKeys = useLlmKeyStore((s) => s.refresh);
  useEffect(() => {
    if (!llmKeysLoaded) refreshLlmKeys();
  }, [llmKeysLoaded, refreshLlmKeys]);

  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState("worker");
  const [backend, setBackend] = useState("claude_cli");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  // When the user already has a default key for the selected provider,
  // they can pick: the default, an existing named key, or "Custom Key for
  // this agent" (which doesn't change the default).
  // - "__default__" — no llmApiKeyId on the agent; resolves to the
  //   provider default at runtime.
  // - "__custom__"  — apiKey field is shown; the entered key is saved as
  //   a non-default credential and assigned to this agent only.
  // - "<id>"        — an existing key id; assigned to this agent only.
  // Reset to "__default__" whenever the backend changes.
  const [keySelection, setKeySelection] = useState<string>("__default__");
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState("tool_use");
  const [effort, setEffort] = useState<string | null>(null);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  // Tracks the agent created in a partial-success run so a Retry click
  // doesn't double-create. Set after createAgent succeeds; persists for
  // the lifetime of the modal.
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const limits = useFieldLimits();
  const [error, setError] = useState<string | null>(null);

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

  const catalog = useModelCatalog();
  useEffect(() => {
    void catalog.ensureLoaded();
  }, [catalog]);
  const PROVIDERS = catalog.providers;
  const models = useMemo(() => catalog.modelsFor(backend), [catalog, backend]);
  const supportedModes = useMemo(
    () => catalog.supportedModesFor(backend),
    [catalog, backend]
  );
  const needsApiKey = catalog.requiresLlmKey(backend);
  const providerKeys = useMemo(
    () => llmKeyStore.getKeysForProvider(backend),
    [llmKeyStore, backend]
  );
  const hasDefaultKey = llmKeyStore.getDefaultKey(backend) !== null;
  // Show the raw API-key input either:
  //   - the user has no default for this provider (the entered key BECOMES the default), or
  //   - they explicitly chose "Custom Key for this agent" from the picker.
  const showApiKeyInput =
    needsApiKey && (!hasDefaultKey || keySelection === "__custom__");
  const showEffort = backend === "claude_cli";

  // Skills filter — see notes in original implementation.
  const isAutoIncluded = (s: Skill) => {
    if (s.scope !== "global" && s.scope !== "owner") return false;
    const rules = s.activationRules;
    if (!rules || Object.keys(rules).length === 0) return true;
    const rt = rules.requires_tools as unknown[] | undefined;
    const rat = rules.requires_any_tools as unknown[] | undefined;
    if ((rt && rt.length > 0) || (rat && rat.length > 0)) return false;
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
    const newModels = catalog.modelsFor(newBackend);
    if (newModels.length > 0) {
      setModel(newModels[0].id);
    }
    const newModes = catalog.supportedModesFor(newBackend);
    if (!newModes.includes(executionMode)) {
      setExecutionMode(newModes.includes("tool_use") ? "tool_use" : newModes[0]);
    }
    if (newBackend !== "claude_cli") {
      setEffort(null);
    }
    setApiKey("");
    setKeySelection("__default__");
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

  const types = useAgentTypes();

  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const canAdvance = useMemo(() => {
    switch (step) {
      case "identity":
        return name.trim().length > 0;
      case "type":
        return true;
      case "brain":
        return showApiKeyInput ? apiKey.trim().length > 0 : true;
      case "skills":
        return true;
      case "review":
        return name.trim().length > 0 && (!showApiKeyInput || apiKey.trim().length > 0);
    }
  }, [step, name, apiKey, showApiKeyInput]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (showApiKeyInput && !apiKey.trim()) return;

    setLoading(true);
    setError(null);
    try {
      let id = createdAgentId;

      if (!id) {
        // Resolve the per-agent key:
        //  - no default + key entered  → save as default; agent resolves
        //    to that default at runtime (no llmApiKeyId pinned).
        //  - "__custom__" + key entered → save as a non-default credential
        //    and pin THIS agent to its id; default unaffected.
        //  - existing-id selected      → pin THIS agent; default unaffected.
        //  - "__default__"             → no llmApiKeyId; runtime resolves
        //    to the user's default for the provider.
        let pinnedKeyId: string | null = null;
        if (needsApiKey && apiKey.trim()) {
          const provider = PROVIDERS.find((p) => p.id === backend);
          const baseLabel = provider?.label || backend;
          const makeDefault = !hasDefaultKey;
          const label = makeDefault ? `${baseLabel} Key` : `${baseLabel} (${name.trim()})`;
          try {
            const newId = await llmKeyStore.addKey(backend, label, apiKey.trim(), {
              makeDefault,
            });
            // Only pin when the user explicitly asked for a per-agent key.
            // If the new key is becoming the default, leave it as default
            // resolution so any future agents on the same provider also
            // pick it up automatically.
            if (!makeDefault) pinnedKeyId = newId;
          } catch (e) {
            setError(
              e instanceof Error
                ? `Couldn't save API key: ${e.message}`
                : "Couldn't save API key. The agent has not been created."
            );
            setLoading(false);
            return;
          }
        } else if (
          needsApiKey &&
          keySelection !== "__default__" &&
          keySelection !== "__custom__"
        ) {
          // User picked an existing saved key by id.
          pinnedKeyId = keySelection;
        }

        id = await createAgent({
          displayName: name.trim(),
          description: description.trim() || undefined,
          agentType,
          backend,
          model,
          executionMode,
          effort: effort || undefined,
          dangerouslySkipPermissions: skipPermissions,
          llmApiKeyId: pinnedKeyId,
        });
        setCreatedAgentId(id);

        if (selectedSkillIds.size > 0) {
          await Promise.allSettled(
            Array.from(selectedSkillIds).map((skillId) => assignSkill(skillId, id!))
          );
        }
      }

      let avatarUploadFailed: string | null = null;
      if (avatarFile) {
        try {
          const newUrl = await uploadProcessedBlob(
            avatarFile,
            avatarFile.type || "image/jpeg",
            `avatars/${id}`
          );
          await updateAgent(id, { avatarUrl: newUrl });
          await fetchAgents();
        } catch (e) {
          avatarUploadFailed =
            e instanceof Error ? e.message : "Avatar upload failed";
        }
      }

      selectAgent(id);

      if (avatarUploadFailed) {
        setError(
          `${avatarUploadFailed} The agent was created — click Create again to retry the avatar, or close to skip.`
        );
        setLoading(false);
        return;
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  const advance = () => {
    if (!canAdvance) return;
    if (step === "review") {
      void handleCreate();
    } else {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }
  };

  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    advance();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
          <div className="relative">
            <AmbientParticles count={14} />

            {/* Header — bot + reveal title (re-runs each step via key) */}
            <div className="relative px-6 pt-7 pb-3 flex flex-col items-center text-center gap-3">
              <BotMascot size={64} />
              <div className="space-y-1">
                <DialogTitle className="text-lg font-semibold text-foreground">
                  <LetterReveal
                    key={step}
                    text={STEP_TITLES[step]}
                    delayPerChar={28}
                  />
                </DialogTitle>
                <p className="text-sm text-text-muted min-h-[2.5em]">
                  {STEP_SUBTITLES[step]}
                </p>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === stepIndex
                        ? "w-6 bg-accent"
                        : i < stepIndex
                          ? "w-1.5 bg-accent/60"
                          : "w-1.5 bg-border"
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Step body */}
            <div className="relative px-6 pb-3 max-h-[55vh] overflow-y-auto">
              <form
                onSubmit={onFormSubmit}
                key={step}
                className="space-y-4 pt-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
              >
                {step === "identity" && (
                  <div className="space-y-4">
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
                        <div className="flex items-baseline justify-between">
                          <Label htmlFor="agent-name">
                            What should we call them?
                          </Label>
                          <span className="text-xs text-text-muted tabular-nums">
                            {name.length}/{limits.agent.displayName}
                          </span>
                        </div>
                        <Input
                          id="agent-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Atlas, Scout, Luna..."
                          required
                          autoFocus
                          maxLength={limits.agent.displayName}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <Label htmlFor="agent-desc">What will they do?</Label>
                        <span className="text-xs text-text-muted tabular-nums">
                          {description.length}/{limits.agent.description}
                        </span>
                      </div>
                      <Input
                        id="agent-desc"
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Writes code, fixes bugs, ships fast"
                        maxLength={limits.agent.description}
                      />
                    </div>
                  </div>
                )}

                {step === "type" && (
                  <div className="grid grid-cols-2 gap-3">
                    {types.map((t) => {
                      const Icon = TYPE_ICONS[t.id] ?? Bot;
                      const selected = agentType === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setAgentType(t.id)}
                          className={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors text-center",
                            selected
                              ? "border-accent-hover bg-accent-light"
                              : "border-border hover:border-border-strong"
                          )}
                        >
                          <Icon
                            className={cn(
                              "w-6 h-6",
                              selected ? "text-accent-hover" : "text-text-muted"
                            )}
                          />
                          <div>
                            <div
                              className={cn(
                                "text-sm font-medium",
                                selected ? "text-accent-hover" : "text-text"
                              )}
                            >
                              {t.label}
                            </div>
                            <div className="text-xs text-text-muted mt-0.5">
                              {t.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {step === "brain" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Provider</Label>
                        <Select
                          value={backend}
                          onValueChange={(v) => v && handleBackendChange(v)}
                        >
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

                    <div
                      className={cn(
                        "grid gap-3",
                        showEffort ? "grid-cols-2" : "grid-cols-1"
                      )}
                    >
                      <div className="space-y-1.5">
                        <Label>Execution Mode</Label>
                        <Select
                          value={executionMode}
                          onValueChange={(v) => v && setExecutionMode(v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXECUTION_MODES.filter((m) =>
                              supportedModes.includes(m.id)
                            ).map((m) => (
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
                          <Select
                            value={effort || "high"}
                            onValueChange={(v) => v && setEffort(v)}
                          >
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

                    {needsApiKey && hasDefaultKey && (
                      <div className="space-y-1.5">
                        <Label>
                          {PROVIDERS.find((p) => p.id === backend)?.label} API Key
                        </Label>
                        <Select
                          value={keySelection}
                          onValueChange={(v) => {
                            setKeySelection(String(v));
                            if (v !== "__custom__") setApiKey("");
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue>
                              {(val: unknown) => {
                                const v = String(val);
                                if (v === "__default__") return "Provider Default";
                                if (v === "__custom__") return "Custom Key for this agent…";
                                return providerKeys.find((k) => k.id === v)?.label ?? v;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Provider Default</SelectItem>
                            {providerKeys
                              .filter((k) => !k.isDefault)
                              .map((k) => (
                                <SelectItem key={k.id} value={k.id}>
                                  {k.label}
                                </SelectItem>
                              ))}
                            <SelectItem value="__custom__">Custom Key for this agent…</SelectItem>
                          </SelectContent>
                        </Select>
                        {keySelection === "__default__" && (
                          <p className="text-xs text-text-muted">
                            Uses your saved default — won't be changed.
                          </p>
                        )}
                        {keySelection !== "__default__" && keySelection !== "__custom__" && (
                          <p className="text-xs text-text-muted">
                            This agent will use the selected key. Default unchanged.
                          </p>
                        )}
                      </div>
                    )}

                    {showApiKeyInput && (
                      <div className="space-y-1.5">
                        <Label htmlFor="llm-api-key">
                          {hasDefaultKey
                            ? "New API Key (this agent only)"
                            : `${PROVIDERS.find((p) => p.id === backend)?.label} API Key`}
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
                          {hasDefaultKey
                            ? "Saved for this agent only — your provider default stays as-is."
                            : `Saved as your default key for ${PROVIDERS.find((p) => p.id === backend)?.label}.`}
                        </p>
                      </div>
                    )}

                    {(backend === "claude_cli" || backend === "anthropic") && (
                      <label className="flex items-start gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={skipPermissions}
                          onChange={(e) => setSkipPermissions(e.target.checked)}
                          className="mt-0.5 rounded border-border"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-medium text-text group-hover:text-accent-hover transition-colors">
                            <ShieldOff className="w-3.5 h-3.5" />
                            Skip permission prompts
                          </div>
                          <p className="text-xs text-text-muted mt-0.5">
                            Faster but less safe — agents won't ask before running tools.
                          </p>
                        </div>
                      </label>
                    )}
                  </div>
                )}

                {step === "skills" && (
                  <div className="space-y-3">
                    {skillsError && (
                      <p className="text-[11px] text-destructive">
                        Couldn't load skills: {skillsError}
                      </p>
                    )}

                    {availableSkills.length === 0 && !skillsError && (
                      <p className="text-sm text-text-muted text-center py-4">
                        No skills available — they'll be added once unlocked.
                      </p>
                    )}

                    {autoSkills.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-muted">
                          <Sparkles className="w-3 h-3" />
                          Included automatically
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {autoSkills.map((s) => (
                            <Badge
                              key={s.id}
                              variant="secondary"
                              className="text-xs py-0.5 gap-1"
                            >
                              <Check className="w-3 h-3 text-success" />
                              {s.displayName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {optionalSkills.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
                          Optional — click to add
                        </Label>
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
                                    ? "border-accent-hover bg-accent-light text-accent-hover"
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

                {step === "review" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface-raised">
                      <Avatar className="h-12 w-12 rounded-lg">
                        {avatarPreview && (
                          <AvatarImage
                            src={avatarPreview}
                            className="rounded-lg object-cover"
                          />
                        )}
                        <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-sm font-semibold">
                          {initials || <Bot className="w-5 h-5" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground truncate">
                          {name.trim() || "Unnamed"}
                        </div>
                        {description.trim() && (
                          <div className="text-xs text-text-muted truncate">
                            {description.trim()}
                          </div>
                        )}
                      </div>
                    </div>

                    <ReviewRow
                      label="Type"
                      value={
                        types.find((t) => t.id === agentType)?.label || agentType
                      }
                    />
                    <ReviewRow
                      label="Provider"
                      value={
                        PROVIDERS.find((p) => p.id === backend)?.label || backend
                      }
                    />
                    <ReviewRow
                      label="Model"
                      value={
                        models.find((m) => m.id === model)?.label || model
                      }
                    />
                    {selectedSkillIds.size > 0 && (
                      <ReviewRow
                        label="Skills"
                        value={`${selectedSkillIds.size} optional`}
                      />
                    )}
                  </div>
                )}

                {error && (
                  <div className="text-sm text-danger bg-danger-light px-3 py-2 rounded-md">
                    {error}
                  </div>
                )}
              </form>
            </div>

            {/* Footer nav */}
            <div className="relative px-6 py-4 border-t border-border bg-background/80 backdrop-blur-sm flex items-center justify-between">
              {stepIndex > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={back}
                  disabled={loading}
                  className="gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
              )}

              <Button
                type="button"
                onClick={advance}
                disabled={!canAdvance || loading}
              >
                {step === "review"
                  ? loading
                    ? "Bringing them to life..."
                    : "Create Agent"
                  : "Next"}
              </Button>
            </div>
          </div>
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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-text-muted">{label}</span>
      <span className="text-foreground font-medium truncate ml-3">{value}</span>
    </div>
  );
}
