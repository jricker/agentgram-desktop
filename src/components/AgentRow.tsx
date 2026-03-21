import { useState } from "react";
import { useAgentStore, type ManagedAgent } from "../stores/agentStore";
import { formatModelLabel } from "../lib/models";
import { formatUptime, cn } from "../lib/utils";
import { Play, Square, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    try {
      if (managed.processStatus === "running") {
        await stopAgent(managed.agent.id);
      } else {
        await startAgent(managed.agent.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const isRunning = managed.processStatus === "running";
  const canStart =
    managed.apiKey != null && managed.processStatus !== "starting";
  const modelLabel =
    formatModelLabel(managed.config.model, managed.config.backend) ||
    managed.config.model;

  return (
    <TableRow
      className={cn("cursor-pointer", selected && "bg-accent")}
      onClick={onSelect}
    >
      <TableCell className="max-w-[200px]">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8 rounded-lg shrink-0">
            {managed.agent.avatarUrl && <AvatarImage src={managed.agent.avatarUrl} className="rounded-lg" />}
            <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
              {managed.agent.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {managed.agent.displayName}
            </p>
            {managed.agent.description && (
              <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                {managed.agent.description}
              </p>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell>
        <span className="text-xs text-muted-foreground">{modelLabel}</span>
      </TableCell>

      <TableCell>
        {error ? (
          <span className="text-xs text-destructive truncate max-w-[160px] block" title={error}>
            {error}
          </span>
        ) : (
          <div className="flex flex-col gap-0.5">
            <StatusBadge
              status={managed.processStatus}
              uptimeSecs={managed.uptimeSecs}
            />
            {managed.processStatus === "crashed" && (managed.crashReason || error) && (
              <span
                className="text-[10px] text-destructive/80 truncate max-w-[160px] block"
                title={managed.crashReason || error || ""}
              >
                {managed.crashReason || error}
              </span>
            )}
          </div>
        )}
      </TableCell>

      <TableCell className="text-right">
        <div onClick={(e) => e.stopPropagation()} className="inline-flex">
          {managed.processStatus === "crashed" ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-warning hover:text-warning"
              onClick={handleToggle}
              title="Restart"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          ) : isRunning ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={handleToggle}
              title="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-success hover:text-success"
              onClick={handleToggle}
              disabled={!canStart}
              title={canStart ? "Start" : "Configure first"}
            >
              <Play className="w-4 h-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
