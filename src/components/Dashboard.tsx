import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAgentStore } from "../stores/agentStore";
import { AgentRow } from "./AgentRow";
import { AgentConfig } from "./AgentConfig";
import { CreateAgentModal } from "./CreateAgentModal";
import {
  Bot,
  Plus,
  LogOut,
  Search,
  LayoutDashboard,
} from "lucide-react";

export function Dashboard() {
  const { participant, logout } = useAuthStore();
  const {
    agents,
    selectedAgentId,
    loading,
    error,
    fetchAgents,
    fetchHealth,
    refreshProcessStatuses,
    selectAgent,
  } = useAgentStore();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    fetchAgents();
    fetchHealth();

    intervalRef.current = setInterval(() => {
      refreshProcessStatuses();
      fetchHealth();
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAgents, fetchHealth, refreshProcessStatuses]);

  const agentList = Object.values(agents)
    .filter((m) =>
      search
        ? m.agent.displayName.toLowerCase().includes(search.toLowerCase())
        : true
    )
    .sort((a, b) => a.agent.displayName.localeCompare(b.agent.displayName));

  const selectedAgent = selectedAgentId ? agents[selectedAgentId] : null;

  const runningCount = Object.values(agents).filter(
    (m) => m.processStatus === "running"
  ).length;
  const totalCount = Object.keys(agents).length;

  return (
    <div className="flex h-screen w-screen">
      {/* Sidebar */}
      <aside className="w-[260px] bg-surface border-r border-border flex flex-col">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-[15px] text-text">AgentChat</span>
        </div>

        {/* Nav */}
        <nav className="px-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-light text-accent text-sm font-medium">
            <LayoutDashboard className="w-4 h-4" />
            Agents
          </div>
        </nav>

        {/* Stats */}
        <div className="px-5 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-bg rounded-md px-3 py-2">
              <div className="text-lg font-semibold text-text">{totalCount}</div>
              <div className="text-[11px] text-text-muted">Total</div>
            </div>
            <div className="bg-success-light rounded-md px-3 py-2">
              <div className="text-lg font-semibold text-success">{runningCount}</div>
              <div className="text-[11px] text-text-muted">Running</div>
            </div>
          </div>
        </div>

        {/* User */}
        <div className="mt-auto px-3 pb-4">
          <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface-hover transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-accent-light text-accent flex items-center justify-center text-xs font-medium flex-shrink-0">
                {participant?.displayName?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <span className="text-sm text-text truncate">
                {participant?.displayName}
              </span>
            </div>
            <button
              onClick={logout}
              className="text-text-muted hover:text-danger transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col bg-bg overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-surface" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
          <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <h1 className="text-lg font-semibold text-text">Agents</h1>
            <p className="text-sm text-text-secondary">
              Manage and monitor your AI agents
            </p>
          </div>
          <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <div className="relative">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents..."
                className="pl-9 pr-3 py-2 w-[200px] bg-bg border border-border rounded-md text-sm placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Agent
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Agent List */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 text-sm text-danger bg-danger-light border border-danger/20 px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            {loading && agentList.length === 0 ? (
              <div className="text-center text-text-secondary py-20">
                Loading agents...
              </div>
            ) : agentList.length === 0 && !error ? (
              <div className="text-center py-20">
                <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-7 h-7 text-accent" />
                </div>
                <p className="text-text-secondary mb-4">No agents yet</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hover transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Your First Agent
                </button>
              </div>
            ) : (
              <div className="bg-surface rounded-lg border border-border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_140px_120px_100px_80px] gap-4 px-5 py-3 border-b border-border text-xs font-medium text-text-muted uppercase tracking-wide">
                  <span>Agent</span>
                  <span>Model</span>
                  <span>Status</span>
                  <span>Health</span>
                  <span className="text-right">Actions</span>
                </div>
                {/* Rows */}
                {agentList.map((managed) => (
                  <AgentRow
                    key={managed.agent.id}
                    managed={managed}
                    selected={managed.agent.id === selectedAgentId}
                    onSelect={() => selectAgent(managed.agent.id === selectedAgentId ? null : managed.agent.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedAgent && (
            <div className="w-[400px] border-l border-border bg-surface overflow-y-auto">
              <AgentConfig managed={selectedAgent} />
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <CreateAgentModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
