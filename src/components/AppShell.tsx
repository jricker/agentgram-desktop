import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Bot, User, Zap } from "lucide-react";
import { cn } from "../lib/utils";
import { useWebSocket } from "../hooks/useWebSocket";
import { useChatStore } from "../stores/chatStore";
import { useAuthStore } from "../stores/authStore";
import { useTaskStore, countActiveTasks } from "../stores/taskStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dashboard } from "./Dashboard";
import { MessagesView } from "./messages/MessagesView";
import { TasksView } from "./tasks/TasksView";
import { Profile } from "./Profile";

type View = "chat" | "tasks" | "agents";

export function AppShell() {
  const [view, setView] = useState<View>("chat");
  const [showProfile, setShowProfile] = useState(false);

  // Connect socket + wire store listeners once we have auth
  useWebSocket();

  // Esc closes the Profile drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showProfile) setShowProfile(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showProfile]);

  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      setActiveConversation(conversationId);
      setView("chat");
    },
    [setActiveConversation]
  );

  return (
    <div className="flex h-screen w-screen bg-background">
      <LeftRail
        view={view}
        onChange={setView}
        onOpenProfile={() => setShowProfile(true)}
      />
      {view === "chat" ? (
        <MessagesView />
      ) : view === "tasks" ? (
        <TasksView onOpenConversation={handleOpenConversation} />
      ) : (
        <Dashboard />
      )}

      {/* Profile drawer — lifted to shell so it's reachable from any view */}
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
    </div>
  );
}

function LeftRail({
  view,
  onChange,
  onOpenProfile,
}: {
  view: View;
  onChange: (v: View) => void;
  onOpenProfile: () => void;
}) {
  const unread = useChatStore((s) => s.unreadCounts);
  const personalConversations = useChatStore((s) => s.conversations);
  // Only count unread against conversations in the personal "Chats" list —
  // the server's /unread-counts endpoint returns entries for every
  // conversation the user can see, including agent-to-agent ones, which
  // would otherwise inflate the badge on the Chat tab.
  const totalUnread = useMemo(() => {
    const personalIds = new Set(personalConversations.map((c) => c.id));
    let sum = 0;
    for (const [id, n] of Object.entries(unread)) {
      if (personalIds.has(id)) sum += typeof n === "number" ? n : 0;
    }
    return sum;
  }, [unread, personalConversations]);
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskCount = countActiveTasks(tasks);
  const participant = useAuthStore((s) => s.participant);

  return (
    <nav
      className="flex flex-col w-14 shrink-0 border-r border-border bg-card py-3 items-center justify-between"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        className="flex flex-col gap-1 items-center"
      >
        <RailButton
          icon={MessageSquare}
          label="Chat"
          active={view === "chat"}
          onClick={() => onChange("chat")}
          badge={view !== "chat" && totalUnread > 0 ? totalUnread : undefined}
        />
        <RailButton
          icon={Zap}
          label="Tasks"
          active={view === "tasks"}
          onClick={() => onChange("tasks")}
          badge={
            view !== "tasks" && activeTaskCount > 0 ? activeTaskCount : undefined
          }
          badgeColor="orange"
        />
        <RailButton
          icon={Bot}
          label="Agents"
          active={view === "agents"}
          onClick={() => onChange("agents")}
        />
      </div>

      <button
        type="button"
        onClick={onOpenProfile}
        title="Profile & Settings"
        className="flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Avatar className="h-7 w-7">
          {participant?.avatarUrl ? (
            <AvatarImage src={participant.avatarUrl} alt={participant.displayName} />
          ) : null}
          <AvatarFallback>
            <User className="w-3.5 h-3.5" />
          </AvatarFallback>
        </Avatar>
      </button>
    </nav>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  badgeColor = "primary",
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  badgeColor?: "primary" | "orange";
}) {
  const badgeClass =
    badgeColor === "orange"
      ? "bg-orange-500 text-white"
      : "bg-primary text-primary-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="w-5 h-5" />
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-semibold flex items-center justify-center",
            badgeClass
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
