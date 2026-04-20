import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { useStreamingStore } from "../../stores/streamingStore";
import { MessageBubble } from "./MessageBubble";
import { MessageContextMenu } from "./MessageContextMenu";
import { StreamingBubble } from "./StreamingBubble";
import { cn, dayKey, formatDayLabel } from "../../lib/utils";
import type { Message } from "../../lib/api";

const SENDER_RUN_BREAK_MS = 2 * 60 * 1000;
const SCROLL_BOTTOM_THRESHOLD = 120;

const EMPTY_MESSAGES: Message[] = [];

// --- Task-message consolidation (ported from web/src/components/ChatView.tsx)
//
// The server emits a sequence of messages per task_id (TaskRequest →
// TaskProgress → TaskComplete/TaskFail), plus StatusUpdate messages for
// the same lifecycle. Rendering each as its own card stacks the thread
// with duplicates. Instead:
//   1. Compute latest status per task_id across the thread.
//   2. Hide TaskProgress / TaskComplete / TaskFail / TaskAccept / TaskReject
//      — their info lives on the TaskRequest card.
//   3. Keep only the first StatusUpdate per task_id.
//   4. Mutate TaskRequest.taskSnapshot.status to the latest so the
//      request card flips to "complete" / "failed" in place.
// Web + mobile + desktop all share this rule so a task renders as a
// single live card per task_id.

const HIDDEN_MSG_TYPES = new Set([
  "TaskReassign",
  "TaskDeclined",
  "EndTurn",
  "TurnDirective",
  "CapabilityUpdate",
  "capability_negotiation",
]);
const TYPED_LIFECYCLE_TYPES = new Set([
  "TaskProgress",
  "TaskComplete",
  "TaskFail",
  "TaskAccept",
  "TaskReject",
]);
const STATUS_LIFECYCLE_TYPES = new Set([
  "task_delegated",
  "task_self_assigned",
  "task_accepted",
  "task_in_progress",
  "task_complete",
  "task_complete_summary",
  "task_failed",
  "task_cancelled",
]);
const LIFECYCLE_TO_STATUS: Record<string, string> = {
  task_delegated: "in_progress",
  task_self_assigned: "in_progress",
  task_accepted: "in_progress",
  task_in_progress: "in_progress",
  task_complete: "complete",
  task_complete_summary: "complete",
  task_failed: "failed",
  task_cancelled: "cancelled",
};
const BARE_STATUS_TO_LIFECYCLE: Record<string, string> = {
  pending: "task_delegated",
  in_progress: "task_in_progress",
  accepted: "task_accepted",
  complete: "task_complete",
  failed: "task_failed",
  declined: "task_failed",
  blocked: "task_in_progress",
  cancelled: "task_cancelled",
};

function extractTaskId(msg: Message): string | undefined {
  return (
    msg.taskSnapshot?.id ??
    ((msg.metadata as Record<string, unknown> | undefined)?.task_id as
      | string
      | undefined)
  );
}

function consolidate(messages: Message[]): Message[] {
  // Pass 1: latest status per task_id.
  const latestByTaskId = new Map<string, string>();
  for (const msg of messages) {
    const type = msg.messageType || msg.contentType || "";

    if (type === "StatusUpdate" || type === "status_update") {
      try {
        const data = JSON.parse(msg.content) as Record<string, unknown>;
        const taskId = data.task_id as string | undefined;
        const raw = (data.lifecycle_type ?? data.type ?? data.status) as
          | string
          | undefined;
        if (!taskId || !raw) continue;
        const lifecycle = BARE_STATUS_TO_LIFECYCLE[raw] ?? raw;
        const status = LIFECYCLE_TO_STATUS[lifecycle];
        if (status) latestByTaskId.set(taskId, status);
      } catch {
        // not JSON payload — skip
      }
    }

    const taskId = extractTaskId(msg);
    if (taskId && TYPED_LIFECYCLE_TYPES.has(type)) {
      const next: Record<string, string> = {
        TaskAccept: "in_progress",
        TaskProgress: "in_progress",
        TaskComplete: "complete",
        TaskFail: "failed",
        TaskReject: "declined",
      };
      if (next[type]) latestByTaskId.set(taskId, next[type]!);
    }
  }

  // Pass 2: filter + enrich.
  const seenStatusUpdateForTask = new Set<string>();
  return messages
    .filter((msg) => {
      const type = msg.messageType || msg.contentType || "";
      if (HIDDEN_MSG_TYPES.has(type)) return false;

      const taskId = extractTaskId(msg);

      // Strip lifecycle bubbles — they roll into the TaskRequest card.
      if (taskId && TYPED_LIFECYCLE_TYPES.has(type)) return false;

      // Dedupe StatusUpdate cards: one per task_id.
      if (type === "StatusUpdate" || type === "status_update") {
        try {
          const data = JSON.parse(msg.content) as Record<string, unknown>;
          const suTaskId = data.task_id as string | undefined;
          const raw = (data.lifecycle_type ?? data.type ?? data.status) as
            | string
            | undefined;
          if (!suTaskId || !raw) return true;
          const lifecycle = BARE_STATUS_TO_LIFECYCLE[raw] ?? raw;
          if (!STATUS_LIFECYCLE_TYPES.has(lifecycle)) return true;
          if (seenStatusUpdateForTask.has(suTaskId)) return false;
          seenStatusUpdateForTask.add(suTaskId);
          return true;
        } catch {
          return true;
        }
      }
      return true;
    })
    .map((msg) => {
      const type = msg.messageType || msg.contentType || "";
      if (type !== "TaskRequest") return msg;
      const taskId = extractTaskId(msg);
      if (!taskId || !latestByTaskId.has(taskId)) return msg;
      return {
        ...msg,
        taskSnapshot: {
          ...(msg.taskSnapshot ?? {}),
          id: taskId,
          status: latestByTaskId.get(taskId),
        },
      };
    });
}

