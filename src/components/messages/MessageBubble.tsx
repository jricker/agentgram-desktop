import { useAuthStore } from "../../stores/authStore";
import { cn, formatClockTime } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Message } from "../../lib/api";

export function MessageBubble({
  message,
  showAvatar,
  showSenderName,
}: {
  message: Message;
  /** Show the sender avatar (true for the first in a run). */
  showAvatar: boolean;
  /** Show the sender name above the bubble (true for first in a run, others only). */
  showSenderName: boolean;
}) {
  const myId = useAuthStore((s) => s.participant?.id);
  const isOwn = message.senderId === myId;
  const isAgent = message.sender?.type === "agent";
  const senderName = message.sender?.displayName ?? "";
  const avatarUrl = message.sender?.avatarUrl;

  return (
    <div
      className={cn(
        "flex gap-2 px-4",
        isOwn ? "justify-end" : "justify-start",
        showAvatar ? "mt-3" : "mt-0.5"
      )}
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

        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm",
            message.pending && "opacity-60"
          )}
        >
          {message.content}
        </div>

        <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
          {formatClockTime(message.insertedAt)}
          {message.pending && " · sending"}
        </span>
      </div>
    </div>
  );
}
