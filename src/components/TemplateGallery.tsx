import { useEffect, useState, useCallback } from "react";
import { type ResponseTemplate, listResponseTemplates } from "../lib/api";
import { TemplateCardPreview } from "./TemplateCardPreview";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  LayoutTemplate,
  Search,
  Lock,
  X,
} from "lucide-react";

interface Props {
  onClose: () => void;
}

export function TemplateGallery({ onClose }: Props) {
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const { templates: list } = await listResponseTemplates();
      setTemplates(list || []);
    } catch (e) {
      console.error("Failed to fetch templates:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const resultTypes = [...new Set(templates.map(t => t.resultType))].sort();

  const filtered = templates.filter(t => {
    if (filterType && t.resultType !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.name.includes(q) || (t.description || "").toLowerCase().includes(q) || t.resultType.includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading templates...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <LayoutTemplate className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Template Gallery</h2>
            <p className="text-xs text-muted-foreground">
              {templates.length} templates — preview with sample data
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-5 py-3 border-b">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex gap-1">
          <Badge
            variant={filterType === null ? "default" : "outline"}
            className="cursor-pointer text-[10px]"
            onClick={() => setFilterType(null)}
          >
            All
          </Badge>
          {resultTypes.map(type => (
            <Badge
              key={type}
              variant={filterType === type ? "default" : "outline"}
              className="cursor-pointer text-[10px]"
              onClick={() => setFilterType(filterType === type ? null : type)}
            >
              {type}
            </Badge>
          ))}
        </div>
      </div>

      {/* Gallery grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No templates match your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {filtered.map(template => (
              <div key={template.id} className="space-y-2">
                {/* Template metadata */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold font-mono">{template.name}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{template.resultType}</Badge>
                  {template.isBuiltin && <Lock className="w-3 h-3 text-muted-foreground" />}
                </div>
                {template.description && (
                  <p className="text-[11px] text-muted-foreground">{template.description}</p>
                )}

                {/* Card preview */}
                <TemplateCardPreview template={template} />

                {/* Field list */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {template.fields.map(f => (
                    <Badge key={f.key} variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
                      {f.key}
                      <span className="text-muted-foreground ml-1">({f.display})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
