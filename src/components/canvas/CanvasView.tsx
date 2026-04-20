import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Lock,
  Search,
  BookOpen,
  Code,
  Copy,
  Check,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { open as tauriOpen } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeShort } from "../../lib/utils";
import { getApiUrl } from "../../lib/api";
import type { CanvasDefinitionSummary } from "../../lib/api";
import { useCanvasStore } from "../../stores/canvasStore";

const DOCS_URL = "https://github.com/jricker/AgentGram";

function openExternal(url: string) {
  tauriOpen(url).catch(() => window.open(url, "_blank"));
}

export function CanvasView() {
  const definitions = useCanvasStore((s) => s.definitions);
  const loading = useCanvasStore((s) => s.loading);
  const loadedAt = useCanvasStore((s) => s.loadedAt);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const details = useCanvasStore((s) => s.details);
  const detailLoading = useCanvasStore((s) => s.detailLoading);
  const fetchDefinitions = useCanvasStore((s) => s.fetchDefinitions);
  const selectCanvas = useCanvasStore((s) => s.selectCanvas);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (loadedAt === 0) fetchDefinitions();
  }, [loadedAt, fetchDefinitions]);

  const { owned, builtin } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? definitions
      : definitions.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            (d.description ?? "").toLowerCase().includes(q)
        );
    return {
      owned: filtered.filter((d) => !d.isBuiltin),
      builtin: filtered.filter((d) => d.isBuiltin),
    };
  }, [definitions, search]);

  const selectedSummary = selectedId
    ? definitions.find((d) => d.id === selectedId)
    : null;
  const selectedDetail = selectedId ? details[selectedId] : undefined;
  const selectedLoading = selectedId ? detailLoading[selectedId] : false;

  const apiBase = getApiUrl();

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <aside
        className="w-80 shrink-0 flex flex-col border-r border-border bg-card"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div
          className="px-4 py-3 border-b border-border flex items-center justify-between"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <h2 className="text-sm font-semibold text-foreground">Canvases</h2>
          <span
            className="text-[11px] text-muted-foreground"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {definitions.length}
          </span>
        </div>

        <div
          className="px-3 py-2 border-b border-border"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search canvases..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {loading && definitions.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : definitions.length === 0 ? (
            <EmptyList />
          ) : (
            <>
              {owned.length > 0 && (
                <SectionHeader label="Your Canvases" count={owned.length} />
              )}
              {owned.map((d) => (
                <CanvasRow
                  key={d.id}
                  canvas={d}
                  active={d.id === selectedId}
                  onClick={() => selectCanvas(d.id)}
                />
              ))}
              {builtin.length > 0 && (
                <SectionHeader label="Built-in" count={builtin.length} />
              )}
              {builtin.map((d) => (
                <CanvasRow
                  key={d.id}
                  canvas={d}
                  active={d.id === selectedId}
                  onClick={() => selectCanvas(d.id)}
                />
              ))}
            </>
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col bg-background overflow-hidden">
        <header className="px-6 py-3 border-b border-border bg-card flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openExternal(DOCS_URL)}
            title="Open documentation"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Docs
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openExternal(`${apiBase}/api/canvas-definitions`)}
            title="Open the raw API endpoint"
          >
            <Code className="w-3.5 h-3.5" />
            API
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openExternal(`${apiBase}/canvas`)}
            title="Open the web editor"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Edit on web
          </Button>
        </header>

        {selectedSummary ? (
          <CanvasDetail
            summary={selectedSummary}
            detail={selectedDetail}
            loading={selectedLoading ?? false}
          />
        ) : (
          <EmptyDetail />
        )}
      </section>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 pb-1 pt-3 flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground/60">{count}</span>
    </div>
  );
}

function CanvasRow({
  canvas,
  active,
  onClick,
}: {
  canvas: CanvasDefinitionSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors border-b border-border",
        active ? "bg-primary/5" : "hover:bg-muted/50"
      )}
    >
      <LayoutDashboard className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{canvas.name}</p>
          {canvas.isBuiltin && (
            <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge
            variant="secondary"
            className={cn(
              "text-[9px] px-1 py-0",
              canvas.isPublished && !canvas.isBuiltin
                ? "bg-success/10 text-success border-success/30"
                : ""
            )}
          >
            {canvas.isBuiltin
              ? "Built-in"
              : canvas.isPublished
              ? "Published"
              : "Draft"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            v{canvas.version}
          </span>
        </div>
      </div>
    </button>
  );
}

interface CanvasJsonDefinition {
  layout?: { zones?: string[] };
  widgets?: Array<{ id?: string; type?: string; zone?: string; props?: Record<string, unknown> }>;
  theme?: Record<string, unknown>;
}

function CanvasDetail({
  summary,
  detail,
  loading,
}: {
  summary: CanvasDefinitionSummary;
  detail?: CanvasDefinitionSummary;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(summary.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const definition = (detail?.definition as CanvasJsonDefinition | undefined) ?? undefined;
  const zones = definition?.layout?.zones ?? [];
  const widgets = definition?.widgets ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px]",
              summary.isPublished && !summary.isBuiltin
                ? "bg-success/10 text-success border-success/30"
                : ""
            )}
          >
            {summary.isBuiltin
              ? "Built-in"
              : summary.isPublished
              ? "Published"
              : "Draft"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            v{summary.version}
          </Badge>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="Copy canvas ID"
          >
            <span className="font-mono">{summary.id.slice(0, 8)}…</span>
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
        <h1 className="text-lg font-semibold leading-tight">{summary.name}</h1>
        {summary.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.description}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Updated {formatRelativeShort(summary.updatedAt)} ago
        </p>
      </div>

      {/* Loading the full definition */}
      {loading && !definition && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading definition…
        </div>
      )}

      {/* Structure overview */}
      {definition && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Structure
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Stat label="Zones" value={String(zones.length)} />
            <Stat label="Widgets" value={String(widgets.length)} />
          </div>
        </section>
      )}

      {/* Zones & widgets preview */}
      {definition && zones.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Preview
          </h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {zones.map((zone) => {
              const zoneWidgets = widgets.filter((w) => w.zone === zone);
              return (
                <div
                  key={zone}
                  className="border-b border-border last:border-b-0 p-3"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {zone}
                  </div>
                  {zoneWidgets.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/60 p-3 text-[11px] text-muted-foreground/60">
                      No widgets
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {zoneWidgets.map((w, i) => (
                        <WidgetPreview key={w.id ?? i} widget={w} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Raw JSON */}
      {definition && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Definition JSON
          </h3>
          <pre className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] overflow-x-auto max-h-[500px]">
            {JSON.stringify(definition, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function WidgetPreview({
  widget,
}: {
  widget: { type?: string; props?: Record<string, unknown> };
}) {
  const type = widget.type ?? "unknown";
  const props = widget.props ?? {};
  const text = (props.text ?? props.label ?? props.title) as string | undefined;

  return (
    <div className="rounded-md border border-border/60 bg-background p-2 flex items-center gap-2 text-xs">
      <Badge variant="secondary" className="text-[9px] px-1 py-0 font-mono">
        {type}
      </Badge>
      {text && <span className="truncate text-muted-foreground">{text}</span>}
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <LayoutDashboard className="w-12 h-12 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground">Select a canvas</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Pick one from the left to see its zones, widgets, and raw definition.
      </p>
    </div>
  );
}

function EmptyList() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <LayoutDashboard className="w-10 h-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">No canvases yet</p>
      <p className="text-xs text-muted-foreground mt-1">
        Create one on the web app — it will show up here.
      </p>
    </div>
  );
}
