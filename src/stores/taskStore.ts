import { create } from "zustand";
import { ws } from "../services/websocket";

/**
 * Minimal task store for desktop: drives the LiveSteps indicator and the
 * "live status" override on inline task cards. No fetch/revision APIs — the
 * desktop has no tasks tab yet, so we only carry what the chat thread needs.
 *
 * Web's equivalent maintains a full `tasks: Task[]` list plus CRUD actions;
 * this desktop port omits that. If/when a tasks screen is added, extend
 * this store with `fetchTasks`, `updateTaskStatus`, etc.
 */

export interface TaskProgressInfo {
  currentStep: string;
  recentSteps: string[];
}

export interface TaskLifecycleMeta {
  /** Live status derived from the latest `task_*` event; supersedes the
   * static `taskSnapshot.status` on the message when present. */
  effectiveStatus?: string;
  summary?: string;
  error?: string;
}

interface TaskState {
  taskProgress: Record<string, TaskProgressInfo>;
  taskLifecycleMeta: Record<string, TaskLifecycleMeta>;

  initWsListeners: () => () => void;
}

function extractTaskId(payload: Record<string, unknown>): string | null {
  return (payload.taskId ?? payload.task_id ?? payload.id ?? payload._taskId) as
    | string
    | null;
}

function mergeProgress(
  existing: TaskProgressInfo | undefined,
  currentStep: string
): TaskProgressInfo {
  if (!currentStep) return existing ?? { currentStep: "", recentSteps: [] };
  if (existing?.currentStep === currentStep) return existing;
  const prev = existing?.recentSteps ?? [];
  const recentSteps =
    currentStep && currentStep !== prev[prev.length - 1]
      ? [...prev, currentStep].slice(-8)
      : prev;
  return { currentStep, recentSteps };
}

export const useTaskStore = create<TaskState>((set) => ({
  taskProgress: {},
  taskLifecycleMeta: {},

  initWsListeners: () => {
    const unsubs: (() => void)[] = [];

    // Task lifecycle upserts — set effectiveStatus from the event so a running
    // TaskRequest card flips to complete/failed without needing a new message.
    const handleTaskLifecycle = (payload: Record<string, unknown>) => {
      const taskId = extractTaskId(payload);
      if (!taskId) return;
      const status = payload.status as string | undefined;
      if (!status) return;
      set((s) => ({
        taskLifecycleMeta: {
          ...s.taskLifecycleMeta,
          [taskId]: {
            ...(s.taskLifecycleMeta[taskId] ?? {}),
            effectiveStatus: status,
          },
        },
      }));
    };

    for (const event of [
      "task_created",
      "task_updated",
      "task_assigned",
      "task_completed",
    ]) {
      unsubs.push(ws.on(event, handleTaskLifecycle));
    }

    // Progress events — live step ticker. Server may send the step flat or
    // nested under `progress`; handle both.
    const handleProgress = (payload: Record<string, unknown>) => {
      const taskId = extractTaskId(payload);
      if (!taskId) return;
      const progress =
        (payload.progress as Record<string, unknown> | undefined) ?? payload;
      const currentStep = (progress.current_step ??
        progress.currentStep ??
        "") as string;
      set((s) => {
        const merged = mergeProgress(s.taskProgress[taskId], currentStep);
        if (merged === s.taskProgress[taskId]) return s;
        return {
          taskProgress: { ...s.taskProgress, [taskId]: merged },
        };
      });
    };

    unsubs.push(ws.on("task_progress", handleProgress));
    unsubs.push(ws.on("conv:task_progress", handleProgress));

    return () => unsubs.forEach((u) => u());
  },
}));
