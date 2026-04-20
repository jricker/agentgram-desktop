import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Loader2,
  Check,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Code2,
  AlertCircle,
  CheckCircle2,
  Braces,
  Sparkles,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatRelativeShort } from "../../lib/utils";
import { useCanvasStore } from "../../stores/canvasStore";
import { CanvasRenderer } from "./CanvasRenderer";
import { CanvasInspector } from "./CanvasInspector";
import type { CanvasDefinitionSummary } from "../../lib/api";

const EXAMPLE_DEFINITION = {
  layout: { zones: ["header", "content", "footer"] },
  widgets: [
    {
      id: "w1",
      type: "text",
      zone: "header",
      props: { content: "Welcome", variant: "title" },
    },
    {
      id: "w2",
      type: "message_list",
      zone: "content",
      props: {},
    },
    {
      id: "w3",
      type: "button_grid",
      zone: "footer",
      props: {
        buttons: [
          {
            label: "Get Started",
            style: "primary",
            action: { type: "send_message", payload: { text: "Hello!" } },
          },
        ],
      },
    },
  ],
  composer: { mode: "text", placeholder: "Type a message..." },
};

function CopyIdChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      title="Copy canvas ID"
    >
      <span className="font-mono">{id.slice(0, 8)}…</span>
      {copied ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function statusBadge(canvas: CanvasDefinitionSummary) {
  if (canvas.isBuiltin) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        Built-in
      </Badge>
    );
  }
  if (canvas.isPublished) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] bg-success/10 text-success border-success/30"
      >
        Published
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="text-[10px] bg-warning/10 text-warning border-warning/30"
    >
      Draft
    </Badge>
  );
}

interface Props {
  canvas: CanvasDefinitionSummary | null;
  isNew: boolean;
}

