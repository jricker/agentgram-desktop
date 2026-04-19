import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Send, X, Image as ImageIcon, FileIcon, Loader2 } from "lucide-react";
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
import {
  formatFileSize,
  isImageFile,
  uploadFile,
  type PendingAttachment,
} from "../../services/fileUpload";

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
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingAtRef = useRef(0);

  // Revoke the preview object URL on attachment change to avoid leaking blobs.
  useEffect(() => {
    return () => {
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    };
  }, [attachment?.previewUrl]);

  // Reset attachment when switching conversations
  useEffect(() => {
    setAttachment(null);
  }, [conversationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = isImageFile(file);
    setAttachment({
      file,
      isImage,
      previewUrl: isImage ? URL.createObjectURL(file) : undefined,
    });
    setError(null);
    // Reset so selecting the same file again re-triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearAttachment = () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

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
    const hasAttachment = attachment != null;
    if ((!text && !hasAttachment) || sending || uploading) return;
    setError(null);

    // If there's an attachment, upload it first. The server creates the file
    // message; any typed text is used as the caption. Send a separate text
    // message afterward if both content types are present and we want to
    // preserve threading — for now we just use caption.
    if (hasAttachment) {
      setUploading(true);
      try {
        await uploadFile(conversationId, attachment!.file, text || undefined);
        clearAttachment();
        useChatStore.getState().setDraft(conversationId, "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setUploading(false);
        return;
      }
      setUploading(false);
      return;
    }

    setSending(true);
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

  const canSend = (draft.trim().length > 0 || attachment != null) && !sending && !uploading;

  return (
    <div className="border-t border-border bg-card">
      {replyingTo && (
        <ReplyBanner conversationId={conversationId} message={replyingTo} />
      )}
      {attachment && (
        <AttachmentPreview
          attachment={attachment}
          uploading={uploading}
          onClear={clearAttachment}
        />
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

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt,.md,.json,.csv,.xlsx,.zip"
            onChange={handleFileSelect}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || attachment != null}
            title="Attach file"
            type="button"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleSelectionChange}
            onClick={handleSelectionChange}
            placeholder={attachment ? "Add a caption…" : "Message…"}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            style={{ maxHeight: MAX_HEIGHT }}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            title="Send (Enter)"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({
  attachment,
  uploading,
  onClear,
}: {
  attachment: PendingAttachment;
  uploading: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-3 py-2">
      {attachment.isImage && attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt={attachment.file.name}
          className="h-12 w-12 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted shrink-0">
          {attachment.isImage ? (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          ) : (
            <FileIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{attachment.file.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {formatFileSize(attachment.file.size)}
          {uploading && " · Uploading…"}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={uploading}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        title="Remove attachment"
        aria-label="Remove attachment"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
