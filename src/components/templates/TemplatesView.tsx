import { useEffect, useMemo, useState } from "react";
import {
  FileText,
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
import type { ResponseTemplate } from "../../lib/api";
import { useTemplateStore } from "../../stores/templateStore";
import { TemplateCardPreview } from "../TemplateCardPreview";

const DOCS_URL = "https://github.com/jricker/AgentGram";

function openExternal(url: string) {
  tauriOpen(url).catch(() => window.open(url, "_blank"));
}

export function TemplatesView() {
  const templates = useTemplateStore((s) => s.templates);
  const loading = useTemplateStore((s) => s.loading);
  const loadedAt = useTemplateStore((s) => s.loadedAt);
  const selectedId = useTemplateStore((s) => s.selectedId);
  const fetchTemplates = useTemplateStore((s) => s.fetchTemplates);
  const selectTemplate = useTemplateStore((s) => s.selectTemplate);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (loadedAt === 0) fetchTemplates();
  }, [loadedAt, fetchTemplates]);

  const { owned, builtin } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? templates
      : templates.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.description ?? "").toLowerCase().includes(q) ||
            t.resultType.toLowerCase().includes(q)
        );
    return {
      owned: filtered.filter((t) => !t.isBuiltin),
      builtin: filtered.filter((t) => t.isBuiltin),
    };
  }, [templates, search]);

  const selected = selectedId
    ? templates.find((t) => t.id === selectedId)
    : null;

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
          <h2 className="text-sm font-semibold text-foreground">Templates</h2>
          <span
            className="text-[11px] text-muted-foreground"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {templates.length}
          </span>
        </div>

        <div
          className="px-3 py-2 border-b border-border"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
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
          {loading && templates.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <EmptyList />
          ) : (
            <>
              {owned.length > 0 && (
                <SectionHeader label="Your Templates" count={owned.length} />
              )}
              {owned.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  active={t.id === selectedId}
                  onClick={() => selectTemplate(t.id)}
                />
              ))}
              {builtin.length > 0 && (
                <SectionHeader label="Built-in" count={builtin.length} />
              )}
              {builtin.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  active={t.id === selectedId}
                  onClick={() => selectTemplate(t.id)}
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
            onClick={() => openExternal(`${apiBase}/api/response-templates`)}
            title="Open the raw API endpoint"
          >
            <Code className="w-3.5 h-3.5" />
            API
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openExternal(`${apiBase}/templates`)}
            title="Open the web editor"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Edit on web
          </Button>
        </header>

        {selected ? <TemplateDetail template={selected} /> : <EmptyDetail />}
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

function TemplateRow({
  template,
  active,
  onClick,
}: {
  template: ResponseTemplate;
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
      <FileText className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium font-mono">
            {template.name}
          </p>
          {template.isBuiltin && (
            <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="secondary" className="text-[9px] px-1 py-0">
            {template.resultType}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {template.fields.length} field
            {template.fields.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </button>
  );
}

function TemplateDetail({ template }: { template: ResponseTemplate }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(template.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sample = template.sampleData ?? {};
  const hasSample = Object.keys(sample).length > 0;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge variant="secondary" className="text-[10px] uppercase">
            {template.resultType}
          </Badge>
          {template.isBuiltin && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Lock className="h-2.5 w-2.5" />
              Built-in
            </Badge>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="Copy template ID"
          >
            <span className="font-mono">{template.id.slice(0, 8)}…</span>
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
        <h1 className="text-lg font-semibold font-mono leading-tight">
          {template.name}
        </h1>
        {template.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {template.description}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Updated {formatRelativeShort(template.updatedAt)} ago
        </p>
      </div>

      {/* Preview */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Preview
        </h3>
        {hasSample ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <TemplateCardPreview template={template} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
            No sample data on this template. Edit on web to add sampleData and
            see a preview here.
          </div>
        )}
      </section>

      {/* Fields */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Fields ({template.fields.length})
        </h3>
        <ul className="rounded-lg border border-border divide-y divide-border">
          {template.fields.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-2 px-3 py-2 text-xs"
            >
              <span className="font-mono font-medium">{f.key}</span>
              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                {f.display}
              </Badge>
              {f.label && (
                <span className="text-muted-foreground">· {f.label}</span>
              )}
              {f.format && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground/70">
                  {f.format}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Raw JSON */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Raw JSON
        </h3>
        <pre className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] overflow-x-auto">
          {JSON.stringify(template, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <FileText className="w-12 h-12 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground">Select a template</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Pick a template from the left to see its preview, fields, and raw
        JSON.
      </p>
    </div>
  );
}

function EmptyList() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <FileText className="w-10 h-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">No templates yet</p>
      <p className="text-xs text-muted-foreground mt-1">
        Create one on the web app — it will show up here.
      </p>
    </div>
  );
}
