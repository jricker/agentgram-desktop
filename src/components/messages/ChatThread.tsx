import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "../../lib/api";

const SENDER_RUN_BREAK_MS = 2 * 60 * 1000;

export function ChatThread({ conversationId }: { conversationId: string }) {
  const messages = useChatStore((s) => s.messages[conversationId] ?? []);
  const loading = useChatStore((s) => s.messagesLoading[conversationId] ?? false);
  const hasMore = useChatStore((s) => s.hasMore[conversationId] ?? false);
  const fetchMessages = useChatStore((s) => s.fetchMessages);

  const typingIds = usePresenceStore((s) => s.typing[conversationId]);
  const typingNames = usePresenceStore((s) => s.typingNames);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const prevConvIdRef = useRef<string | null>(null);

  // Fetch on first open of a conversation (WS `recent_messages` usually beats
  // this, but REST is the safety net if the channel join stalls).
  useEffect(() => {
    if (messages.length === 0 && !loading) {
      fetchMessages(conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Autoscroll to bottom on: conversation change, new incoming/sent message
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const convChanged = prevConvIdRef.current !== conversationId;
    const newMessages = messages.length > prevLengthRef.current;
    if (convChanged || newMessages) {
      el.scrollTop = el.scrollHeight;
    }
    prevLengthRef.current = messages.length;
    prevConvIdRef.current = conversationId;
  }, [conversationId, messages.length]);

  // Infinite scroll up — when scroll nears top, page older messages
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || loading) return;
    if (e.currentTarget.scrollTop < 80) {
      const oldest = messages[0];
      if (oldest) fetchMessages(conversationId, oldest.id);
    }
  };

  const typingLabel = useMemo(() => {
    if (!typingIds || typingIds.size === 0) return null;
    const names = Array.from(typingIds)
      .map((id) => typingNames[id])
      .filter(Boolean) as string[];
    if (names.length === 0) return "Someone is typing…";
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names[0]} and ${names.length - 1} others are typing…`;
  }, [typingIds, typingNames]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-2"
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
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                showAvatar={showAvatar}
                showSenderName={showSenderName}
              />
            );
          })}
          {typingLabel && (
            <div className="px-4 pt-2 pb-1 text-[11px] text-muted-foreground italic">
              {typingLabel}
            </div>
          )}
        </>
      )}
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
