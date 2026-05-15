import {
  Bot,
  ChevronRight,
  Loader2,
  MessageSquareText,
  Radio,
} from "lucide-react";
import { useMemo } from "react";
import type { ActiveStream, Conversation, Message, StreamPhase } from "../../lib/api";
import {
  cn,
  formatConversationTime,
  getConversationTitle,
} from "../../lib/utils";
import { useAuthStore } from "../../stores/authStore";
import { useChatStore } from "../../stores/chatStore";
import { useNavStore } from "../../stores/navStore";
import { useStreamingStore } from "../../stores/streamingStore";
import { GroupAvatar } from "./GroupAvatar";

const MAX_FEED_MESSAGES = 3;
const EMPTY_MESSAGES: Message[] = [];

function phaseLabel(phase: StreamPhase, detail?: string): string {
  switch (phase) {
    case "tool_call":
      return detail ? `Using ${detail}` : "Using a tool";
    case "writing":
      return "Writing";
    case "analyzing":
      return "Analyzing";
    case "queued":
      return "Queued";
    case "waiting":
      return "Waiting";
    case "thinking":
    default:
      return "Thinking";
  }
}

function compact(text: string, max = 140): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function summarizeStatusPayload(payload: Record<string, unknown>): string {
  const rawType = String(payload.lifecycle_type ?? payload.type ?? payload.status ?? "");
  const title = typeof payload.title === "string" ? payload.title : undefined;
  const summary =
    typeof payload.summary === "string"
      ? payload.summary
      : typeof payload.error === "string"
        ? payload.error
        : undefined;

  const label =
    rawType === "task_complete" || rawType === "complete"
      ? "completed a task"
      : rawType === "task_failed" || rawType === "failed"
        ? "hit a task error"
        : rawType === "task_in_progress" || rawType === "in_progress"
          ? "is working"
          : rawType.replace(/_/g, " ") || "posted an update";

  return compact([label, title, summary].filter(Boolean).join(" · "));
}

function summarizeMessage(message: Message): string {
  const type = message.messageType || message.contentType || "";
  if (type === "StatusUpdate" || type === "status_update") {
    try {
      return summarizeStatusPayload(JSON.parse(message.content) as Record<string, unknown>);
    } catch {
      // fall through to raw content
    }
  }

  if (type === "ToolCall" || type === "ToolResult") {
    return compact(type.replace(/([a-z])([A-Z])/g, "$1 $2"));
  }

  const structured = message.contentStructured?.data ?? message.contentStructured?.payload;
  const raw =
    message.content ||
    (structured ? compact(JSON.stringify(structured), 140) : "") ||
    "Posted an update";
  return compact(raw);
}

function streamSummary(stream: ActiveStream): string {
  const label = phaseLabel(stream.phase, stream.phaseDetail);
  const content = compact(stream.content, 110);
  return content ? `${label}: ${content}` : label;
}

export function AgentConversationCard({
  conversation,
}: {
  conversation: Conversation;
}) {
  const myId = useAuthStore((s) => s.participant?.id);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const messages =
    useChatStore((s) => s.messages[conversation.id]) ?? EMPTY_MESSAGES;
  const stream = useStreamingStore((s) => s.streams[conversation.id]);
  const setView = useNavStore((s) => s.setView);

  const title = getConversationTitle(conversation, myId);
  const agentMembers = useMemo(() => {
    const members = conversation.members ?? [];
    const agents = members.filter((m) => m.participant?.type === "agent");
    return agents.length > 0 ? agents : members.filter((m) => m.participantId !== myId);
  }, [conversation.members, myId]);

  const latestMessages = useMemo(
    () => messages.slice(-MAX_FEED_MESSAGES),
    [messages]
  );
  const fallbackMessage = latestMessages.length === 0 ? conversation.lastMessage : undefined;
  const feedMessages = fallbackMessage ? [fallbackMessage] : latestMessages;
  const isLive = Boolean(stream);
  const memberNames = agentMembers
    .map((m) => m.participant?.displayName)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  const openConversation = () => {
    setActiveConversation(conversation.id);
    setView("chat");
  };

  return (
    <div className="flex justify-start px-4 py-1.5">
      <button
        type="button"
        onClick={openConversation}
        className={cn(
          "group w-full max-w-[70%] overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-colors",
          isLive
            ? "border-primary/30 ring-1 ring-primary/10 hover:bg-primary/5"
            : "border-border hover:bg-muted/40"
        )}
      >
        <div className="p-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <GroupAvatar members={agentMembers} size={38} />
              {isLive && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-card bg-primary" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded bg-bubble-agent-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bubble-agent-accent">
                  <Bot className="h-3 w-3" />
                  Agent chat
                </span>
                {isLive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    <Radio className="h-2.5 w-2.5" />
                    Live
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {title}
              </p>
              {memberNames && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {memberNames}
                  {agentMembers.length > 3 ? ` +${agentMembers.length - 3}` : ""}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1 text-muted-foreground transition-colors group-hover:text-primary">
              <span className="text-[10px]">{formatConversationTime(conversation.updatedAt)}</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border bg-background/50">
            {stream && (
              <div className="flex items-start gap-2 border-b border-border px-3 py-2">
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-primary">
                    {stream.senderName}
                  </p>
                  <p className="line-clamp-2 text-xs text-foreground">
                    {streamSummary(stream)}
                  </p>
                </div>
              </div>
            )}

            {feedMessages.length > 0 ? (
              <div className="divide-y divide-border">
                {feedMessages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-2 px-3 py-2">
                    <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-muted-foreground">
                        {msg.sender?.displayName ?? "Agent"}
                      </p>
                      <p className="line-clamp-2 text-xs text-foreground">
                        {summarizeMessage(msg)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Waiting for the first agent-to-agent update…
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Live feed from the spun-up agent conversation</span>
            <span className="font-semibold text-primary">Open chat</span>
          </div>
        </div>
      </button>
    </div>
  );
}
