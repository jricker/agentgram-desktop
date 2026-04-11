import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAgentStore, type ManagedAgent } from "../stores/agentStore";
import { formatModelLabel, formatBackendLabel } from "../lib/models";
import { formatUptime, cn } from "../lib/utils";
import { Play, Square, RotateCcw, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Parse the last few log lines into a human-readable activity label
function parseActivity(lines: string[]): { label: string; type: "idle" | "thinking" | "streaming" | "tool" | "sending" | "error" } | null {
  if (lines.length === 0) return null;

  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
    const line = lines[i].toLowerCase();

    if (line.includes("error") || line.includes("traceback")) {
      const clean = lines[i].replace(/^\[.*?\]\s*/, "").slice(0, 60);
      return { label: clean, type: "error" };
    }
    if (line.includes("executing tool") || line.includes("tool_use") || line.includes("tool_call")) {
      // Try to extract tool name
      const match = lines[i].match(/(?:executing tool|tool_use|tool_call)[:\s]*(\w+)/i);
      return { label: match ? `Tool: ${match[1]}` : "Executing tool...", type: "tool" };
    }
    if (line.includes("text_delta") || line.includes("content_block") || line.includes("streaming")) {
      return { label: "Streaming response...", type: "streaming" };
    }
    if (line.includes("sending message") || line.includes("send_message")) {
      return { label: "Sending message...", type: "sending" };
    }
    if (line.includes("claimed task")) {
      const match = lines[i].match(/claimed task.*?[:\s]+(.*)/i);
      return { label: match ? `Task: ${match[1].slice(0, 40)}` : "Processing task...", type: "thinking" };
    }
    if (line.includes("new message") || line.includes("processing message")) {
      return { label: "Reading message...", type: "thinking" };
    }
    if (line.includes("thinking") || line.includes("processing")) {
      return { label: "Thinking...", type: "thinking" };
    }
  }

  return null;
}

const ACTIVITY_COLORS = {
  idle: "",
  thinking: "text-amber-500",
  streaming: "text-emerald-500",
  tool: "text-violet-500",
  sending: "text-cyan-500",
  error: "text-destructive",
};

const ACTIVITY_DOT_COLORS = {
  idle: "",
  thinking: "bg-amber-500",
  streaming: "bg-emerald-500",
  tool: "bg-violet-500",
  sending: "bg-cyan-500",
  error: "bg-destructive",
};

