import { useEffect, useState } from "react";
import { request } from "./api";

export interface AgentTypeOption {
  id: string;
  label: string;
  description: string;
}

const FALLBACK: AgentTypeOption[] = [
  { id: "worker", label: "Worker", description: "Executes tasks independently" },
  { id: "orchestrator", label: "Orchestrator", description: "Delegates and coordinates other agents" },
  { id: "reviewer", label: "Reviewer", description: "Evaluates work and gives feedback" },
  { id: "observer", label: "Observer", description: "Monitors without acting" },
];

let cache: AgentTypeOption[] | null = null;
let pending: Promise<AgentTypeOption[]> | null = null;

export async function getAgentTypes(): Promise<AgentTypeOption[]> {
  if (cache) return cache;
  if (pending) return pending;

  pending = request<{ types: AgentTypeOption[] }>("/api/agent-types")
    .then((res) => {
      cache = res.types;
      return res.types;
    })
    .catch(() => {
      cache = FALLBACK;
      return FALLBACK;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

export function resetAgentTypesCache(): void {
  cache = null;
  pending = null;
}

export function useAgentTypes(): AgentTypeOption[] {
  const [types, setTypes] = useState<AgentTypeOption[]>(cache ?? FALLBACK);

  useEffect(() => {
    if (cache && cache !== types) {
      setTypes(cache);
      return;
    }
    if (cache) return;
    getAgentTypes().then(setTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return types;
}
