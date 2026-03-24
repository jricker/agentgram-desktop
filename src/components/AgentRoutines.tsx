import { useEffect, useState, useCallback, useMemo } from "react";
import { useAgentStore } from "../stores/agentStore";
import {
  type Routine,
  listRoutines,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  pauseRoutine,
  resumeRoutine,
} from "../lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Timer,
  Plus,
  Pause,
  Play,
  Trash2,
  Pencil,
  Clock,
  AlertTriangle,
} from "lucide-react";

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`,
}));

// Minutes are entered directly as a number input (0-59) for fine-grained control

const DAYS_OF_WEEK = [
  { value: "*", label: "Every day" },
  { value: "1-5", label: "Weekdays (Mon–Fri)" },
  { value: "0,6", label: "Weekends (Sat–Sun)" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

function buildSchedule(
  frequency: string,
  intervalMinutes: number,
  cronMinute: string,
  cronHour: string,
  cronDow: string,
  customCron: string,
): { scheduleType: string; scheduleConfig: Record<string, unknown> } {
  if (frequency === "interval") {
    return { scheduleType: "interval", scheduleConfig: { every_minutes: intervalMinutes } };
  }
  if (frequency === "custom") {
    return { scheduleType: "cron", scheduleConfig: { expression: customCron || "0 * * * *" } };
  }
  // hourly / daily / weekly → build cron expression
  if (frequency === "hourly") {
    return { scheduleType: "cron", scheduleConfig: { expression: `${cronMinute} * * * *` } };
  }
  // daily or weekly
  const expression = `${cronMinute} ${cronHour} * * ${cronDow}`;
  return { scheduleType: "cron", scheduleConfig: { expression } };
}

function describeSchedule(
  frequency: string,
  intervalMinutes: number,
  cronMinute: string,
  cronHour: string,
  cronDow: string,
): string {
  if (frequency === "interval") {
    if (intervalMinutes >= 1440) return `Every ${Math.round(intervalMinutes / 1440)} day(s)`;
    if (intervalMinutes >= 60 && intervalMinutes % 60 === 0) return `Every ${intervalMinutes / 60} hour(s)`;
    return `Every ${intervalMinutes} minute(s)`;
  }
  if (frequency === "custom") return "Custom cron expression";
  const hour = HOURS.find((h) => h.value === cronHour)?.label || `${cronHour}:00`;
  const minute = cronMinute !== "0" ? cronMinute : "";
  const time = minute ? hour.replace(":00", `:${cronMinute.padStart(2, "0")}`) : hour;
  if (frequency === "hourly") return `Every hour at :${cronMinute.padStart(2, "0")}`;
  const day = DAYS_OF_WEEK.find((d) => d.value === cronDow)?.label || "Every day";
  return `${day} at ${time} (UTC)`;
}

interface AgentRoutinesProps {
  agentId: string;
}

function formatSchedule(scheduleType: string, scheduleConfig: Record<string, unknown>): string {
  if (scheduleType === "interval") {
    const minutes = Number(scheduleConfig.minutes || scheduleConfig.interval_minutes || 0);
    if (minutes === 60) return "Every hour";
    if (minutes > 60 && minutes % 60 === 0) return `Every ${minutes / 60} hours`;
    return `Every ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  if (scheduleType === "cron") {
    return String(scheduleConfig.expression || scheduleConfig.cron || "");
  }
  return scheduleType;
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "paused":
      return "secondary";
    case "expired":
    case "disabled":
      return "destructive";
    default:
      return "outline";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-600";
    case "paused":
      return "bg-amber-500";
    case "expired":
    case "disabled":
      return "bg-red-500";
    default:
      return "";
  }
}

