import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import * as api from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  X,
  LogOut,
  User,
  Link2,
  Mail,
  Github,
  Cloud,
  Database,
  Key,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  Unlink,
  Eye,
  EyeOff,
  Plus,
  Pencil,
  Trash2,
  Globe,
} from "lucide-react";
import { open as tauriOpen } from "@tauri-apps/plugin-shell";
import { PROVIDERS } from "../lib/models";
import { useLlmKeyStore, type LlmApiKey as LlmApiKeyEntry } from "../stores/llmKeyStore";

/** Open a URL in the system browser — Tauri native with window.open fallback. */
function openExternal(url: string) {
  tauriOpen(url).catch(() => {
    window.open(url, "_blank");
  });
}

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  google: Mail,
  github: Github,
  flyio: Cloud,
  supabase: Database,
};

function getProviderIcon(name: string) {
  return PROVIDER_ICONS[name] || Key;
}

type CredentialStatus = api.UserCredential["status"];

const STATUS_CONFIG: Record<
  CredentialStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Connected",
    className: "border-success/30 text-success bg-success/10",
  },
  expired: {
    label: "Expired",
    className: "border-warning/30 text-warning bg-warning/10",
  },
  revoked: {
    label: "Revoked",
    className: "border-destructive/30 text-destructive bg-destructive/10",
  },
  refresh_failed: {
    label: "Refresh Failed",
    className: "border-destructive/30 text-destructive bg-destructive/10",
  },
};

// Sidebar sections
const SECTIONS = [
  { value: "profile", label: "Profile", icon: User },
  { value: "llm-keys", label: "LLM Keys", icon: Key },
  { value: "connections", label: "Connections", icon: Link2 },
] as const;

type SectionValue = (typeof SECTIONS)[number]["value"];

// ---------------------------------------------------------------------------
// Custom API persistence
// ---------------------------------------------------------------------------

export interface CustomApi {
  id: string;
  name: string;
  apiKey: string;
  endpoint: string;
}

