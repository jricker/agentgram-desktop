import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useAgentStore } from "../../stores/agentStore";
import { useAuthStore } from "../../stores/authStore";
import { ws } from "../../services/websocket";
import { Button } from "@/components/ui/button";
import { ReplyBanner } from "./ReplyBanner";
import {
  MentionPicker,
  extractMentionQuery,
  getMentionItems,
  insertMention,
  type MentionItem,
} from "./MentionPicker";

const MAX_HEIGHT = 180;

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const draft = useChatStore((s) => s.drafts[conversationId] ?? "");
  const setDraft = useChatStore((s) => s.setDraft);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const replyingTo = useChatStore((s) => s.replyingTo[conversationId]);
  const members = useChatStore(
    (s) => s.conversations.find((c) => c.id === conversationId)?.members ?? []
  );
  const agentsMap = useAgentStore((s) => s.agents);
  // Stable flattened list to avoid the Zustand `?? []` selector trap.
  const agents = useMemo(
    () => Object.values(agentsMap).map((m) => m.agent),
    [agentsMap]
  );
  const currentUserId = useAuthStore((s) => s.participant?.id);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingAtRef = useRef(0);

  // Derived list of current picker items (for keyboard selection)
  const mentionItems = useMemo(
    () =>
      mentionQuery == null
        ? []
        : getMentionItems(mentionQuery, members, agents, currentUserId),
    [mentionQuery, members, agents, currentUserId]
  );

  // Auto-resize textarea to fit content, capped at MAX_HEIGHT
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [draft]);

  // Refocus when switching conversations or starting a reply
  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId, replyingTo?.id]);

  const updateMention = (value: string, cursorPos: number) => {
    const q = extractMentionQuery(value, cursorPos);
    if (q !== mentionQuery) {
      setMentionQuery(q);
      setMentionIndex(0);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(conversationId, value);
    setError(null);
    updateMention(value, e.target.selectionStart ?? value.length);

    // Throttle typing events to ≥1s
    const now = Date.now();
    if (now - lastTypingAtRef.current > 1000) {
      ws.sendTyping(conversationId);
      lastTypingAtRef.current = now;
    }
  };

  const handleSelectionChange = () => {
    const el = textareaRef.current;
    if (!el) return;
    updateMention(el.value, el.selectionStart ?? el.value.length);
  };

  const commitMention = (item: MentionItem) => {
    const el = textareaRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart ?? draft.length;
    const { text, cursor } = insertMention(draft, cursorPos, item.displayName);
    setDraft(conversationId, text);
    setMentionQuery(null);
    setMentionIndex(0);
    // Restore cursor position after React renders
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(cursor, cursor);
      }
    });
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(conversationId, text, {
        parentMessageId: replyingTo?.id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mention picker owns keys while it's open
    if (mentionQuery != null && mentionItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + mentionItems.length) % mentionItems.length
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commitMention(mentionItems[mentionIndex]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      useChatStore.getState().setReplyingTo(conversationId, null);
    }
  };

  return (
    <div className="border-t border-border bg-card">
      {replyingTo && (
        <ReplyBanner conversationId={conversationId} message={replyingTo} />
      )}
      <div className="px-3 py-2.5">
        {error && <p className="text-[11px] text-destructive mb-1.5 px-1">{error}</p>}
        <div className="relative flex items-end gap-2">
          {mentionQuery != null && (
            <MentionPicker
              query={mentionQuery}
              members={members}
              allAgents={agents}
              currentUserId={currentUserId}
              selectedIndex={mentionIndex}
              onSelect={commitMention}
            />
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleSelectionChange}
            onClick={handleSelectionChange}
            placeholder="Message…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            style={{ maxHeight: MAX_HEIGHT }}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            title="Send (Enter)"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