export function AgentRoutines({ agentId }: AgentRoutinesProps) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutines = useCallback(async () => {
    try {
      setError(null);
      const { routines: data } = await listRoutines(agentId);
      setRoutines(data || []);
    } catch (e) {
      console.error("Failed to fetch routines:", e);
      setError(e instanceof Error ? e.message : "Failed to load routines");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);

  const handlePauseResume = async (routine: Routine) => {
    try {
      if (routine.status === "active") {
        const { routine: updated } = await pauseRoutine(routine.id);
        setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else if (routine.status === "paused") {
        const { routine: updated } = await resumeRoutine(routine.id);
        setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
    } catch (e) {
      console.error("Failed to toggle routine:", e);
      window.alert(e instanceof Error ? e.message : "Failed to update routine");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRoutine(id);
      setRoutines((prev) => prev.filter((r) => r.id !== id));
      setConfirmDelete(null);
    } catch (e) {
      console.error("Failed to delete routine:", e);
      window.alert(e instanceof Error ? e.message : "Failed to delete routine");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading routines...
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6">
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {routines.length === 0 ? (
        <div className="text-center py-8">
          <Timer className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No routines configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Routines run on a schedule — check status, send reports, perform maintenance.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Routine
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {routines.map((routine) => (
              <div
                key={routine.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{routine.name}</span>
                    <Badge
                      variant={statusVariant(routine.status)}
                      className={`text-[10px] px-1.5 py-0 ${routine.status === "active" ? statusColor(routine.status) : ""}`}
                    >
                      {routine.status}
                    </Badge>
                    {routine.consecutiveFailures > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                        {routine.consecutiveFailures} fail{routine.consecutiveFailures !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatSchedule(routine.scheduleType, routine.scheduleConfig)}
                    </span>
                    {routine.nextRunAt && (
                      <span>Next: {formatDateTime(routine.nextRunAt)}</span>
                    )}
                    <span>Runs: {routine.runCount}{routine.maxRuns ? `/${routine.maxRuns}` : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  {(routine.status === "active" || routine.status === "paused") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handlePauseResume(routine)}
                      title={routine.status === "active" ? "Pause" : "Resume"}
                    >
                      {routine.status === "active" ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditingRoutine(routine)}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {confirmDelete === routine.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleDelete(routine.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(routine.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Routine
          </Button>
        </>
      )}

      {/* Create Routine Dialog */}
      <CreateRoutineDialog
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          fetchRoutines();
        }}
        agentId={agentId}
      />

      {/* Edit Routine Dialog */}
      <EditRoutineDialog
        routine={editingRoutine}
        onClose={() => {
          setEditingRoutine(null);
          fetchRoutines();
        }}
      />
    </div>
  );
}

// --- Create Routine Dialog ---

function CreateRoutineDialog({
  open,
  onClose,
  agentId,
}: {
  open: boolean;
  onClose: () => void;
  agentId: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [frequency, setFrequency] = useState("interval");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [cronMinute, setCronMinute] = useState("0");
  const [cronHour, setCronHour] = useState("8");
  const [cronDow, setCronDow] = useState("*");
  const [customCron, setCustomCron] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [maxRuns, setMaxRuns] = useState("");
  const [responseTemplate, setResponseTemplate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get available templates from the agent's structured_capabilities
  const { agents } = useAgentStore();
  const templateNames = useMemo(() => {
    const managed = Object.values(agents).find((m) => m.agent.id === agentId);
    const templates = managed?.agent.structuredCapabilities?.detail_templates;
    return templates ? Object.keys(templates).sort() : [];
  }, [agents, agentId]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setInstructions("");
    setFrequency("interval");
    setIntervalMinutes(60);
    setCronMinute("0");
    setCronHour("8");
    setCronDow("*");
    setCustomCron("");
    setReportTo("");
    setMaxRuns("");
    setResponseTemplate("");
    setError(null);
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const { scheduleType, scheduleConfig } = buildSchedule(frequency, intervalMinutes, cronMinute, cronHour, cronDow, customCron);

      await createRoutine({
        agent_id: agentId,
        name,
        instructions,
        schedule_type: scheduleType,
        schedule_config: scheduleConfig,
        ...(description ? { description } : {}),
        ...(reportTo ? { report_to: reportTo } : {}),
        ...(maxRuns ? { max_runs: parseInt(maxRuns) } : {}),
        ...(responseTemplate ? { response_template: responseTemplate } : {}),
      });
      resetForm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create routine");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Routine</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily status check"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this routine does..."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Instructions</Label>
            <Textarea
              className="min-h-[120px] font-mono text-sm leading-relaxed resize-y"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Check the status of all pending tasks and send a summary..."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v ?? "interval")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interval">Every X minutes</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="custom">Custom cron</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === "interval" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Run every</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 1)}
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">minutes</span>
              </div>
            </div>
          )}

          {frequency === "hourly" && (
            <div className="space-y-1.5">
              <Label className="text-xs">At minute</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">:</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={cronMinute}
                  onChange={(e) => setCronMinute(String(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))))}
                  className="w-16 text-center"
                />
              </div>
            </div>
          )}

          {(frequency === "daily" || frequency === "weekly") && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Time (UTC)</Label>
                <div className="flex items-center gap-2">
                  <Select value={cronHour} onValueChange={(v) => setCronHour(v ?? "8")}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.map((h) => (
                        <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={cronMinute} onValueChange={(v) => setCronMinute(v ?? "0")}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MINUTES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {frequency === "weekly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Day</Label>
                  <Select value={cronDow} onValueChange={(v) => setCronDow(v ?? "*")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {frequency === "custom" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Cron Expression</Label>
              <Input
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                placeholder="0 8 * * 1-5"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                5-field cron: minute hour day-of-month month day-of-week
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            {describeSchedule(frequency, intervalMinutes, cronMinute, cronHour, cronDow)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Report To (optional)</Label>
              <Input
                value={reportTo}
                onChange={(e) => setReportTo(e.target.value)}
                placeholder="Conversation ID"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Runs (optional)</Label>
              <Input
                type="number"
                min={1}
                value={maxRuns}
                onChange={(e) => setMaxRuns(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>

          {templateNames.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Response Template (optional)</Label>
              <Select value={responseTemplate} onValueChange={(v) => setResponseTemplate(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="No template — plain text output" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {templateNames.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Agent will format output using this template's card layout
              </p>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            onClick={handleCreate}
            disabled={creating || !name || !instructions}
            className="w-full"
          >
            {creating ? "Creating..." : "Create Routine"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Edit Routine Dialog ---

function EditRoutineDialog({
  routine,
  onClose,
}: {
  routine: Routine | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [frequency, setFrequency] = useState("interval");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [cronMinute, setCronMinute] = useState("0");
  const [cronHour, setCronHour] = useState("8");
  const [cronDow, setCronDow] = useState("*");
  const [customCron, setCustomCron] = useState("");
  const [responseTemplate, setResponseTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { agents } = useAgentStore();
  const templateNames = useMemo(() => {
    if (!routine) return [];
    const managed = Object.values(agents).find((m) => m.agent.id === routine.participantId);
    const templates = managed?.agent.structuredCapabilities?.detail_templates;
    return templates ? Object.keys(templates).sort() : [];
  }, [agents, routine?.participantId]);

  useEffect(() => {
    if (routine) {
      setName(routine.name);
      setDescription(routine.description || "");
      setInstructions(routine.instructions);
      setResponseTemplate(routine.responseTemplate || "");
      if (routine.scheduleType === "interval") {
        setFrequency("interval");
        setIntervalMinutes(Number(routine.scheduleConfig.every_minutes || routine.scheduleConfig.minutes || 60));
      } else {
        // Parse cron expression into visual fields
        const expr = String(routine.scheduleConfig.expression || routine.scheduleConfig.cron || "0 8 * * *");
        const parts = expr.split(/\s+/);
        if (parts.length === 5) {
          const [min, hour, , , dow] = parts;
          if (hour === "*" && dow === "*") {
            setFrequency("hourly");
            setCronMinute(min);
          } else if (dow !== "*") {
            setFrequency("weekly");
            setCronMinute(min);
            setCronHour(hour);
            setCronDow(dow);
          } else {
            setFrequency("daily");
            setCronMinute(min);
            setCronHour(hour);
          }
        } else {
          setFrequency("custom");
          setCustomCron(expr);
        }
      }
      setError(null);
    }
  }, [routine]);

  const handleSave = async () => {
    if (!routine) return;
    setSaving(true);
    setError(null);
    try {
      const { scheduleType, scheduleConfig } = buildSchedule(frequency, intervalMinutes, cronMinute, cronHour, cronDow, customCron);

      await updateRoutine(routine.id, {
        name,
        description: description || null,
        instructions,
        schedule_type: scheduleType,
        schedule_config: scheduleConfig,
        response_template: responseTemplate || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save routine");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!routine} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Routine</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this routine does..."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Instructions</Label>
            <Textarea
              className="min-h-[120px] font-mono text-sm leading-relaxed resize-y"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v ?? "interval")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="interval">Every X minutes</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="custom">Custom cron</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === "interval" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Run every</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} value={intervalMinutes} onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 1)} className="w-20" />
                <span className="text-xs text-muted-foreground">minutes</span>
              </div>
            </div>
          )}
          {frequency === "hourly" && (
            <div className="space-y-1.5">
              <Label className="text-xs">At minute</Label>
              <Select value={cronMinute} onValueChange={(v) => setCronMinute(v ?? "0")}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{MINUTES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {(frequency === "daily" || frequency === "weekly") && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Time (UTC)</Label>
                <div className="flex items-center gap-2">
                  <Select value={cronHour} onValueChange={(v) => setCronHour(v ?? "8")}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={cronMinute} onValueChange={(v) => setCronMinute(v ?? "0")}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{MINUTES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {frequency === "weekly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Day</Label>
                  <Select value={cronDow} onValueChange={(v) => setCronDow(v ?? "*")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS_OF_WEEK.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {frequency === "custom" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Cron Expression</Label>
              <Input value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="0 8 * * 1-5" className="font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">5-field cron: minute hour day-of-month month day-of-week</p>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{describeSchedule(frequency, intervalMinutes, cronMinute, cronHour, cronDow)}</p>

          {templateNames.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Response Template</Label>
              <Select value={responseTemplate} onValueChange={(v) => setResponseTemplate(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="No template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {templateNames.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !name || !instructions}
              className="flex-1"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
