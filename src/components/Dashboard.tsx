import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAgentStore, type ManagedAgent } from "../stores/agentStore";
import { AgentRow } from "./AgentRow";
import { AgentConfig } from "./AgentConfig";
import { CreateAgentModal } from "./CreateAgentModal";
import { Profile } from "./Profile";
import { cn } from "../lib/utils";
import {
  Bot,
  Plus,
  Search,
  Play,
  Square,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export function Dashboard() {
  const { participant } = useAuthStore();
  const {
    agents,
    selectedAgentId,
    loading,
    error,
    fetchAgents,
    fetchHealth,
    fetchActivities,
    refreshProcessStatuses,
    selectAgent,
    startAgent,
    stopAgent,
  } = useAgentStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [search, setSearch] = useState("");
  const [startingAll, setStartingAll] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval>>(null);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    fetchAgents();
    fetchHealth();
    fetchActivities();

    // Health + process status: slow (backend REST)
    healthIntervalRef.current = setInterval(() => {
      refreshProcessStatuses();
      fetchHealth();
    }, 10000);

    // Bridge log activity: faster (local Tauri invoke, no backend cost).
    // Single shared poll for all components that show activity.
    activityIntervalRef.current = setInterval(() => {
      fetchActivities();
    }, 5000);

    return () => {
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    };
  }, [fetchAgents, fetchHealth, fetchActivities, refreshProcessStatuses]);

  const agentList = Object.values(agents)
    .filter((m) =>
      search
        ? m.agent.displayName.toLowerCase().includes(search.toLowerCase())
        : true
    )
    .sort((a, b) => {
      // Orchestrators before other types
      const aOrch = a.agent.agentType === "orchestrator" ? 0 : 1;
      const bOrch = b.agent.agentType === "orchestrator" ? 0 : 1;
      if (aOrch !== bOrch) return aOrch - bOrch;

      // Alphabetical
      return a.agent.displayName.localeCompare(b.agent.displayName);
    });

  const selectedAgent = selectedAgentId ? agents[selectedAgentId] : null;

  // Keep last selected agent in ref so content stays visible during close animation
  const lastAgentRef = useRef<ManagedAgent | null>(null);
  if (selectedAgent) lastAgentRef.current = selectedAgent;
  const displayAgent = selectedAgent || lastAgentRef.current;
  const drawerOpen = !!selectedAgent;

  // Close drawers on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showProfile) setShowProfile(false);
        else if (drawerOpen) selectAgent(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, showProfile, selectAgent]);

  const runningCount = Object.values(agents).filter(
    (m) => m.processStatus === "running"
  ).length;
  const totalCount = Object.keys(agents).length;
  const stoppedWithKeys = Object.values(agents).filter(
    (m) => m.processStatus === "stopped" && m.apiKey
  );
  const runningAgents = Object.values(agents).filter(
    (m) => m.processStatus === "running"
  );

  const handleStartAll = async () => {
    setStartingAll(true);
    for (let i = 0; i < stoppedWithKeys.length; i++) {
      try {
        await startAgent(stoppedWithKeys[i].agent.id);
        // Stagger startup to avoid thundering-herd on the backend DB pool
        if (i < stoppedWithKeys.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch {
        // continue starting others
      }
    }
    setStartingAll(false);
  };

  const handleStopAll = async () => {
    setStoppingAll(true);
    for (const m of runningAgents) {
      try {
        await stopAgent(m.agent.id);
      } catch {
        // continue stopping others
      }
    }
    setStoppingAll(false);
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-border bg-card"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-tight">Agents</h1>
              <p className="text-[11px] text-muted-foreground">
                {totalCount} agent{totalCount !== 1 && "s"}
                {runningCount > 0 && (
                  <span className="text-success ml-1.5">
                    · {runningCount} running
                  </span>
                )}
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-3"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents..."
                className="pl-9 w-[200px]"
              />
            </div>
            {runningCount < totalCount && stoppedWithKeys.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStartAll}
                disabled={startingAll}
                title={`Start ${stoppedWithKeys.length} stopped agent(s)`}
              >
                <Play className="w-3.5 h-3.5" />
                {startingAll ? "Starting..." : "Start All"}
              </Button>
            )}
            {runningCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStopAll}
                disabled={stoppingAll}
                title={`Stop ${runningCount} running agent(s)`}
              >
                <Square className="w-3.5 h-3.5" />
                {stoppingAll ? "Stopping..." : "Stop All"}
              </Button>
            )}
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />
              New Agent
            </Button>

            <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowProfile(true)}
                className="text-muted-foreground hover:text-foreground gap-1.5"
                title="Profile & Settings"
              >
                <Avatar size="sm">
                  {participant?.avatarUrl ? (
                    <AvatarImage src={participant.avatarUrl} alt={participant.displayName} />
                  ) : null}
                  <AvatarFallback>
                    <User className="w-3 h-3" />
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs truncate max-w-[100px]">
                  {participant?.displayName}
                </span>
              </Button>
            </div>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Agent list + hex board */}
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="mx-6 mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            {loading && totalCount === 0 ? (
              <div className="text-center text-muted-foreground py-20">
                Loading agents...
              </div>
            ) : totalCount === 0 && !error ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-8 h-8 text-primary" />
                </div>
                <p className="text-muted-foreground mb-4">No agents yet</p>
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" />
                  Create Your First Agent
                </Button>
              </div>
            ) : (
              <>
                {/* Hex activity board + Agent list share same container */}
                <div className="p-6">
                  <Card className="overflow-hidden">
                    <div className="grid grid-cols-[1fr_100px_140px_120px_80px_60px] gap-3 px-5 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <span>Agent</span>
                      <span>Backend</span>
                      <span>Model</span>
                      <span>Status</span>
                      <span>Health</span>
                      <span className="text-right">Actions</span>
                    </div>
                    {agentList.map((managed) => (
                      <AgentRow
                        key={managed.agent.id}
                        managed={managed}
                        selected={managed.agent.id === selectedAgentId}
                        onSelect={() =>
                          selectAgent(
                            managed.agent.id === selectedAgentId
                              ? null
                              : managed.agent.id
                          )
                        }
                      />
                    ))}
                  </Card>
                </div>
              </>
            )}
          </div>

        </div>
      </main>

      {/* Agent detail drawer — overlay from the right */}
      <div
        className={cn(
          "fixed inset-0 bg-black/20 z-40 transition-opacity duration-200",
          drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => selectAgent(null)}
      />
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[800px] max-w-[85vw] bg-card border-l border-border shadow-2xl z-50 overflow-hidden",
          "transition-transform duration-300 ease-out",
          drawerOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {displayAgent && <AgentConfig managed={displayAgent} />}
      </div>

      {/* Profile drawer — overlay from the right */}
      <div
        className={cn(
          "fixed inset-0 bg-black/20 z-40 transition-opacity duration-200",
          showProfile ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setShowProfile(false)}
      />
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[640px] max-w-[85vw] bg-card border-l border-border shadow-2xl z-50 overflow-hidden",
          "transition-transform duration-300 ease-out",
          showProfile ? "translate-x-0" : "translate-x-full"
        )}
      >
        {showProfile && <Profile onClose={() => setShowProfile(false)} />}
      </div>

      {showCreate && (
        <CreateAgentModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
