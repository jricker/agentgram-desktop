import { useState, useEffect, useRef, useCallback } from "react";
import { Wallet, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { open as tauriOpen } from "@tauri-apps/plugin-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import {
  paymentConnectStart,
  paymentConnectPoll,
  paymentWalletStatus,
  paymentDisconnect,
} from "../lib/api";

/**
 * Connect / disconnect the owner's Stripe Link "wallet for agents".
 *
 * OAuth device flow: Connect → backend returns a short code + verification
 * URL → we open the URL and poll until the human approves in Stripe Link.
 * Rendered inside the Connected Accounts section.
 */

interface WalletStatus {
  connected: boolean;
  status: string | null;
  hasPaymentMethod: boolean;
}

interface DeviceInfo {
  userCode: string;
  verificationUriComplete: string;
}

// Poll responses that mean "this device session is over" — anything else
// thrown (5xx, network blip) is transient and the next tick retries.
const TERMINAL_POLL_STATUSES = [403, 404, 410];

function openExternal(url: string) {
  tauriOpen(url).catch(() => {
    window.open(url, "_blank");
  });
}

export function PaymentWalletCard() {
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await paymentWalletStatus();
      if (mountedRef.current) setStatus(s);
    } catch {
      if (mountedRef.current) {
        setStatus({ connected: false, status: null, hasPaymentMethod: false });
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchStatus();
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [fetchStatus, stopPolling]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const resp = await paymentConnectStart();
      const url = resp.verificationUriComplete || resp.verificationUri;
      if (!resp.userCode || !url) {
        setError("Stripe Link returned an incomplete response. Try again.");
        return;
      }

      setDevice({ userCode: resp.userCode, verificationUriComplete: url });
      openExternal(url);

      // Honor the server's polling cadence + expiry window (RFC 8628).
      const intervalMs = Math.max((resp.interval ?? 5) * 1000, 3000);
      const maxPolls = Math.ceil(((resp.expiresIn ?? 300) * 1000) / intervalMs);
      let polls = 0;

      stopPolling();
      pollRef.current = setInterval(async () => {
        polls += 1;
        if (polls > maxPolls) {
          stopPolling();
          if (mountedRef.current) {
            setDevice(null);
            setError("The wallet connection timed out. Try again.");
          }
          return;
        }
        try {
          const poll = await paymentConnectPoll();
          if (poll.status === "connected") {
            stopPolling();
            if (!mountedRef.current) return;
            setDevice(null);
            await fetchStatus();
          }
          // "pending" → keep polling
        } catch (e) {
          // Only a terminal poll response ends the flow; a transient error
          // (5xx, dropped request) just retries on the next tick.
          const code = (e as { status?: number })?.status;
          if (code && TERMINAL_POLL_STATUSES.includes(code)) {
            stopPolling();
            if (mountedRef.current) {
              setDevice(null);
              setError("The connection expired or was declined. Try again.");
            }
          }
        }
      }, intervalMs);
    } catch {
      if (mountedRef.current) setError("Couldn't start the wallet connection. Try again.");
    } finally {
      if (mountedRef.current) setConnecting(false);
    }
  }, [fetchStatus, stopPolling]);

  const cancelConnect = useCallback(() => {
    stopPolling();
    setDevice(null);
  }, [stopPolling]);

  const handleDisconnect = useCallback(async () => {
    setConfirmingDisconnect(false);
    setDisconnecting(true);
    setError(null);
    try {
      await paymentDisconnect();
      await fetchStatus();
    } catch {
      if (mountedRef.current) setError("Failed to disconnect.");
    } finally {
      if (mountedRef.current) setDisconnecting(false);
    }
  }, [fetchStatus]);

  const isConnected = status?.connected === true;

  return (
    <>
      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2.5 rounded-md mb-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      <div
        className={cn(
          "rounded-lg border p-3.5 transition-colors",
          isConnected ? "border-border bg-card" : "border-dashed border-border bg-muted/20"
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
              isConnected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            <Wallet className="w-4.5 h-4.5" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Payment Wallet</p>
            <p className="text-xs text-muted-foreground truncate">
              Agents request payments from your Stripe Link wallet — you approve each one
            </p>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="inline-flex items-center rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success">
                Connected
              </span>
              {confirmingDisconnect ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDisconnect(false)}
                    disabled={disconnecting}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDisconnect(true)}
                >
                  Disconnect
                </Button>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              className="flex-shrink-0"
              onClick={handleConnect}
              disabled={connecting || !!device}
            >
              {connecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Connect
            </Button>
          )}
        </div>

        {isConnected && status && !status.hasPaymentMethod && (
          <p className="mt-2 text-xs text-warning">
            No payment method was found in this wallet.
          </p>
        )}
      </div>

      {/* Device-code dialog */}
      <Dialog open={!!device} onOpenChange={(open) => !open && cancelConnect()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Payment Wallet</DialogTitle>
            <DialogDescription>
              Approve the connection in Stripe Link. If the browser didn't open, use the
              code below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">Your verification code</p>
              <code className="text-2xl font-mono font-bold tracking-widest text-foreground">
                {device?.userCode}
              </code>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                device?.verificationUriComplete && openExternal(device.verificationUriComplete)
              }
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Stripe Link
            </Button>

            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Waiting for approval…
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