function loadCustomApis(): CustomApi[] {
  const raw = localStorage.getItem("customApis");
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveCustomApis(apis: CustomApi[]) {
  localStorage.setItem("customApis", JSON.stringify(apis));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Profile({ onClose }: { onClose: () => void }) {
  const { participant, logout } = useAuthStore();
  const [activeSection, setActiveSection] = useState<SectionValue>("profile");

  // ---- Profile editing state ----
  const [displayName, setDisplayName] = useState(
    participant?.displayName ?? ""
  );
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  // ---- Integration state ----
  const [providers, setProviders] = useState<api.ProviderInfo[]>([]);
  const [credentials, setCredentials] = useState<api.UserCredential[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [integrationError, setIntegrationError] = useState<string | null>(null);

  // ---- OAuth polling state ----
  const [connectingProvider, setConnectingProvider] = useState<string | null>(
    null
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  // ---- Token input dialog ----
  const [tokenDialogProvider, setTokenDialogProvider] =
    useState<api.ProviderInfo | null>(null);
  const [tokenValue, setTokenValue] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // ---- Disconnect confirmation dialog ----
  const [disconnectProvider, setDisconnectProvider] = useState<string | null>(
    null
  );
  const [disconnecting, setDisconnecting] = useState(false);

  // ---- Custom API state ----
  const [customApis, setCustomApis] = useState<CustomApi[]>(loadCustomApis);
  const [customApiDialog, setCustomApiDialog] = useState<{
    open: boolean;
    editing?: CustomApi;
  }>({ open: false });
  const [customApiForm, setCustomApiForm] = useState({
    name: "",
    apiKey: "",
    endpoint: "",
  });
  const [customApiError, setCustomApiError] = useState<string | null>(null);
  const [deleteCustomApiId, setDeleteCustomApiId] = useState<string | null>(
    null
  );

  // ---- Fetch providers & credentials on mount ----
  const fetchIntegrations = useCallback(async () => {
    try {
      const [provRes, credRes] = await Promise.all([
        api.listProviders(),
        api.listCredentials(),
      ]);
      setProviders(provRes.providers);
      setCredentials(credRes.credentials);
      setIntegrationError(null);
    } catch (e) {
      setIntegrationError(
        e instanceof Error ? e.message : "Failed to load integrations"
      );
    } finally {
      setLoadingIntegrations(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Sync displayName when participant changes
  useEffect(() => {
    if (participant?.displayName) {
      setDisplayName(participant.displayName);
    }
  }, [participant?.displayName]);

  // ---- Handlers ----

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === participant?.displayName) return;

    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      const result = await api.updateProfile({ displayName: trimmed });
      const stored = localStorage.getItem("participant");
      if (stored) {
        try {
          const p = JSON.parse(stored);
          p.displayName = result.participant.displayName;
          localStorage.setItem("participant", JSON.stringify(p));
        } catch {
          // ignore parse errors
        }
      }
      useAuthStore.getState().restoreSession();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (e) {
      setNameError(
        e instanceof Error ? e.message : "Failed to update display name"
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleConnectOAuth = async (providerName: string) => {
    setConnectingProvider(providerName);
    try {
      const { authorizeUrl } = await api.authorizeProvider(providerName);
      await openExternal(authorizeUrl);

      pollCountRef.current = 0;
      pollRef.current = setInterval(async () => {
        pollCountRef.current += 1;
        if (pollCountRef.current > 40) {
          if (pollRef.current) clearInterval(pollRef.current);
          setConnectingProvider(null);
          return;
        }
        try {
          const { credentials: updated } = await api.listCredentials();
          const found = updated.find(
            (c) => c.provider === providerName && c.status === "active"
          );
          if (found) {
            setCredentials(updated);
            if (pollRef.current) clearInterval(pollRef.current);
            setConnectingProvider(null);
          }
        } catch {
          // keep polling on transient errors
        }
      }, 3000);
    } catch (e) {
      setConnectingProvider(null);
      setIntegrationError(
        e instanceof Error ? e.message : "Failed to start authorization"
      );
    }
  };

  const handleConnectToken = (provider: api.ProviderInfo) => {
    setTokenDialogProvider(provider);
    setTokenValue("");
    setTokenError(null);
  };

  const handleSubmitToken = async () => {
    if (!tokenDialogProvider || !tokenValue.trim()) return;
    setSavingToken(true);
    setTokenError(null);
    try {
      const { credential } = await api.storeProviderToken(
        tokenDialogProvider.name,
        tokenValue.trim()
      );
      setCredentials((prev) => [
        ...prev.filter((c) => c.provider !== tokenDialogProvider.name),
        credential,
      ]);
      setTokenDialogProvider(null);
      setTokenValue("");
    } catch (e) {
      setTokenError(
        e instanceof Error ? e.message : "Failed to store token"
      );
    } finally {
      setSavingToken(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectProvider) return;
    setDisconnecting(true);
    try {
      await api.disconnectProvider(disconnectProvider);
      setCredentials((prev) =>
        prev.filter((c) => c.provider !== disconnectProvider)
      );
      setDisconnectProvider(null);
    } catch (e) {
      setIntegrationError(
        e instanceof Error ? e.message : "Failed to disconnect"
      );
      setDisconnectProvider(null);
    } finally {
      setDisconnecting(false);
    }
  };

  // ---- Custom API handlers ----

  const openAddCustomApi = () => {
    setCustomApiForm({ name: "", apiKey: "", endpoint: "" });
    setCustomApiError(null);
    setCustomApiDialog({ open: true });
  };

  const openEditCustomApi = (apiEntry: CustomApi) => {
    setCustomApiForm({
      name: apiEntry.name,
      apiKey: apiEntry.apiKey,
      endpoint: apiEntry.endpoint,
    });
    setCustomApiError(null);
    setCustomApiDialog({ open: true, editing: apiEntry });
  };

  const handleSaveCustomApi = () => {
    const { name, apiKey, endpoint } = customApiForm;
    if (!name.trim()) {
      setCustomApiError("Name is required");
      return;
    }
    if (!apiKey.trim()) {
      setCustomApiError("API key is required");
      return;
    }
    if (!endpoint.trim()) {
      setCustomApiError("Service endpoint is required");
      return;
    }

    const entry: CustomApi = {
      id: customApiDialog.editing?.id || crypto.randomUUID(),
      name: name.trim(),
      apiKey: apiKey.trim(),
      endpoint: endpoint.trim(),
    };

    const updated = customApiDialog.editing
      ? customApis.map((a) => (a.id === entry.id ? entry : a))
      : [...customApis, entry];

    setCustomApis(updated);
    saveCustomApis(updated);
    setCustomApiDialog({ open: false });
  };

  const handleDeleteCustomApi = () => {
    if (!deleteCustomApiId) return;
    const updated = customApis.filter((a) => a.id !== deleteCustomApiId);
    setCustomApis(updated);
    saveCustomApis(updated);
    setDeleteCustomApiId(null);
  };

  // ---- Helpers ----

  function getCredentialForProvider(
    providerName: string
  ): api.UserCredential | undefined {
    return credentials.find((c) => c.provider === providerName);
  }

  const nameChanged =
    displayName.trim() !== "" &&
    displayName.trim() !== participant?.displayName;

  // Filter out "custom" provider from the backend list (we manage it ourselves)
  const standardProviders = providers.filter(
    (p) => p.name !== "custom" && p.name !== "custom_api"
  );

  // ---- Render ----

  return (
    <div className="flex h-full">
      {/* Vertical icon sidebar — matches AgentConfig */}
      <TooltipProvider delay={300}>
        <div className="w-12 border-r border-border bg-muted/30 flex flex-col items-center py-3 gap-1 flex-shrink-0">
          {/* User avatar at top */}
          <div className="mb-2">
            <Avatar className="h-8 w-8 rounded-lg">
              {participant?.avatarUrl && (
                <AvatarImage src={participant.avatarUrl} className="rounded-lg" />
              )}
              <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                <User className="w-3.5 h-3.5" />
              </AvatarFallback>
            </Avatar>
          </div>

          <Separator className="w-6 mb-1" />

          {SECTIONS.map((section) => (
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
                    onClick={onClose}
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
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-2.5 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">
              {SECTIONS.find((s) => s.value === activeSection)?.label}
            </h2>
            <p className="text-[11px] text-muted-foreground truncate">
              {participant?.email}
            </p>
          </div>
        </div>

        {/* Section content */}
        {activeSection === "profile" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Display name */}
            <div className="space-y-1.5">
              <Label className="text-xs">Display Name</Label>
              <div className="flex gap-2">
                <Input
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setNameError(null);
                    setNameSaved(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nameChanged) handleSaveName();
                  }}
                  placeholder="Your display name"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  disabled={!nameChanged || savingName}
                >
                  {savingName ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : nameSaved ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
              {nameError && (
                <p className="text-xs text-destructive">{nameError}</p>
              )}
              {nameSaved && (
                <p className="text-xs text-success">Name updated</p>
              )}
            </div>

            {/* Email (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                value={participant?.email ?? ""}
                readOnly
                className="text-muted-foreground bg-muted/30"
              />
            </div>

            {/* Sign out */}
            <Separator />
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </Button>
          </div>
        )}

        {activeSection === "llm-keys" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <LlmApiKeysSection />
          </div>
        )}

        {activeSection === "connections" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Connected Accounts */}
            <section>
              <SectionHeader
                title="Connected Accounts"
                subtitle="Link external services to enable agent integrations"
              />

              {integrationError && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2.5 rounded-md mb-4">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>{integrationError}</p>
                </div>
              )}

              {loadingIntegrations ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : standardProviders.length === 0 && customApis.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center">
                  <Link2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No integration providers available
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {standardProviders.map((provider) => {
                    const credential = getCredentialForProvider(provider.name);
                    const isConnecting = connectingProvider === provider.name;
                    const Icon = getProviderIcon(provider.name);

                    return (
                      <ProviderCard
                        key={provider.name}
                        provider={provider}
                        credential={credential}
                        icon={Icon}
                        isConnecting={isConnecting}
                        onConnectOAuth={() => handleConnectOAuth(provider.name)}
                        onConnectToken={() => handleConnectToken(provider)}
                        onDisconnect={() =>
                          setDisconnectProvider(provider.name)
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>

            <Separator />

            {/* Custom APIs */}
            <section>
              <SectionHeader
                title="Custom APIs"
                subtitle="Connect custom service endpoints for agent use"
              />

              {customApis.length > 0 && (
                <div className="space-y-2 mb-3">
                  {customApis.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-border bg-card p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10">
                          <Globe className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {entry.endpoint}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditCustomApi(entry)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteCustomApiId(entry.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={openAddCustomApi}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Custom API
              </Button>
            </section>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* TOKEN INPUT DIALOG                                                */}
      {/* ================================================================= */}
      <Dialog
        open={!!tokenDialogProvider}
        onOpenChange={(open) => {
          if (!open) {
            setTokenDialogProvider(null);
            setTokenValue("");
            setTokenError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Connect {tokenDialogProvider?.displayName}
            </DialogTitle>
            <DialogDescription>
              {tokenDialogProvider?.description ??
                `Enter your API token to connect ${tokenDialogProvider?.displayName}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">API Token</Label>
              <Input
                type="password"
                value={tokenValue}
                onChange={(e) => {
                  setTokenValue(e.target.value);
                  setTokenError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tokenValue.trim())
                    handleSubmitToken();
                }}
                placeholder="Paste your API token..."
                autoFocus
              />
              {tokenError && (
                <p className="text-xs text-destructive">{tokenError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTokenDialogProvider(null);
                setTokenValue("");
                setTokenError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitToken}
              disabled={!tokenValue.trim() || savingToken}
            >
              {savingToken ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* DISCONNECT CONFIRMATION DIALOG                                    */}
      {/* ================================================================= */}
      <Dialog
        open={!!disconnectProvider}
        onOpenChange={(open) => {
          if (!open) setDisconnectProvider(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect{" "}
              <span className="font-medium text-foreground">
                {providers.find((p) => p.name === disconnectProvider)
                  ?.displayName ?? disconnectProvider}
              </span>
              ? Agents will no longer be able to use this integration.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDisconnectProvider(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* ADD / EDIT CUSTOM API DIALOG                                      */}
      {/* ================================================================= */}
      <Dialog
        open={customApiDialog.open}
        onOpenChange={(open) => {
          if (!open) setCustomApiDialog({ open: false });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {customApiDialog.editing ? "Edit Custom API" : "Add Custom API"}
            </DialogTitle>
            <DialogDescription>
              Configure a custom service endpoint your agents can use.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={customApiForm.name}
                onChange={(e) => {
                  setCustomApiForm((f) => ({ ...f, name: e.target.value }));
                  setCustomApiError(null);
                }}
                placeholder="e.g. My Weather API"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Service Endpoint</Label>
              <Input
                value={customApiForm.endpoint}
                onChange={(e) => {
                  setCustomApiForm((f) => ({ ...f, endpoint: e.target.value }));
                  setCustomApiError(null);
                }}
                placeholder="https://api.example.com/v1"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <Input
                type="password"
                value={customApiForm.apiKey}
                onChange={(e) => {
                  setCustomApiForm((f) => ({ ...f, apiKey: e.target.value }));
                  setCustomApiError(null);
                }}
                placeholder="Your API key"
                className="font-mono text-xs"
              />
            </div>
            {customApiError && (
              <p className="text-xs text-destructive">{customApiError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomApiDialog({ open: false })}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveCustomApi}>
              {customApiDialog.editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* DELETE CUSTOM API CONFIRMATION                                     */}
      {/* ================================================================= */}
      <Dialog
        open={!!deleteCustomApiId}
        onOpenChange={(open) => {
          if (!open) setDeleteCustomApiId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Custom API</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {customApis.find((a) => a.id === deleteCustomApiId)?.name}
              </span>
              ? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteCustomApiId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteCustomApi}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLM API Keys — multiple named keys per provider with defaults
// ---------------------------------------------------------------------------

function LlmApiKeysSection() {
  const { keys, defaults, addKey, updateKey, removeKey, setDefault } = useLlmKeyStore();
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<string | null>(null); // provider id being added to
  const [newLabel, setNewLabel] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // key id being edited
  const [editLabel, setEditLabel] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const providersWithKeys = PROVIDERS.filter((p) => p.requiresLlmKey);

  const toggleVisibility = (keyId: string) => {
    setVisibility((v) => ({ ...v, [keyId]: !v[keyId] }));
  };

  const flashSaved = (id: string) => {
    setSaved(id);
    setTimeout(() => setSaved(null), 1500);
  };

  const handleStartAdd = (providerId: string) => {
    const count = keys.filter((k) => k.provider === providerId).length;
    const providerLabel = providersWithKeys.find((p) => p.id === providerId)?.label || providerId;
    setNewLabel(`${providerLabel} ${count + 1}`);
    setNewApiKey("");
    setAdding(providerId);
  };

  const handleConfirmAdd = () => {
    if (!adding || !newApiKey.trim()) return;
    const label = newLabel.trim() || `Key ${keys.filter((k) => k.provider === adding).length + 1}`;
    const id = addKey(adding, label, newApiKey.trim());
    flashSaved(id);
    setAdding(null);
    setNewLabel("");
    setNewApiKey("");
  };

  const handleStartEdit = (key: LlmApiKeyEntry) => {
    setEditing(key.id);
    setEditLabel(key.label);
    setEditApiKey(key.apiKey);
  };

  const handleConfirmEdit = () => {
    if (!editing) return;
    updateKey(editing, { label: editLabel.trim() || undefined, apiKey: editApiKey.trim() || undefined });
    flashSaved(editing);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    removeKey(id);
    setConfirmDelete(null);
  };

  const keyPlaceholder = (providerId: string) => {
    switch (providerId) {
      case "anthropic": return "sk-ant-...";
      case "openai": return "sk-...";
      case "xai": return "xai-...";
      default: return "API key";
    }
  };

  return (
    <section>
      <SectionHeader
        title="LLM API Keys"
        subtitle="Manage multiple keys per provider. The default key is used by all agents unless overridden."
      />
      <div className="space-y-5">
        {providersWithKeys.map((provider) => {
          const providerKeys = keys.filter((k) => k.provider === provider.id);
          const defaultId = defaults[provider.id];

          return (
            <div key={provider.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">{provider.label}</Label>
                  <Badge variant="secondary" className="text-[10px] py-0">
                    {providerKeys.length} key{providerKeys.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStartAdd(provider.id)}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3" />
                  Add Key
                </Button>
              </div>

              {/* Add key form */}
              {adding === provider.id && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="e.g. Work, Personal, Project X"
                      className="text-xs"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">API Key</Label>
                    <Input
                      type="password"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder={keyPlaceholder(provider.id)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleConfirmAdd} disabled={!newApiKey.trim()} className="h-7 text-xs">
                      <Check className="w-3 h-3" />
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(null)} className="h-7 text-xs">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Key list */}
              {providerKeys.length === 0 && adding !== provider.id && (
                <p className="text-xs text-muted-foreground pl-1">No keys configured</p>
              )}

              {providerKeys.map((key) => {
                const isDefault = defaultId === key.id;
                const isVisible = visibility[key.id] || false;
                const isEditing = editing === key.id;
                const isSaved = saved === key.id;

                if (isEditing) {
                  return (
                    <div key={key.id} className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="text-xs"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">API Key</Label>
                        <Input
                          type="password"
                          value={editApiKey}
                          onChange={(e) => setEditApiKey(e.target.value)}
                          placeholder={keyPlaceholder(provider.id)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={handleConfirmEdit} className="h-7 text-xs">
                          <Check className="w-3 h-3" />
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-7 text-xs">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={key.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      isDefault ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{key.label}</span>
                          {isDefault && (
                            <Badge variant="secondary" className="text-[10px] py-0 bg-primary/10 text-primary">
                              Default
                            </Badge>
                          )}
                          {isSaved && (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              <Check className="w-3 h-3 mr-0.5" />
                              Saved
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <code className="text-[11px] text-muted-foreground font-mono">
                            {isVisible ? key.apiKey : maskKey(key.apiKey)}
                          </code>
                          <button
                            onClick={() => toggleVisibility(key.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefault(provider.id, key.id)}
                            className="h-7 text-xs text-muted-foreground"
                            title="Set as default"
                          >
                            Set Default
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => handleStartEdit(key)}
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {confirmDelete === key.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => handleDelete(key.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setConfirmDelete(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDelete(key.id)}
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          The default key for each provider is used by all agents automatically.
          You can override which key an agent uses in that agent's config, or
          enter a custom key there.
        </p>
      </div>
    </section>
  );
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••" + key.slice(-4);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  credential,
  icon: Icon,
  isConnecting,
  onConnectOAuth,
  onConnectToken,
  onDisconnect,
}: {
  provider: api.ProviderInfo;
  credential?: api.UserCredential;
  icon: React.ElementType;
  isConnecting: boolean;
  onConnectOAuth: () => void;
  onConnectToken: () => void;
  onDisconnect: () => void;
}) {
  const isConnected = !!credential;
  const status = credential?.status;
  const statusConfig = status ? STATUS_CONFIG[status] : null;

  return (
    <div
      className={cn(
        "rounded-lg border p-3.5 transition-colors",
        isConnected
          ? "border-border bg-card"
          : "border-dashed border-border bg-muted/20"
      )}
    >
      {/* Top row: icon, name, status/action */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
            isConnected ? "bg-primary/10" : "bg-muted"
          )}
        >
          <Icon
            className={cn(
              "w-4.5 h-4.5",
              isConnected ? "text-primary" : "text-muted-foreground"
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">
              {provider.displayName}
            </p>
            {statusConfig && (
              <Badge
                variant="outline"
                className={cn("text-[10px] py-0", statusConfig.className)}
              >
                {statusConfig.label}
              </Badge>
            )}
          </div>
          {provider.description && !isConnected && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {provider.description}
            </p>
          )}
          {credential?.providerUid && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {credential.providerUid}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isConnecting ? (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Waiting...
            </Button>
          ) : isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </Button>
          ) : provider.type === "oauth2" ? (
            <Button variant="outline" size="sm" onClick={onConnectOAuth}>
              <ExternalLink className="w-3.5 h-3.5" />
              Connect
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onConnectToken}>
              <Key className="w-3.5 h-3.5" />
              Add Token
            </Button>
          )}
        </div>
      </div>

      {/* Credential details (when connected) */}
      {credential && credential.scopes.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-border/50">
          <div className="flex flex-wrap gap-1">
            {credential.scopes.map((scope) => (
              <Badge
                key={scope}
                variant="secondary"
                className="text-[10px] font-normal py-0"
              >
                {scope}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
