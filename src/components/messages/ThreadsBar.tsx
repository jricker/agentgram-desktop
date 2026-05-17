import { MessagesSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import {
  isResolvedThread,
  selectChildAgentThreads,
} from "../../lib/thread-selectors";
import { useChatStore } from "../../stores/chatStore";
import { ThreadsPanel } from "./ThreadsPanel";

/**
 * Floating "💬 N threads" chip rendered absolutely over the top-right of
 * the chat content area. Hidden when no OPEN threads exist for this
 * conversation. Click opens a dropdown panel with the full thread list.
 *
 * Mirrors mobile/components/ThreadsBar.tsx — counts only open threads,
 * unread total only from open threads, dimmed visual when nothing new.
 */
export function ThreadsBar({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const agentConversations = useChatStore((s) => s.agentConversations);
  const unreadCounts = useChatStore((s) => s.unreadCounts);

  const openThreads = useMemo(
    () =>
      selectChildAgentThreads(agentConversations, conversationId).filter(
        (t) => !isResolvedThread(t)
      ),
    [agentConversations, conversationId]
  );

  const unreadTotal = useMemo(
    () => openThreads.reduce((sum, t) => sum + (unreadCounts[t.id] ?? 0), 0),
    [openThreads, unreadCounts]
  );

  if (openThreads.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "absolute top-2 right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-2.5 py-1 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-accent",
          "backdrop-blur-sm"
        )}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        aria-expanded={open}
        aria-label={`${openThreads.length} agent thread${openThreads.length === 1 ? "" : "s"}`}
      >
        <MessagesSquare className="h-3.5 w-3.5" />
        <span>
          {openThreads.length} thread{openThreads.length === 1 ? "" : "s"}
        </span>
        {unreadTotal > 0 ? (
          <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
        ) : null}
      </button>

      <ThreadsPanel
        parentConversationId={conversationId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
