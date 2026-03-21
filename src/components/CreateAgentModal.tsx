import { useState } from "react";
import { useAgentStore } from "../stores/agentStore";
import { Bot, Workflow } from "lucide-react";
import { cn } from "../lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Scout"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-desc">Description</Label>
            <Input
              id="agent-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Research assistant"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
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
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create Agent"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
