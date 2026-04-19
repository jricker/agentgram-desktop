import { useEffect, useState } from "react";
import { FileIcon, ImageIcon, Download, Loader2, ExternalLink } from "lucide-react";
import * as api from "../../lib/api";
import { formatFileSize } from "../../services/fileUpload";
import type { Message } from "../../lib/api";

interface FileContent {
  attachmentId?: string;
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
  caption?: string;
}

function safeParseJson<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

function isImage(contentType?: string): boolean {
  return contentType?.startsWith("image/") ?? false;
}

function useDownloadUrl(attachmentId?: string, existingUrl?: string) {
  const [url, setUrl] = useState<string | null>(existingUrl ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existingUrl) {
      setUrl(existingUrl);
      return;
    }
    if (!attachmentId) return;

    setLoading(true);
    let cancelled = false;
    api
      .getFileDownloadUrl(attachmentId)
      .then((data) => {
        if (!cancelled) setUrl(data.url);
      })
      .catch((e) => {
        if (!cancelled) {
          console.warn("[FileMessage] download URL fetch failed", e);
          setUrl(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentId, existingUrl]);

  return { url, loading };
}

export function FileMessage({ message }: { message: Message }) {
  const file = safeParseJson<FileContent>(message.content, {
    filename: message.content,
  });
  const attachment = message.fileAttachments?.[0];
  const attachmentId = file.attachmentId ?? attachment?.id;
  const filename = file.filename ?? attachment?.filename ?? "File";
  const contentType = file.contentType ?? attachment?.contentType;
  const size = file.sizeBytes ?? attachment?.sizeBytes;
  const { url, loading } = useDownloadUrl(attachmentId, attachment?.downloadUrl);

  if (isImage(contentType)) {
    return (
      <div className="space-y-1">
        {loading ? (
          <div className="flex h-40 w-full items-center justify-center rounded-lg bg-muted/30">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt={filename}
              className="max-h-60 max-w-full rounded-lg object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </a>
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg bg-muted/30 text-xs text-muted-foreground">
            <ImageIcon className="mr-1.5 h-4 w-4" />
            {filename}
          </div>
        )}
        {file.caption && <p className="text-xs">{file.caption}</p>}
      </div>
    );
  }

  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/50"
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
    >
      <FileIcon className="h-8 w-8 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{filename}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {size ? <span>{formatFileSize(size)}</span> : null}
          {file.caption && <span>{file.caption}</span>}
        </div>
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : url ? (
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </a>
  );
}

const FILE_TYPES = new Set(["FileMessage", "file"]);

export function isFileMessage(message: Message): boolean {
  const type = message.messageType || message.contentType || "";
  return FILE_TYPES.has(type);
}
