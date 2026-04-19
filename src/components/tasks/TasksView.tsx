import { useEffect } from "react";
import { Zap } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { TaskList } from "./TaskList";
import { TaskDetail, useOpenConversationFromTask } from "./TaskDetail";

export function TasksView({
  onOpenConversation,
}: {
  onOpenConversation: (conversationId: string) => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const selectedId = useTaskStore((s) => s.selectedTaskId);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  // Fetch tasks on mount. WS upserts keep the list live between fetches;
  // no auto-refetch on status change needed.
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <TaskList />
      {selected ? (
        <TaskDetail task={selected} onOpenConversation={onOpenConversation} />
      ) : (
        <EmptyDetail />
      )}
    </div>
  );
}

function EmptyDetail() {
  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-background">
      <Zap className="w-12 h-12 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground">Select a task</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Pick a task from the left to see its progress, live activity, and
        actions.
      </p>
    </section>
  );
}

// Re-export for convenience — AppShell uses this hook to wire "Open chat"
// from the detail pane back into the chat view.
export { useOpenConversationFromTask };
