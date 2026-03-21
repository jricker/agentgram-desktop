const DEFAULT_API_URL = "https://agentchat-backend.fly.dev";

function getApiUrl(): string {
  return localStorage.getItem("apiUrl") || DEFAULT_API_URL;
}

function getToken(): string | null {
  return localStorage.getItem("authToken");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("participant");
    window.dispatchEvent(new Event("auth:expired"));
    throw new Error("Authentication expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// Auth
export async function login(
  email: string,
  password: string
): Promise<{ token: string; participant: Participant }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function signup(
  email: string,
  password: string,
  displayName?: string
): Promise<{ token: string; participant: Participant }> {
  return request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

// Agents
export async function listAgents(): Promise<{ agents: Agent[] }> {
  return request("/api/agents");
}

export async function getAgent(id: string): Promise<Agent> {
  return request(`/api/agents/${id}`);
}

export async function createAgent(data: {
  displayName: string;
  description?: string;
  agentType?: string;
  modelConfig?: Record<string, unknown>;
}): Promise<{ agent: Agent; apiKey: string }> {
  // Backend returns flat: { id, displayName, ..., apiKey }
  const resp = await request<Agent & { apiKey: string }>("/api/agents", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const { apiKey, ...agentFields } = resp;
  return { agent: agentFields as Agent, apiKey };
}

export async function updateAgent(
  id: string,
  data: Record<string, unknown>
): Promise<{ agent: Agent }> {
  return request(`/api/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  await request(`/api/agents/${id}`, { method: "DELETE" });
}

export async function regenerateApiKey(
  id: string
): Promise<{ agent: Agent; apiKey: string }> {
  // Backend returns flat: { id, displayName, ..., apiKey }
  const data = await request<Agent & { apiKey: string }>(`/api/agents/${id}/regenerate-key`, { method: "POST" });
  const { apiKey, ...agentFields } = data;
  return { agent: agentFields as Agent, apiKey };
}

export async function updateModelConfig(
  id: string,
  config: Record<string, unknown>
): Promise<void> {
  await request(`/api/agents/${id}/model-config`, {
    method: "PATCH",
    body: JSON.stringify({ model_config: config }),
  });
}

export async function updateSoulMd(
  id: string,
  soulMd: string
): Promise<void> {
  await request(`/api/agents/${id}/soul`, {
    method: "PATCH",
    body: JSON.stringify({ soul_md: soulMd }),
  });
}

// Health
export async function getAgentHealth(): Promise<{ agents: AgentHealth[] }> {
  return request("/api/agents/health");
}

export async function getAgentHealthDetail(
  id: string
): Promise<AgentHealthDetail> {
  return request(`/api/agents/${id}/health`);
}

// Invites
export async function getInviteInfo(
  code: string
): Promise<InviteInfo> {
  return request(`/api/invites/${code}/info`);
}

export async function claimInvite(
  code: string
): Promise<{ agent: Agent; apiKey: string; agentId: string; gatewayUrl: string }> {
  return request(`/api/invites/${code}/claim`, { method: "POST" });
}

// Skills
export async function listSkills(): Promise<{ skills: Skill[] }> {
  return request("/api/skills");
}

export async function getAgentSkills(agentId: string): Promise<{ skills: Skill[] }> {
  return request(`/api/agents/${agentId}/skills`);
}

export async function createSkill(data: {
  name: string;
  description: string;
  displayName: string;
  promptContent: string;
  scope?: string;
  category?: string;
  tags?: string[];
  alwaysInject?: boolean;
  priority?: number;
  activationRules?: Record<string, unknown>;
}): Promise<{ skill: Skill }> {
  return request("/api/skills", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSkill(
  id: string,
  data: Record<string, unknown>
): Promise<{ skill: Skill }> {
  return request(`/api/skills/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteSkill(id: string): Promise<void> {
  await request(`/api/skills/${id}`, { method: "DELETE" });
}

export async function assignSkill(
  skillId: string,
  agentId: string
): Promise<{ assignment: SkillAssignment }> {
  return request(`/api/skills/${skillId}/assign`, {
    method: "POST",
    body: JSON.stringify({ agentId }),
  });
}

export async function unassignSkill(
  skillId: string,
  agentId: string
): Promise<void> {
  await request(`/api/skills/${skillId}/assign/${agentId}`, {
    method: "DELETE",
  });
}

export async function toggleSkillAssignment(
  assignmentId: string,
  enabled: boolean
): Promise<{ assignment: SkillAssignment }> {
  return request(`/api/skills/assignments/${assignmentId}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function importSkill(data: {
  url?: string;
  content?: string;
  sourceUrl?: string;
}): Promise<{ skill: Skill }> {
  return request("/api/skills/import", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Response Templates
export async function listResponseTemplates(): Promise<{ templates: ResponseTemplate[] }> {
  return request("/api/response-templates");
}

// Types
export interface Skill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  scope: "global" | "owner" | "agent";
  ownerId?: string;
  promptContent: string;
  alwaysInject: boolean;
  license?: string;
  compatibility?: string;
  skillMetadata?: Record<string, unknown>;
  category?: string;
  tags?: string[];
  priority: number;
  activationRules?: Record<string, unknown>;
  sourceUrl?: string;
  importedAt?: string;
  version: number;
  enabled: boolean;
  insertedAt: string;
  updatedAt: string;
}

export interface SkillAssignment {
  id: string;
  skillId: string;
  agentId: string;
  sourceAgentId?: string;
  enabled: boolean;
  configOverrides?: Record<string, unknown>;
  skill?: Skill;
  insertedAt: string;
  updatedAt: string;
}

export interface Participant {
  id: string;
  displayName: string;
  email?: string;
  type: "human" | "agent";
  avatarUrl?: string;
}

export interface DetailField {
  key: string;
  label?: string;
  display: "row" | "chip" | "highlight";
  icon?: string;
  color?: string;
  format?: string;
  hidden?: boolean;
}

export interface ResponseTemplate {
  id: string;
  ownerId?: string;
  name: string;
  description?: string;
  resultType: string;
  fields: DetailField[];
  sampleData?: Record<string, unknown>;
  flowTemplate?: Record<string, unknown>;
  isBuiltin: boolean;
  insertedAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  displayName: string;
  description?: string;
  status: string;
  agentType?: string;
  avatarUrl?: string;
  capabilities?: string[];
  structuredCapabilities?: {
    detail_templates?: Record<string, DetailField[]>;
    tools?: Array<{ name: string; description?: string }>;
    [key: string]: unknown;
  };
  modelConfig?: Record<string, unknown>;
  online?: boolean;
  metadata?: Record<string, unknown>;
  soulMd?: string;
}

export interface AgentHealth {
  agentId: string;
  displayName: string;
  avatarUrl?: string;
  healthStatus: "healthy" | "degraded" | "stuck" | "offline";
  executorCount: number;
  onlineExecutorCount: number;
  stuckCount: number;
  queuedTasks: number;
  queuedMessages: number;
}

export interface AgentHealthDetail extends AgentHealth {
  executors: Array<{
    id: string;
    executorKey: string;
    status: string;
    lastPollAt?: string;
    activeTaskCount: number;
  }>;
  stuckTasks: unknown[];
  unackedMessages: unknown[];
}

export interface InviteInfo {
  displayName: string;
  description?: string;
  capabilities?: string[];
  creator?: { displayName: string };
}
