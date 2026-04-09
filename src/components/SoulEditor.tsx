import { useState, useEffect, useCallback } from "react";
import { useAgentStore } from "../stores/agentStore";
import { updateSoulMd, revertSoulMd } from "../lib/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, Link, RotateCcw, Loader2 } from "lucide-react";

interface SoulEditorProps {
  agentId: string;
}

export function SoulEditor({ agentId }: SoulEditorProps) {
  const agent = useAgentStore((s) => s.agents[agentId]?.agent);
  const refreshAgent = useAgentStore((s) => s.selectAgent);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClone = !!agent?.soulMdSourceName;
  const isInherited = !!agent?.soulMdInherited;

  useEffect(() => {
    if (agent?.soulMd != null) {
      setContent(agent.soulMd);
      setDirty(false);
    }
  }, [agent?.soulMd]);

  const handleChange = (value: string) => {
    setContent(value);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateSoulMd(agentId, content);
      await refreshAgent(agentId);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = useCallback(async () => {
    setReverting(true);
    setError(null);
    try {
      await revertSoulMd(agentId);
      await refreshAgent(agentId);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revert");
    } finally {
      setReverting(false);
    }
  }, [agentId, refreshAgent]);

  return (
    <div className="flex flex-col h-full p-4 gap-2">
      {isClone && (
        <div
          className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs ${
            isInherited
              ? "border-blue-500/30 bg-blue-500/5 text-blue-200"
              : "border-amber-500/30 bg-amber-500/5 text-amber-200"
          }`}
        >
          <Link className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-1">
            {isInherited ? (
              <p>
                This soul is inherited from{" "}
                <span className="font-medium">{agent.soulMdSourceName}</span>.
                Editing it will create a local copy that no longer syncs with the
                source.
              </p>
            ) : (
              <>
                <p>
                  This soul was customized and no longer inherits from{" "}
                  <span className="font-medium">{agent.soulMdSourceName}</span>.
                </p>
                <button
                  onClick={handleRevert}
                  disabled={reverting}
                  className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-100 transition-colors"
                >
                  {reverting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Revert to source soul
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <Textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Agent soul.md content..."
        className="flex-1 font-mono text-sm resize-none"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