export function ChatThread({ conversationId }: { conversationId: string }) {
  const messagesRaw = useChatStore((s) => s.messages[conversationId]);
  const rawMessages = messagesRaw ?? EMPTY_MESSAGES;
  // Roll task lifecycle / status-update messages into the TaskRequest card
  // so a single task_id renders as one live card, not a stack of three.
  const messages = useMemo(() => consolidate(rawMessages), [rawMessages]);
  const loading = useChatStore((s) => s.messagesLoading[conversationId] ?? false);
  const hasMore = useChatStore((s) => s.hasMore[conversationId] ?? false);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const firstUnreadId = useChatStore((s) => s.firstUnreadIds[conversationId]);
  const myId = useAuthStore((s) => s.participant?.id);

  const typingIds = usePresenceStore((s) => s.typing[conversationId]);
  const typingNames = usePresenceStore((s) => s.typingNames);
  const stream = useStreamingStore((s) => s.streams[conversationId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const prevConvIdRef = useRef<string | null>(null);
  const [nearBottom, setNearBottom] = useState(true);

  const [menu, setMenu] = useState<{
    message: Message;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (messages.length === 0 && !loading) {
      fetchMessages(conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Autoscroll: always on conversation switch; on new messages only if the
  // user was already near the bottom (don't yank them away from history).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const convChanged = prevConvIdRef.current !== conversationId;
    const newMessages = messages.length > prevLengthRef.current;
    if (convChanged || (newMessages && nearBottom)) {
      el.scrollTop = el.scrollHeight;
    }
    prevLengthRef.current = messages.length;
    prevConvIdRef.current = conversationId;
  }, [conversationId, messages.length, nearBottom]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setNearBottom(distanceFromBottom < SCROLL_BOTTOM_THRESHOLD);

    if (hasMore && !loading && el.scrollTop < 80) {
      // Use the raw oldest (not the consolidated one) as the pagination
      // anchor — a filtered TaskProgress could have been the earliest record.
      const oldest = rawMessages[0];
      if (oldest) fetchMessages(conversationId, oldest.id);
    }
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const typingLabel = useMemo(() => {
    if (!typingIds || typingIds.size === 0) return null;
    // Don't show typing if the same agent is already streaming (avoid dupe)
    const names = Array.from(typingIds)
      .filter((id) => !stream || stream.senderId !== id)
      .map((id) => typingNames[id])
      .filter(Boolean) as string[];
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names[0]} and ${names.length - 1} others are typing…`;
  }, [typingIds, typingNames, stream]);

  const handleContextMenu = (message: Message, e: React.MouseEvent) => {
    setMenu({ message, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto py-2"
      >
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center py-2">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    Scroll up for more
                  </span>
                )}
              </div>
            )}
            {messages.map((msg, i) => {
              const prev = messages[i - 1];
              const isSameSender = prev?.senderId === msg.senderId;
              const closeInTime = isNear(prev, msg);
              const showAvatar = !isSameSender || !closeInTime;
              const showSenderName = showAvatar;
              const dayChanged =
                !prev || dayKey(prev.insertedAt) !== dayKey(msg.insertedAt);
              const showUnreadDivider = firstUnreadId === msg.id;
              return (
                <Fragment key={msg.id}>
                  {dayChanged && <DaySeparator iso={msg.insertedAt} />}
                  {showUnreadDivider && <UnreadDivider />}
                  <MessageBubble
                    message={msg}
                    showAvatar={showAvatar}
                    showSenderName={showSenderName}
                    onContextMenu={handleContextMenu}
                  />
                </Fragment>
              );
            })}
            {stream && <StreamingBubble stream={stream} />}
            {typingLabel && (
              <div className="px-4 pt-2 pb-1 text-[11px] text-muted-foreground italic">
                {typingLabel}
              </div>
            )}
          </>
        )}
      </div>

      {!nearBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            "absolute bottom-3 left-1/2 -translate-x-1/2 z-10",
            "flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-md",
            "hover:bg-muted transition-colors"
          )}
          title="Jump to latest"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Latest
        </button>
      )}

      {menu && (
        <MessageContextMenu
          message={menu.message}
          x={menu.x}
          y={menu.y}
          canDelete={menu.message.senderId === myId && !menu.message.pending}
          onReply={(m) => setReplyingTo(conversationId, m)}
          onCopy={(m) => navigator.clipboard?.writeText(m.content ?? "")}
          onCopyId={(m) => navigator.clipboard?.writeText(m.id)}
          onDelete={(m) => {
            if (confirm("Delete this message?")) {
              deleteMessage(conversationId, m.id);
            }
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center justify-center px-4 py-3">
      <div className="flex-1 border-t border-border" />
      <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {formatDayLabel(iso)}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function UnreadDivider() {
  return (
    <div className="flex items-center justify-center px-4 py-2">
      <div className="flex-1 border-t border-primary/40" />
      <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-primary">
        New messages
      </span>
      <div className="flex-1 border-t border-primary/40" />
    </div>
  );
}

function isNear(a: Message | undefined, b: Message): boolean {
  if (!a) return false;
  return (
    new Date(b.insertedAt).getTime() - new Date(a.insertedAt).getTime() <
    SENDER_RUN_BREAK_MS
  );
}
