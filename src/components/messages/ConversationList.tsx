import { useMemo } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { cn, formatRelativeShort } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, MessageSquare } from "lucide-react";
import type { Conversation } from "../../lib/api";

export function ConversationList() {
  const conversations = useChatStore((s) => s.conversations);
  const loading = useChatStore((s) => s.conversationsLoading);
  const activeId = useChatStore((s) => s.activeConversationId);
  const unread = useChatStore((s) => s.unreadCounts);
  const setActive = useChatStore((s) => s.setActiveConversation);

  if (loading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <MessageSquare className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No conversations yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Conversations with your agents will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {conversations.map((conv) => (
        <ConversationRow
          key={conv.id}
          conversation={conv}
          active={conv.id === activeId}
          unread={unread[conv.id] ?? 0}
          onClick={() => setActive(conv.id)}
        />
      ))}
    </ul>
  );
}

function ConversationRow({
  conversation,
  active,
  unread,
  onClick,
}: {
  conversation: Conversation;
  active: boolean;
  unread: number;
  onClick: () => void;
}) {
  const myId = useAuthStore((s) => s.participant?.id);
  const online = usePresenceStore((s) => s.online);

  // Pick the "other" participant for avatar + default title on 1:1 convos.
  const other = useMemo(() => {
    const members = conversation.members ?? [];
    const others = members.filter((m) => m.participantId !== myId);
    return others[0]?.participant;
  }, [conversation.members, myId]);

  const title =
    conversation.title ||
    other?.displayName ||
    (conversation.type === "group" ? "Group" : "Conversation");

  const preview = conversation.lastMessage?.content ?? "";
  const time = formatRelativeShort(
    conversation.lastMessage?.insertedAt ?? conversation.updatedAt
  );
  const isOnline = other ? online.has(other.id) : false;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-border transition-colors",
          active ? "bg-primary/5" : "hover:bg-muted/50"
        )}
      >
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10">
            {other?.avatarUrl ? (
              <AvatarImage src={other.avatarUrl} alt={title} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {title.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-card" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm",
                unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"
              )}
            >
              {title}
            </p>
            <span
              className={cn(
                "text-[11px] shrink-0",
                unread > 0 ? "text-primary font-medium" : "text-muted-foreground"
              )}
            >
              {time}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p
              className={cn(
                "truncate text-xs",
                unread > 0 ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {preview || (
                <span className="italic text-muted-foreground/60">No messages yet</span>
              )}
            </p>
            {unread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center shrink-0">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
