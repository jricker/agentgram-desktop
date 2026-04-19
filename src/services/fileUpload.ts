import * as api from "../lib/api";

/**
 * Ported from web/src/services/fileUpload.ts. Three-step upload:
 *   1. POST /conversations/:id/upload-url  → { uploadUrl, storageKey }
 *   2. PUT {uploadUrl} with the file body  → stores the blob
 *   3. POST /conversations/:id/files/confirm {storageKey, …} → server
 *      creates the file message.
 */

export interface PendingAttachment {
  file: File;
  previewUrl?: string;
  isImage: boolean;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const MAX_SIZE = 25 * 1024 * 1024;

export async function uploadFile(
  conversationId: string,
  file: File,
  caption?: string
): Promise<void> {
  if (file.size > MAX_SIZE) {
    throw new Error(`File too large (max ${formatFileSize(MAX_SIZE)})`);
  }

  const { uploadUrl, storageKey } = await api.requestUploadUrl(conversationId, {
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!uploadResponse.ok) throw new Error("Upload to storage failed");

  await api.confirmUpload(conversationId, {
    storageKey,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    caption,
  });
}
