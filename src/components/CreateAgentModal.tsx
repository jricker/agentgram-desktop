import { useState } from "react";
import { useAgentStore } from "../stores/agentStore";
import { X, Bot, Workflow } from "lucide-react";
import { cn } from "../lib/utils";

export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const { createAgent, selectAgent } = useAgentStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState("worker");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const id = await createAgent({
        displayName: name.trim(),
        description: description.trim() || undefined,
        agentType,
      });
      selectAgent(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  const types = [
    {
      id: "worker",
      label: "Worker",
      desc: "Does tasks when asked",
      icon: Bot,
    },
    {
      id: "orchestrator",
      label: "Orchestrator",
      desc: "Coordinates other agents",
      icon: Workflow,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-[440px] bg-surface border border-border rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-text">Create New Agent</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Scout"
              required
              autoFocus
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Research assistant"
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">
              Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAgentType(t.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                    agentType === t.id
                      ? "border-accent bg-accent-light"
                      : "border-border hover:border-border-strong"
                  )}
                >
                  <t.icon
                    className={cn(
                      "w-5 h-5",
                      agentType === t.id ? "text-accent" : "text-text-muted"
                    )}
                  />
                  <div>
                    <div
                      className={cn(
                        "text-sm font-medium",
                        agentType === t.id ? "text-accent" : "text-text"
                      )}
                    >
                      {t.label}
                    </div>
                    <div className="text-xs text-text-muted">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-sm text-danger bg-danger-light px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Creating..." : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