function StatusBadge({
  status,
  uptimeSecs,
}: {
  status: string;
  uptimeSecs: number | null;
}) {
  if (status === "running") {
    return (
      <Badge variant="outline" className="border-success/30 text-success bg-success/10 gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        {uptimeSecs != null ? formatUptime(uptimeSecs) : "Running"}
      </Badge>
    );
  }
  if (status === "starting") {
    return (
      <Badge variant="outline" className="border-warning/30 text-warning bg-warning/10 gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
        Starting
      </Badge>
    );
  }
  if (status === "stalled") {
    return (
      <Badge variant="outline" className="border-orange-500/30 text-orange-500 bg-orange-500/10 gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
        Stalled
      </Badge>
    );
  }
  if (status === "crashed") {
    return (
      <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        Crashed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
      Stopped
    </Badge>
  );
}

function HealthBadge({ health }: { health: ManagedAgent["health"] }) {
  if (!health) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const colors: Record<string, string> = {
    healthy: "text-success",
    degraded: "text-warning",
    stuck: "text-orange-500",
    offline: "text-muted-foreground",
  };
  return (
    <span className={cn("text-xs capitalize", colors[health.healthStatus] || "text-muted-foreground")}>
      {health.healthStatus}
    </span>
  );
}

export function AgentRow({
  managed,
  selected,
  onSelect,
}: {
  managed: ManagedAgent;
  selected: boolean;
  onSelect: () => void;
}) {
  const { startAgent, stopAgent } = useAgentStore();
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ReturnType<typeof parseActivity>>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const isRunning = managed.processStatus === "running";

  // Poll logs for live activity when running
  useEffect(() => {
    if (!isRunning) {
      setActivity(null);
      return;
    }

    const poll = async () => {
      try {
        const lines: string[] = await invoke("get_agent_logs", {
          agentId: managed.agent.id,
          tail: 8,
        });
        setActivity(parseActivity(lines));
      } catch {
        setActivity(null);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 1500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, managed.agent.id]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    try {
      if (isRunning) {
        await stopAgent(managed.agent.id);
      } else {
        await startAgent(managed.agent.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const canStart =
    managed.apiKey != null && managed.processStatus !== "starting";
  const modelLabel =
    formatModelLabel(managed.config.model) ||
    managed.config.model;
  const backendLabel = formatBackendLabel(managed.config.backend);

  return (
    <div
      className={cn(
        "cursor-pointer border-b border-border last:border-b-0 transition-colors",
        selected ? "bg-primary/5" : "hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
      {/* Main row */}
      <div className="grid grid-cols-[1fr_100px_140px_120px_80px_60px] gap-3 px-5 py-2.5 items-center">
        {/* Agent */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="h-8 w-8 rounded-lg shrink-0">
            {managed.agent.avatarUrl && <AvatarImage src={managed.agent.avatarUrl} className="rounded-lg" />}
            <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
              {managed.agent.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-medium truncate flex-shrink-0">
                {managed.agent.displayName}
              </p>
              {managed.agent.agentType === "orchestrator" && (
                <Crown className="h-3 w-3 text-[#007AFF] flex-shrink-0" />
              )}
              {managed.agent.agentType && !["worker", "orchestrator"].includes(managed.agent.agentType) && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] px-1.5 py-0 flex-shrink-0",
                    managed.agent.agentType === "reviewer" && "bg-amber-500/10 text-amber-500 border-amber-500/20",
                    managed.agent.agentType === "observer" && "bg-cyan-500/10 text-cyan-500 border-cyan-500/20"
                  )}
                >
                  {managed.agent.agentType}
                </Badge>
              )}
              {isRunning && activity && (
                <span className={cn(
                  "flex items-center gap-1.5 text-[11px] font-medium truncate",
                  ACTIVITY_COLORS[activity.type]
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    activity.type !== "idle" && "animate-pulse",
                    ACTIVITY_DOT_COLORS[activity.type]
                  )} />
                  <span className="truncate">{activity.label}</span>
                </span>
              )}
            </div>
            {managed.agent.description && (
              <p className="text-xs text-muted-foreground truncate">
                {managed.agent.description}
              </p>
            )}
          </div>
        </div>

        {/* Backend */}
        <div className="truncate">
          <span className="text-xs text-muted-foreground">{backendLabel || "—"}</span>
        </div>

        {/* Model */}
        <div className="truncate">
          <span className="text-xs text-muted-foreground">{modelLabel}</span>
        </div>

        {/* Status */}
        <div>
          {error ? (
            <span className="text-xs text-destructive truncate block" title={error}>
              {error.slice(0, 25)}...
            </span>
          ) : (
            <div className="flex flex-col gap-0.5">
              <StatusBadge
                status={managed.processStatus}
                uptimeSecs={managed.uptimeSecs}
              />
              {managed.processStatus === "crashed" && managed.crashReason && (
                <span
                  className="text-[10px] text-destructive/80 line-clamp-2 block leading-tight"
                  title={managed.crashReason}
                >
                  {managed.crashReason.length > 80
                    ? managed.crashReason.slice(0, 80) + "…"
                    : managed.crashReason}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Health */}
        <div>
          <HealthBadge health={managed.health} />
        </div>

        {/* Actions */}
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {managed.processStatus === "crashed" ? (
            <Button variant="ghost" size="icon-sm" className="text-warning hover:text-warning" onClick={handleToggle} title="Restart">
              <RotateCcw className="w-4 h-4" />
            </Button>
          ) : isRunning ? (
            <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={handleToggle} title="Stop">
              <Square className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" className="text-success hover:text-success" onClick={handleToggle} disabled={!canStart} title={canStart ? "Start" : "Configure first"}>
              <Play className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

    </div>
  );
}
