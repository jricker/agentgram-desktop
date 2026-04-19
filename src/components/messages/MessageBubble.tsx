import { useAuthStore } from "../../stores/authStore";
import { useChatStore } from "../../stores/chatStore";
import { cn, formatClockTime } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Reply as ReplyIcon } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import { isTaskMessage, TaskMessage } from "./TaskMessages";
import { isToolMessage, ToolMessage } from "./ToolMessages";
import { isFileMessage, FileMessage } from "./FileMessage";
import type { Message } from "../../lib/api";

export function MessageBubble({
  message,
  showAvatar,
  showSenderName,
  onContextMenu,
}: {
  message: Message;
  /** Show the sender avatar (true for the first in a run). */
  showAvatar: boolean;
  /** Show the sender name above the bubble (true for first in a run, others only). */
  showSenderName: boolean;
  /** Right-click handler — bubbles the message + cursor up to the thread. */
  onContextMenu?: (message: Message, e: React.MouseEvent) => void;
}) {
  const myId = useAuthStore((s) => s.participant?.id);
  const isOwn = message.senderId === myId;
  const isAgent = message.sender?.type === "agent";
  const senderName = message.sender?.displayName ?? "";
  const avatarUrl = message.sender?.avatarUrl;
  const isTask = isTaskMessage(message);

  // Find the message we're replying to so we can render the preview
  const conversationId = message.conversationId;
  const parent = useChatStore((s) => {
    if (!message.parentMessageId) return undefined;
    return s.messages[conversationId]?.find(
      (m) => m.id === message.parentMessageId
    );
  });

  // Task messages render full-width (no bubble); still support right-click.
  if (isTask) {
    return (
      <div
        className={cn("px-4", showAvatar ? "mt-3" : "mt-0.5")}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu(message, e);
        }}
      >
        <TaskMessage message={message} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2 px-4",
        isOwn ? "justify-end" : "justify-start",
        showAvatar ? "mt-3" : "mt-0.5"
      )}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(message, e);
      }}
    >
      {!isOwn && (
        <div className="w-8 shrink-0">
          {showAvatar && (
            <Avatar className="h-8 w-8">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={senderName} /> : null}
              <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                {senderName.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={cn("flex flex-col max-w-[72%]", isOwn ? "items-end" : "items-start")}>
        {!isOwn && showSenderName && (
          <div className="flex items-center gap-1.5 mb-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{senderName}</span>
            {isAgent && (
              <span className="px-1.5 py-[1px] rounded bg-primary/10 text-primary text-[9px] font-semibold uppercase tracking-wide">
                agent
              </span>
            )}
          </div>
        )}

        {parent && (
          <div
            className={cn(
              "mb-0.5 max-w-full rounded-md border-l-2 px-2 py-1 text-[11px]",
              isOwn
                ? "border-primary-foreground/40 bg-primary/10 text-muted-foreground"
                : "border-muted-foreground/40 bg-muted/40 text-muted-foreground"
            )}
          >
            <div className="flex items-center gap-1">
              <ReplyIcon className="h-2.5 w-2.5" />
              <span className="font-medium text-foreground">
                {parent.sender?.displayName ?? "Unknown"}
              </span>
            </div>
            <p className="truncate">{parent.content}</p>
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm break-words",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm",
            message.pending && "opacity-60"
          )}
        >
          {isToolMessage(message) ? (
            <ToolMessage message={message} />
          ) : isFileMessage(message) ? (
            <FileMessage message={message} />
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>

        <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
          {formatClockTime(message.insertedAt)}
          {message.pending && " · sending"}
        </span>
      </div>
    </div>
  );
}
