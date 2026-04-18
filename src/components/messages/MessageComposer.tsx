import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { ws } from "../../services/websocket";
import { Button } from "@/components/ui/button";

const MAX_HEIGHT = 180;

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const draft = useChatStore((s) => s.drafts[conversationId] ?? "");
  const setDraft = useChatStore((s) => s.setDraft);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingAtRef = useRef(0);

  // Auto-resize textarea to fit content (capped)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [draft]);

  // Refocus when switching conversations
  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId]);

  const handleChange = (value: string) => {
    setDraft(conversationId, value);
    setError(null);
    // Throttle typing events to ≥1s
    const now = Date.now();
    if (now - lastTypingAtRef.current > 1000) {
      ws.sendTyping(conversationId);
      lastTypingAtRef.current = now;
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(conversationId, text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-card px-3 py-2.5">
      {error && (
        <p className="text-[11px] text-destructive mb-1.5 px-1">{error}</p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
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
  );
}