export function CanvasEditor({ canvas, isNew }: Props) {
  const createDefinition = useCanvasStore((s) => s.createDefinition);
  const updateDefinition = useCanvasStore((s) => s.updateDefinition);
  const deleteDefinition = useCanvasStore((s) => s.deleteDefinition);
  const validateDefinition = useCanvasStore((s) => s.validateDefinition);
  const selectCanvas = useCanvasStore((s) => s.selectCanvas);

  const initialJson = useRef(
    canvas?.definition
      ? JSON.stringify(canvas.definition, null, 2)
      : JSON.stringify(EXAMPLE_DEFINITION, null, 2)
  );
  const [name, setName] = useState(canvas?.name ?? "");
  const [description, setDescription] = useState(canvas?.description ?? "");
  const [json, setJson] = useState(initialJson.current);
  const [debouncedJson, setDebouncedJson] = useState(json);
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isBuiltin = canvas?.isBuiltin ?? false;
  // Derive the publish-toggle intent from the current record, not from prop
  // identity. `isNew` flips to false after a successful create before the new
  // `canvas` prop arrives — reading that transient state once sent the wrong
  // isPublished value to the server. For a new canvas (no record yet), treat
  // publish as "make it live".
  const currentlyPublished = !isNew && (canvas?.isPublished ?? false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedJson(json), 300);
    return () => clearTimeout(timer);
  }, [json]);

  const parseError = useMemo(() => {
    try {
      JSON.parse(json);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [json]);

  const dirty = useMemo(() => {
    if (isNew) return name.trim().length > 0;
    if (!canvas) return false;
    return (
      name !== canvas.name ||
      description !== (canvas.description ?? "") ||
      json !== initialJson.current
    );
  }, [isNew, canvas, name, description, json]);

  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(json);
      setJson(JSON.stringify(parsed, null, 2));
    } catch {
      // parseError surfaces the problem
    }
  }, [json]);

  const handleValidate = useCallback(async () => {
    try {
      const parsed = JSON.parse(json);
      setValidating(true);
      const result = await validateDefinition(parsed);
      setValidation(result);
    } catch (e) {
      setValidation({ valid: false, errors: [(e as Error).message] });
    } finally {
      setValidating(false);
    }
  }, [json, validateDefinition]);

  const handleLoadExample = useCallback(() => {
    setJson(JSON.stringify(EXAMPLE_DEFINITION, null, 2));
    setValidation(null);
  }, []);

  const handleSave = useCallback(
    async (publish: boolean) => {
      if (!name.trim()) return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(json);
      } catch {
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        if (isNew) {
          const created = await createDefinition({
            name: name.trim(),
            description: description.trim() || undefined,
            definition: parsed,
            isPublished: publish,
          });
          selectCanvas(created.id);
        } else if (canvas) {
          await updateDefinition(canvas.id, {
            name: name.trim(),
            description: description.trim() || undefined,
            definition: parsed,
            isPublished: publish,
          });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [
      isNew,
      canvas,
      name,
      description,
      json,
      createDefinition,
      updateDefinition,
      selectCanvas,
    ]
  );

  const handleDelete = useCallback(async () => {
    if (!canvas || isBuiltin) return;
    if (!confirm(`Delete "${canvas.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await deleteDefinition(canvas.id);
      selectCanvas(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [canvas, isBuiltin, deleteDefinition, selectCanvas]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">
              {isNew ? "New Canvas" : canvas?.name ?? "Canvas"}
            </h2>
            {!isNew && canvas && (
              <>
                {statusBadge(canvas)}
                {canvas.version != null && (
                  <Badge variant="outline" className="text-[10px]">
                    v{canvas.version}
                  </Badge>
                )}
                <CopyIdChip id={canvas.id} />
              </>
            )}
          </div>
          {!isNew && canvas?.updatedAt && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Updated {formatRelativeShort(canvas.updatedAt)} ago
            </p>
          )}
        </div>
        {dirty && (
          <Badge variant="outline" className="text-[10px]">
            Unsaved
          </Badge>
        )}
      </div>

      <div className="flex gap-4 border-b border-border px-6 py-3">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-canvas"
            className="h-9 font-mono text-sm"
            disabled={isBuiltin}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description..."
            className="h-9 text-sm"
            disabled={isBuiltin}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex w-1/2 min-h-0 flex-col border-r border-border">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Definition
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={handleFormat}
                disabled={isBuiltin}
              >
                <Braces className="mr-1 h-3 w-3" />
                Format
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={handleValidate}
                disabled={validating}
              >
                {validating ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                )}
                Validate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={handleLoadExample}
                disabled={isBuiltin}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                Example
              </Button>
            </div>
          </div>
          <div className="relative flex-1">
            <Textarea
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                setValidation(null);
              }}
              disabled={isBuiltin}
              className="absolute inset-0 resize-none rounded-none border-0 bg-zinc-950 font-mono text-xs leading-relaxed text-zinc-100 focus-visible:ring-0 dark:bg-zinc-950"
              spellCheck={false}
            />
          </div>
          {parseError && (
            <div className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/5 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <p className="text-xs text-destructive">{parseError}</p>
            </div>
          )}
        </div>

        <div className="flex w-1/2 min-h-0 flex-col">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Preview
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <CanvasRenderer json={debouncedJson} />
          </div>
          <CanvasInspector json={debouncedJson} />
        </div>
      </div>

      {validation && (
        <div
          className={cn(
            "flex items-start gap-2 border-t px-6 py-2",
            validation.valid
              ? "border-success/20 bg-success/5"
              : "border-destructive/20 bg-destructive/5"
          )}
        >
          {validation.valid ? (
            <>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p className="text-xs text-success">Definition is valid</p>
            </>
          ) : (
            <>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-0.5">
                {validation.errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive">
                    {err}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {saveError && (
        <div className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/5 px-6 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">{saveError}</p>
        </div>
      )}

      {!isBuiltin && (
        <div className="flex items-center gap-2 border-t border-border px-6 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving || !name.trim() || !!parseError}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : saved ? (
              <Check className="mr-1.5 h-3 w-3" />
            ) : (
              <Save className="mr-1.5 h-3 w-3" />
            )}
            {saved ? "Saved" : "Save Draft"}
          </Button>
          <Button
            size="sm"
            onClick={() => handleSave(!currentlyPublished)}
            disabled={saving || !name.trim() || !!parseError}
          >
            {currentlyPublished ? (
              <>
                <EyeOff className="mr-1.5 h-3 w-3" />
                Unpublish
              </>
            ) : (
              <>
                <Eye className="mr-1.5 h-3 w-3" />
                Publish
              </>
            )}
          </Button>
          <div className="flex-1" />
          {!isNew && canvas && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3 w-3" />
              )}
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
