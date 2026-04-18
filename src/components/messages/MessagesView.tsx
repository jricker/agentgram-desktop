import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConversationList } from "./ConversationList";
import { ChatThread } from "./ChatThread";
import { MessageComposer } from "./MessageComposer";

export function MessagesView() {
  const activeId = useChatStore((s) => s.activeConversationId);

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <aside
        className="w-80 shrink-0 flex flex-col border-r border-border bg-card"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div
          className="px-4 py-3 border-b border-border"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <h2 className="text-sm font-semibold text-foreground">Messages</h2>
        </div>
        <div
          className="flex-1 overflow-y-auto"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <ConversationList />
        </div>
      </aside>

      <section className="flex-1 flex flex-col bg-background overflow-hidden">
        {activeId ? <ActiveConversation conversationId={activeId} /> : <EmptyState />}
      </section>
    </div>
  );
}

function ActiveConversation({ conversationId }: { conversationId: string }) {
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === conversationId)
  );
  const myId = useAuthStore((s) => s.participant?.id);

  const headerTitle = useMemo(() => {
    if (!conversation) return "";
    if (conversation.title) return conversation.title;
    const other = (conversation.members ?? []).find(
      (m) => m.participantId !== myId
    );
    return other?.participant?.displayName ?? "Conversation";
  }, [conversation, myId]);

  return (
    <>
      <header
        className="px-4 py-3 border-b border-border bg-card flex items-center gap-3"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <Avatar className="h-8 w-8">
          {conversation?.members?.find((m) => m.participantId !== myId)?.participant
            ?.avatarUrl ? (
            <AvatarImage
              src={
                conversation.members.find((m) => m.participantId !== myId)!.participant!
                  .avatarUrl!
              }
              alt={headerTitle}
            />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {headerTitle.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{headerTitle}</p>
          {conversation && conversation.type !== "direct" && (
            <p className="text-[11px] text-muted-foreground">
              {(conversation.members?.length ?? 0)} members
            </p>
          )}
        </div>
      </header>

      <ChatThread conversationId={conversationId} />
      <MessageComposer conversationId={conversationId} />
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <MessageSquare className="w-12 h-12 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground">Select a conversation</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Your recent conversations with agents appear on the left. Pick one to jump in.
      </p>
    </div>
  );
}
