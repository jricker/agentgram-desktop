import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import {
  listConversationFiles,
  type ConversationFile,
} from "../../lib/api";
import { FilesPanel } from "./FilesPanel";

/**
 * Floating "📎 N files" chip that sits just LEFT of the threads chip
 * at the top-right of the chat area. Hidden when the conversation has
 * no file attachments. Clicking opens a dropdown panel listing every
 * file with uploader + timestamp + download.
 *
 * Position note: the chip uses a fixed `right` offset that clears the
 * threads chip's widest label so the two never overlap. When the
 * threads chip is hidden, this one stays put rather than sliding
 * rightward — preserves muscle memory across conversations.
 */
export function FilesBar({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ConversationFile[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const fresh = await listConversationFiles(conversationId, { limit: 100 });
    setFiles(fresh);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listConversationFiles(conversationId, { limit: 100 })
      .then((result) => {
        if (!cancelled) setFiles(result);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (loading && files.length === 0) return null;
  if (files.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "absolute top-2 right-[7rem] z-20 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-2.5 py-1 text-xs font-semibold text-primary shadow-sm transition-colors backdrop-blur-sm hover:bg-accent"
        )}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        aria-expanded={open}
        aria-label={`${files.length} file${files.length === 1 ? "" : "s"}`}
      >
        <Paperclip className="h-3.5 w-3.5" />
        <span>
          {files.length} file{files.length === 1 ? "" : "s"}
        </span>
      </button>

      <FilesPanel
        files={files}
        open={open}
        onClose={() => setOpen(false)}
        onRefresh={refresh}
      />
    </>
  );
}
