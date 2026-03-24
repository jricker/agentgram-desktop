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
} from "lucide-react";
import { open as tauriOpen } from "@tauri-apps/plugin-shell";
import { PROVIDERS } from "../lib/models";

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Profile({ onClose }: { onClose: () => void }) {
  const { participant, logout } = useAuthStore();

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
      // Update participant in auth store local storage
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
      // Update zustand store by re-reading from localStorage
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

      // Start polling for credential creation (every 3s, up to 2 minutes)
      pollCountRef.current = 0;
      pollRef.current = setInterval(async () => {
        pollCountRef.current += 1;
        if (pollCountRef.current > 40) {
          // 40 * 3s = 120s = 2 minutes
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

  // ---- Helpers ----

  function getCredentialForProvider(
    providerName: string
  ): api.UserCredential | undefined {
    return credentials.find((c) => c.provider === providerName);
  }

  const nameChanged =
    displayName.trim() !== "" &&
    displayName.trim() !== participant?.displayName;

  // ---- Render ----

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Avatar>
            {participant?.avatarUrl ? (
              <AvatarImage src={participant.avatarUrl} alt={participant.displayName} />
            ) : null}
            <AvatarFallback>
              <User className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-sm font-semibold">Profile & Settings</h2>
            <p className="text-[11px] text-muted-foreground">
              {participant?.email}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-8">
          {/* ============================================================= */}
          {/* USER PROFILE SECTION                                          */}
          {/* ============================================================= */}
          <section>
            <SectionHeader title="Profile" />

            <div className="space-y-4">
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
          </section>

          <Separator />

          {/* ============================================================= */}
          {/* LLM API KEYS SECTION                                          */}
          {/* ============================================================= */}
          <LlmApiKeysSection />

          <Separator />

          {/* ============================================================= */}
          {/* CONNECTED ACCOUNTS SECTION                                    */}
          {/* ============================================================= */}
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
            ) : providers.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <Link2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No integration providers available
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {providers.map((provider) => {
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
                      onDisconnect={() => setDisconnectProvider(provider.name)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLM API Keys — global defaults per provider
// ---------------------------------------------------------------------------

type LlmDefaults = Record<string, { apiKey: string; defaultModel: string }>;

function loadLlmDefaults(): LlmDefaults {
  const raw = localStorage.getItem("llmDefaults");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLlmDefaults(defaults: LlmDefaults) {
  localStorage.setItem("llmDefaults", JSON.stringify(defaults));
}

function LlmApiKeysSection() {
  const [defaults, setDefaults] = useState<LlmDefaults>(loadLlmDefaults);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const providersWithKeys = PROVIDERS.filter((p) => p.requiresLlmKey);

  const handleChange = (providerId: string, value: string) => {
    const updated = { ...defaults };
    if (value) {
      updated[providerId] = {
        apiKey: value,
        defaultModel: defaults[providerId]?.defaultModel || "",
      };
    } else {
      delete updated[providerId];
    }
    setDefaults(updated);
    saveLlmDefaults(updated);
    setSaved(providerId);
    setTimeout(() => setSaved(null), 1500);
  };

  const toggleVisibility = (providerId: string) => {
    setVisibility((v) => ({ ...v, [providerId]: !v[providerId] }));
  };

  return (
    <section>
      <SectionHeader
        title="LLM API Keys"
        subtitle="Global keys used by all agents unless overridden per-agent"
      />
      <div className="space-y-3">
        {providersWithKeys.map((provider) => {
          const current = defaults[provider.id]?.apiKey || "";
          const visible = visibility[provider.id] || false;

          return (
            <div key={provider.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs">{provider.label}</Label>
                {saved === provider.id && (
                  <Badge variant="secondary" className="text-[10px] py-0">
                    <Check className="w-3 h-3 mr-0.5" />
                    Saved
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type={visible ? "text" : "password"}
                  value={current}
                  onChange={(e) => handleChange(provider.id, e.target.value)}
                  placeholder={
                    provider.id === "anthropic"
                      ? "sk-ant-..."
                      : provider.id === "openai"
                        ? "sk-..."
                        : "API key"
                  }
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => toggleVisibility(provider.id)}
                >
                  {visible ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Set a key here once and every agent using that provider will use it
          automatically. To use a different key for a specific agent, set it in
          that agent's config — it will override the global key.
        </p>
      </div>
    </section>
  );
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
