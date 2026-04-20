import { useMemo } from "react";

interface Props {
  json: string;
}

export function CanvasInspector({ json }: Props) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [json]);

  const layout = parsed?.layout as Record<string, unknown> | undefined;
  const zones: string[] = Array.isArray(layout?.zones)
    ? (layout.zones as string[])
    : [];
  const widgets = useMemo(
    () =>
      Array.isArray(parsed?.widgets)
        ? (parsed!.widgets as Record<string, unknown>[])
        : [],
    [parsed]
  );
  const composer = parsed?.composer as { mode?: string } | undefined;
  const theme = parsed?.theme as { bgColor?: string } | undefined;

  const typeCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const w of widgets) {
      const t = (w.type as string) ?? "unknown";
      out[t] = (out[t] ?? 0) + 1;
    }
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  }, [widgets]);

  if (!parsed) return null;

  return (
    <div className="space-y-3 border-t border-border bg-card/40 px-3 py-3">
      <section>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Structure
        </h3>
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Zones" value={String(zones.length)} />
          <Stat label="Widgets" value={String(widgets.length)} />
          <Stat label="Composer" value={composer?.mode ?? "—"} />
          <Stat
            label="Theme"
            value={theme?.bgColor ? "custom" : "default"}
          />
        </div>
      </section>

      {typeCounts.length > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Widget Mix
          </h3>
          <div className="flex flex-wrap gap-1">
            {typeCounts.map(([t, n]) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px]"
              >
                <span className="font-mono">{t}</span>
                <span className="text-muted-foreground">×{n}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold font-mono truncate">{value}</p>
    </div>
  );
}
