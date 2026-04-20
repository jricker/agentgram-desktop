import { useState } from "react";
import { useAgentStore, type ManagedAgent } from "../stores/agentStore";
import { formatModelLabel, formatBackendLabel } from "../lib/models";
import { formatUptime, cn } from "../lib/utils";
import { Play, Square, RotateCcw, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const ACTIVITY_COLORS = {
  idle: "",
  thinking: "text-warning",
  streaming: "text-success",
  tool: "text-violet-500",
  sending: "text-cyan-500",
  error: "text-destructive",
};

const ACTIVITY_DOT_COLORS = {
  idle: "",
  thinking: "bg-warning",
  streaming: "bg-success",
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
      <Badge variant="outline" className="border-warning/30 text-warning bg-warning/10 gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
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
    stuck: "text-warning",
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
  const activity = useAgentStore(
    (s) => s.activities[managed.agent.id] ?? null
  );
  const [error, setError] = useState<string | null>(null);

  const isRunning = managed.processStatus === "running";

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
                <Crown className="h-3 w-3 text-primary flex-shrink-0" />
              )}
              {managed.agent.agentType && !["worker", "orchestrator"].includes(managed.agent.agentType) && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] px-1.5 py-0 flex-shrink-0",
                    managed.agent.agentType === "reviewer" && "bg-warning/10 text-warning border-warning/20",
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
            <Button variant="ghost" size="icon-sm" className="text-warning hover:text-warning/90" onClick={handleToggle} title="Restart">
              <RotateCcw className="w-4 h-4" />
            </Button>
          ) : isRunning ? (
            <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive/90" onClick={handleToggle} title="Stop">
              <Square className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" className="text-success hover:text-success/90" onClick={handleToggle} disabled={!canStart} title={canStart ? "Start" : "Configure first"}>
              <Play className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

    </div>
  );
}
