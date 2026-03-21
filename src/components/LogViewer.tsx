import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";
import { Copy } from "lucide-react";

export function LogViewer({ agentId }: { agentId: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "error" | "task" | "message">("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const lines: string[] = await invoke("get_agent_logs", { agentId, tail: 200 });
        setLogs(lines);
      } catch {
        // Agent may not be running
      }
    };

    fetchLogs();
    intervalRef.current = setInterval(fetchLogs, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [agentId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filtered = logs.filter((line) => {
    if (filter === "all") return true;
    const lower = line.toLowerCase();
    if (filter === "error") return lower.includes("error") || lower.includes("warn");
    if (filter === "task") return lower.includes("task") || lower.includes("complete");
    if (filter === "message") return lower.includes("message");
    return true;
  });

  const filters = ["all", "error", "task", "message"] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-5 py-2.5 border-b border-border">
        {filters.map((f) => (
          <button
            key={f}
            className={cn(
              "px-2.5 py-1 text-xs rounded-md transition-colors",
              filter === f
                ? "bg-accent-light text-accent font-medium"
                : "text-text-muted hover:text-text-secondary"
            )}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <button
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          onClick={() => navigator.clipboard.writeText(filtered.join("\n"))}
          title="Copy logs"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed" ref={scrollRef}>
        {filtered.length === 0 ? (
          <div className="text-center text-text-muted py-10">No logs yet</div>
        ) : (
          filtered.map((line, i) => (
            <div
              key={i}
              className={cn(
                "py-0.5 whitespace-pre-wrap break-all",
                line.toLowerCase().includes("error")
                  ? "text-danger"
                  : line.toLowerCase().includes("warn")
                    ? "text-warning"
                    : "text-text-secondary"
              )}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
