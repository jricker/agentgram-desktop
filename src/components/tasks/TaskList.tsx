import { useMemo, useState } from "react";
import { Loader2, Search, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, formatRelativeShort } from "../../lib/utils";
import { useTaskStore } from "../../stores/taskStore";
import type { Task, TaskStatus } from "../../lib/api";

type Filter = "active" | "pending" | "in_progress" | "complete" | "cancelled";

const FILTERS: { value: Filter; label: string; matches: (s: TaskStatus) => boolean }[] = [
  {
    value: "active",
    label: "Active",
    matches: (s) =>
      s === "pending" || s === "accepted" || s === "in_progress" || s === "blocked",
  },
  { value: "pending", label: "Pending", matches: (s) => s === "pending" },
  { value: "in_progress", label: "Progress", matches: (s) => s === "in_progress" },
  { value: "complete", label: "Done", matches: (s) => s === "complete" },
  {
    value: "cancelled",
    label: "Cancelled",
    matches: (s) => s === "cancelled" || s === "rejected" || s === "exhausted",
  },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  accepted: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  in_progress: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  blocked: "bg-rose-500/10 text-rose-500 border-rose-500/30",
  complete: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  rejected: "bg-rose-500/10 text-rose-500 border-rose-500/30",
  exhausted: "bg-muted text-muted-foreground border-border",
};

export function TaskList() {
  const tasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const selectedId = useTaskStore((s) => s.selectedTaskId);
  const selectTask = useTaskStore((s) => s.selectTask);

  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.value === filter) ?? FILTERS[0];
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!f.matches(t.status)) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.assignees ?? []).some((a) =>
          a.displayName.toLowerCase().includes(q)
        )
      );
    });
  }, [tasks, filter, search]);

  return (
    <aside
      className="w-80 shrink-0 flex flex-col border-r border-border bg-card"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="px-4 py-3 border-b border-border"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
      </div>

      <div
        className="px-3 py-2 border-b border-border space-y-2"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                filter === f.value
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilter={filter !== "active" || search.length > 0} />
        ) : (
          <ul className="flex flex-col">
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                active={task.id === selectedId}
                onClick={() => selectTask(task.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function TaskRow({
  task,
  active,
  onClick,
}: {
  task: Task;
  active: boolean;
  onClick: () => void;
}) {
  const assignee = task.assignees?.[0];
  const name = assignee?.displayName ?? "Unassigned";
  const statusClass = STATUS_COLORS[task.status] ?? STATUS_COLORS.cancelled;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-start gap-2.5 px-3 py-2.5 text-left border-b border-border transition-colors",
          active ? "bg-primary/5" : "hover:bg-muted/50"
        )}
      >
        <Avatar className="h-8 w-8 shrink-0 mt-0.5">
          {assignee?.avatarUrl ? (
            <AvatarImage src={assignee.avatarUrl} alt={name} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatRelativeShort(task.updatedAt)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-md border text-[10px] font-medium uppercase tracking-wide",
                statusClass
              )}
            >
              {task.status.replace(/_/g, " ")}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {name}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <Zap className="w-10 h-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">
        {hasFilter ? "No matching tasks" : "No tasks yet"}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {hasFilter
          ? "Try adjusting search or filters."
          : "Tasks your agents are working on will appear here."}
      </p>
    </div>
  );
}
