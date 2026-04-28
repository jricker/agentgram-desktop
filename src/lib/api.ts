const DEFAULT_API_URL = "https://agentchat-backend.fly.dev";

export function getApiUrl(): string {
  return localStorage.getItem("apiUrl") || DEFAULT_API_URL;
}

function getToken(): string | null {
  return localStorage.getItem("authToken");
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  _attempt = 0
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

  // Retry on 429 with exponential backoff (up to 3 attempts)
  if (res.status === 429 && _attempt < 3) {
    const delay = Math.min(1000 * Math.pow(2, _attempt), 8000);
    await new Promise((r) => setTimeout(r, delay));
    return request<T>(path, options, _attempt + 1);
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

// Profile
export async function getProfile(): Promise<Participant> {
  return request("/api/me");
}

export async function updateProfile(data: {
  displayName?: string;
}): Promise<{ participant: Participant }> {
  return request("/api/me", {
    method: "PATCH",
    body: JSON.stringify(data),
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

export async function deleteAgentPermanently(
  id: string,
  confirmName: string
): Promise<void> {
  await request(`/api/agents/${id}/delete-permanent`, {
    method: "POST",
    body: JSON.stringify({ confirmName }),
  });
}

// Connections
export async function listConnections(): Promise<{ connections: Connection[] }> {
  return request("/api/connections");
}

export async function revokeConnection(id: string): Promise<void> {
  await request(`/api/connections/${id}`, { method: "DELETE" });
}

export interface Connection {
  id: string;
  requesterId: string;
  agentId: string;
  ownerId: string;
  status: string;
  requesterName?: string;
  agentName?: string;
  insertedAt: string;
}

export async function presignAvatarUpload(
  filename: string,
  contentType: string,
  fileSize?: number
): Promise<{ url: string; publicUrl: string }> {
  return request("/api/storage/presign", {
    method: "POST",
    body: JSON.stringify({ filename, contentType, fileSize }),
  });
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

export async function revertSoulMd(id: string): Promise<Agent> {
  return request<Agent>(`/api/agents/${id}/soul/revert`, { method: "POST" });
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

export async function forceResetAgent(
  id: string
): Promise<{ message: string; disabledExecutors: number; unclaimedTasks: number; unclaimedMessages: number }> {
  return request(`/api/agents/${id}/health/reset`, { method: "POST" });
}

export async function clearAgentMessages(
  id: string
): Promise<{ message: string; expired: number; unclaimed: number }> {
  return request(`/api/agents/${id}/health/clear-messages`, { method: "POST" });
}

export async function clearAgentTasks(
  id: string
): Promise<{ message: string; expired: number; unclaimed: number }> {
  return request(`/api/agents/${id}/health/clear-tasks`, { method: "POST" });
}

export async function killExecutor(
  agentId: string,
  executorId: string
): Promise<{ message: string }> {
  return request(`/api/agents/${agentId}/executors/${executorId}/kill`, { method: "POST" });
}

export async function unstickAgent(id: string): Promise<{ message: string; executorsReset: number; tasksExpired: number; messagesExpired: number }> {
  return request(`/api/agents/${id}/health/unstick`, { method: "POST" });
}

export async function markAgentOffline(id: string): Promise<{ message: string }> {
  return request(`/api/agents/${id}/health/offline`, { method: "POST" });
}

// Heartbeat Mind
export interface HeartbeatConfig {
  enabled?: boolean;
  intervalMinutes?: number;
  activeHours?: { start: number; end: number };
  timezone?: string;
  model?: string | null;
  status?: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  runCount?: number;
  consecutiveFailures?: number;
}

export interface HeartbeatData {
  heartbeatMd: string | null;
  heartbeatConfig: HeartbeatConfig | null;
}

export async function getAgentHeartbeat(id: string): Promise<HeartbeatData> {
  return request(`/api/agents/${id}/heartbeat`);
}

export async function updateAgentHeartbeat(
  id: string,
  data: { heartbeat_md?: string; interval_minutes?: number; active_hours?: { start: number; end: number }; timezone?: string; model?: string | null }
): Promise<HeartbeatData> {
  return request(`/api/agents/${id}/heartbeat`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function enableAgentHeartbeat(id: string): Promise<{ heartbeatConfig: HeartbeatConfig }> {
  return request(`/api/agents/${id}/heartbeat/enable`, { method: "POST" });
}

export async function disableAgentHeartbeat(id: string): Promise<{ heartbeatConfig: HeartbeatConfig }> {
  return request(`/api/agents/${id}/heartbeat/disable`, { method: "POST" });
}

export async function triggerAgentHeartbeat(id: string): Promise<{ message: string }> {
  return request(`/api/agents/${id}/heartbeat/trigger`, { method: "POST" });
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
  visibility?: "private" | "public" | "unlisted";
  authorName?: string;
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

// Skill Marketplace
export async function browseMarketplace(params?: {
  search?: string;
  category?: string;
  tags?: string;
  sort?: "rating" | "installs" | "recent";
  limit?: number;
}): Promise<{ skills: Skill[] }> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.category) query.set("category", params.category);
  if (params?.tags) query.set("tags", params.tags);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request(`/api/skills/marketplace${qs ? `?${qs}` : ""}`);
}

export async function getMarketplaceSkill(
  id: string
): Promise<{ skill: Skill; ratings: SkillRating[] }> {
  return request(`/api/skills/marketplace/${id}`);
}

export async function installMarketplaceSkill(
  id: string
): Promise<{ skill: Skill }> {
  return request(`/api/skills/marketplace/${id}/install`, { method: "POST" });
}

export async function rateMarketplaceSkill(
  id: string,
  score: number,
  review?: string
): Promise<{ rating: SkillRating }> {
  return request(`/api/skills/marketplace/${id}/rate`, {
    method: "POST",
    body: JSON.stringify({ score, review }),
  });
}

// Routines
export async function listRoutines(agentId?: string): Promise<{ routines: Routine[] }> {
  const params = agentId ? `?agent_id=${agentId}` : "";
  return request(`/api/routines${params}`);
}

export async function createRoutine(data: {
  agent_id: string;
  name: string;
  instructions: string;
  schedule_type: string;
  schedule_config: Record<string, unknown>;
  description?: string;
  report_to?: string;
  max_runs?: number;
}): Promise<{ routine: Routine }> {
  return request("/api/routines", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRoutine(id: string, data: Record<string, unknown>): Promise<{ routine: Routine }> {
  return request(`/api/routines/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteRoutine(id: string): Promise<void> {
  await request(`/api/routines/${id}`, { method: "DELETE" });
}

export async function pauseRoutine(id: string): Promise<{ routine: Routine }> {
  return request(`/api/routines/${id}/pause`, { method: "POST" });
}

export async function resumeRoutine(id: string): Promise<{ routine: Routine }> {
  return request(`/api/routines/${id}/resume`, { method: "POST" });
}

// Connected Accounts / Integrations
export interface UserCredential {
  id: string;
  provider: string;
  credentialType: "oauth2" | "api_token";
  status: "active" | "expired" | "revoked" | "refresh_failed";
  scopes: string[];
  providerUid?: string;
  lastUsedAt?: string;
  tokenExpiresAt?: string;
  insertedAt: string;
  updatedAt: string;
}

export interface ProviderInfo {
  name: string;
  type: "oauth2" | "api_token";
  displayName: string;
  description?: string;
  scopes?: string[];
}

export async function listCredentials(): Promise<{ credentials: UserCredential[] }> {
  return request("/api/integrations");
}

export async function listProviders(): Promise<{ providers: ProviderInfo[] }> {
  return request("/api/integrations/providers");
}

export async function authorizeProvider(provider: string): Promise<{ authorizeUrl: string }> {
  return request(`/api/integrations/${provider}/authorize`);
}

export async function storeProviderToken(provider: string, token: string): Promise<{ credential: UserCredential }> {
  return request(`/api/integrations/${provider}/token`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function disconnectProvider(provider: string): Promise<void> {
  await request(`/api/integrations/${provider}`, { method: "DELETE" });
}

export async function getProviderStatus(provider: string): Promise<{
  connected: boolean;
  provider: string;
  status?: string;
  lastUsedAt?: string;
}> {
  return request(`/api/integrations/${provider}/status`);
}

// Annotations
export async function listAnnotations(params?: {
  topic?: string;
  limit?: number;
}): Promise<{ annotations: Annotation[] }> {
  const query = new URLSearchParams();
  if (params?.topic) query.set("topic", params.topic);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request(`/api/annotations${qs ? `?${qs}` : ""}`);
}

export async function listAnnotationTopics(): Promise<{ topics: string[] }> {
  return request("/api/annotations/topics");
}

export async function createAnnotation(data: {
  topic: string;
  content: string;
  source?: string;
}): Promise<{ annotation: Annotation }> {
  return request("/api/annotations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteAnnotation(id: string): Promise<void> {
  await request(`/api/annotations/${id}`, { method: "DELETE" });
}

// Response Templates
export async function listResponseTemplates(): Promise<{ templates: ResponseTemplate[] }> {
  return request("/api/response-templates");
}

export async function createResponseTemplate(
  attrs: Partial<ResponseTemplate>
): Promise<{ template: ResponseTemplate }> {
  return request("/api/response-templates", {
    method: "POST",
    body: JSON.stringify(attrs),
  });
}

export async function updateResponseTemplate(
  id: string,
  attrs: Partial<ResponseTemplate>
): Promise<{ template: ResponseTemplate }> {
  return request(`/api/response-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(attrs),
  });
}

export async function deleteResponseTemplate(id: string): Promise<void> {
  await request(`/api/response-templates/${id}`, { method: "DELETE" });
}

export async function previewResponseTemplate(
  attrs: Partial<ResponseTemplate>
): Promise<{ html: string; css: string; valid: boolean; errors: string[] }> {
  return request("/api/response-templates/preview", {
    method: "POST",
    body: JSON.stringify(attrs),
  });
}

// Canvas Definitions
export async function listCanvasDefinitions(): Promise<{ definitions: CanvasDefinitionSummary[] }> {
  return request("/api/canvas-definitions");
}

export async function getCanvasDefinition(id: string): Promise<CanvasDefinitionSummary> {
  // Backend wraps the record as `{ definition: <record> }` — unwrap here so
  // callers get the same shape as entries in `listCanvasDefinitions()`, with
  // the inner JSON body reachable as `.definition`.
  const { definition } = await request<{ definition: CanvasDefinitionSummary }>(
    `/api/canvas-definitions/${id}`
  );
  return definition;
}

export async function createCanvasDefinition(attrs: {
  name: string;
  description?: string;
  definition: Record<string, unknown>;
  isPublished?: boolean;
}): Promise<{ definition: CanvasDefinitionSummary }> {
  return request("/api/canvas-definitions", {
    method: "POST",
    body: JSON.stringify(attrs),
  });
}

export async function updateCanvasDefinition(
  id: string,
  attrs: Partial<{
    name: string;
    description: string;
    definition: Record<string, unknown>;
    isPublished: boolean;
  }>
): Promise<{ definition: CanvasDefinitionSummary }> {
  return request(`/api/canvas-definitions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(attrs),
  });
}

export async function deleteCanvasDefinition(id: string): Promise<void> {
  await request(`/api/canvas-definitions/${id}`, { method: "DELETE" });
}

export async function validateCanvasDefinition(
  definition: Record<string, unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  return request("/api/canvas-definitions/validate", {
    method: "POST",
    body: JSON.stringify({ definition }),
  });
}

// Types

export interface CanvasDefinitionSummary {
  id: string;
  ownerId?: string;
  name: string;
  description?: string;
  version: number;
  isBuiltin: boolean;
  isPublished: boolean;
  insertedAt: string;
  updatedAt: string;
  /** Full JSON definition — only populated on `getCanvasDefinition(id)`,
   *  omitted from the list endpoint's payload. */
  definition?: Record<string, unknown>;
}
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
  // Marketplace fields
  visibility?: "private" | "public" | "unlisted";
  installCount?: number;
  ratingAvg?: number;
  ratingCount?: number;
  authorName?: string;
  insertedAt: string;
  updatedAt: string;
}

export interface SkillRating {
  id: string;
  skillId: string;
  raterId: string;
  raterName?: string;
  score: number;
  review?: string;
  insertedAt: string;
  updatedAt: string;
}

export interface Annotation {
  id: string;
  agentId: string;
  ownerId: string;
  agentName?: string;
  topic: string;
  content: string;
  source: string;
  sourceTaskId?: string;
  metadata?: Record<string, unknown>;
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
  online?: boolean;
  timezone?: string;
}

// --- Messaging types + endpoints ---

export interface MessageSender {
  id: string;
  type: "human" | "agent";
  displayName: string;
  avatarUrl?: string;
}

export interface TaskSnapshot {
  id?: string;
  status?: string;
  title?: string;
}

export interface MessageContentStructured {
  /** Structured payload — servers send as `data` or `payload` depending on
   *  the message type. `getMessagePayload` helper normalizes both. */
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  result_type?: string;
  items?: unknown[];
}

export interface FileAttachment {
  id: string;
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
  downloadUrl?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender?: MessageSender;
  content: string;
  contentType?: string;
  messageType?: string;
  metadata?: Record<string, unknown>;
  contentStructured?: MessageContentStructured;
  taskSnapshot?: TaskSnapshot;
  parentMessageId?: string;
  fileAttachments?: FileAttachment[];
  insertedAt: string;
  updatedAt: string;
  pending?: boolean;
  nonce?: string;
}

/** Normalize `contentStructured.data` / `.payload` into a single accessor. */
export function getMessagePayload<T = Record<string, unknown>>(
  message: Message
): T {
  return (message.contentStructured?.data ??
    message.contentStructured?.payload ??
    {}) as T;
}

// --- Tasks ---

export type TaskStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "blocked"
  | "complete"
  | "cancelled"
  | "exhausted";

export interface Task {
  id: string;
  conversationId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdBy?: string;
  assignedTo: string[];
  assignees?: Participant[];
  dependsOn?: string[];
  deadline?: string;
  metadata?: Record<string, unknown>;
  completionDetails?: Record<string, unknown>;
  resultData?: Record<string, unknown>;
  creator?: Participant;
  insertedAt: string;
  updatedAt: string;
}

export async function fetchTasksRest(
  status?: TaskStatus
): Promise<{ tasks: Task[] }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await request<Task[] | { tasks: Task[] }>(`/api/tasks${qs}`);
  return Array.isArray(data) ? { tasks: data } : data;
}

export async function updateTaskStatusRest(
  taskId: string,
  status: TaskStatus
): Promise<Task> {
  return request(`/api/tasks/${taskId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function requestTaskRevisionRest(
  taskId: string,
  feedback: string
): Promise<Task> {
  return request(`/api/tasks/${taskId}/revision`, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });
}

// --- Streaming ---

export type StreamPhase =
  | "thinking"
  | "tool_call"
  | "writing"
  | "analyzing"
  | "queued"
  | "waiting";

export interface ActiveStream {
  streamId: string;
  senderId: string;
  senderName: string;
  content: string;
  phase: StreamPhase;
  phaseDetail?: string;
  recentSteps: string[];
  lastUpdateAt: number;
}

/** Per-member entry inside `ConversationMemory.participantsContext`.
 *  Populated by `MemoryAutoSummaryWorker.build_participants_context/2` on the
 *  backend — snake_case keys are preserved over the wire (not a typo, not
 *  camelCased by the serializer). */
export interface ParticipantContextEntry {
  name?: string;
  type?: "human" | "agent";
  role?: string;
  message_count?: number;
  // Agents only
  capabilities?: string[];
  roles?: string[];
  tools?: string[];
  trust_level?: string;
  description?: string;
  model?: string;
}

export interface ConversationMemory {
  summary?: string;
  currentState?: string;
  keyDecisions?: Array<{ decision: string; context?: string }>;
  openQuestions?: string[];
  completedWork?: string[];
  importantContext?: Record<string, unknown>;
  participantsContext?: Record<string, ParticipantContextEntry>;
  updatedAt?: string;
  updatedBy?: string;
}

export async function getConversationMemory(
  conversationId: string
): Promise<{ memory: ConversationMemory; version: number }> {
  return request(`/api/conversations/${conversationId}/memory`);
}

export interface ConversationMember {
  participantId: string;
  role?: string;
  participant?: Participant;
}

export interface Conversation {
  id: string;
  title?: string;
  /** Custom group photo URL; when set, overrides GroupAvatar in list +
   *  header. `null` / missing falls back to the composed avatar. */
  avatarUrl?: string | null;
  type: "direct" | "group" | "task" | "channel";
  createdBy?: string;
  insertedAt: string;
  updatedAt: string;
  lastMessage?: Message;
  members?: ConversationMember[];
  pinned?: boolean;
  parentConversationId?: string;
}

export async function listConversations(
  scope: "personal" | "agents" = "personal"
): Promise<Conversation[]> {
  const data = await request<Conversation[] | { conversations: Conversation[] }>(
    `/api/conversations?scope=${scope}`
  );
  return Array.isArray(data) ? data : data.conversations;
}

export async function getConversation(id: string): Promise<Conversation> {
  return request(`/api/conversations/${id}`);
}

export async function fetchMessages(
  conversationId: string,
  before?: string
): Promise<{ messages: Message[] }> {
  const params = new URLSearchParams({ limit: "30" });
  if (before) params.set("before", before);
  return request(`/api/conversations/${conversationId}/messages?${params}`);
}

export async function fetchUnreadCounts(): Promise<{ unreadCounts: Record<string, number> }> {
  return request("/api/unread-counts");
}

export async function markConversationReadRest(conversationId: string): Promise<void> {
  await request(`/api/conversations/${conversationId}/read`, { method: "POST" });
}

export async function updateConversationTitleRest(
  conversationId: string,
  title: string
): Promise<Conversation> {
  return request(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

/** Set or clear the custom group photo. `null` removes the photo and the
 *  UI falls back to the composed GroupAvatar. Server-side admin check
 *  lives in `Messaging.update_conversation/3`. */
export async function updateConversationAvatarRest(
  conversationId: string,
  avatarUrl: string | null
): Promise<Conversation> {
  return request(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ avatarUrl }),
  });
}

export async function addConversationMember(
  conversationId: string,
  participantId: string
): Promise<void> {
  await request(`/api/conversations/${conversationId}/members`, {
    method: "POST",
    body: JSON.stringify({ participantId }),
  });
}

export async function removeConversationMember(
  conversationId: string,
  participantId: string
): Promise<void> {
  await request(`/api/conversations/${conversationId}/members/${participantId}`, {
    method: "DELETE",
  });
}

export async function deleteConversationRest(conversationId: string): Promise<void> {
  await request(`/api/conversations/${conversationId}`, { method: "DELETE" });
}

/** Halt any in-flight agent turns in this conversation. Used by the chat
 *  header menu's "Stop Agents" action. */
export async function stopConversationAgents(conversationId: string): Promise<void> {
  await request(`/api/conversations/${conversationId}/stop-agents`, {
    method: "POST",
  });
}

export async function createConversationRest(attrs: {
  type: "direct" | "group" | "channel";
  title?: string;
  memberIds: string[];
}): Promise<Conversation> {
  return request(`/api/conversations`, {
    method: "POST",
    body: JSON.stringify(attrs),
  });
}

export async function searchPeople(query: string): Promise<{ people: Participant[] }> {
  return request(`/api/people/search?q=${encodeURIComponent(query)}`);
}

// --- File attachments ---

export interface UploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
}

export async function requestUploadUrl(
  conversationId: string,
  file: { filename: string; contentType: string; sizeBytes: number }
): Promise<UploadUrlResponse> {
  return request(`/api/conversations/${conversationId}/upload-url`, {
    method: "POST",
    body: JSON.stringify(file),
  });
}

export async function confirmUpload(
  conversationId: string,
  body: {
    storageKey: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    caption?: string;
  }
): Promise<void> {
  await request(`/api/conversations/${conversationId}/files/confirm`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getFileDownloadUrl(
  attachmentId: string
): Promise<{ url: string }> {
  return request(`/api/files/${attachmentId}/download-url`);
}

export type DisplayType = "row" | "chip" | "highlight" | "body" | "change" | "sparkline";
export type HighlightColor = "success" | "warning" | "destructive" | "primary";
export type ResultType =
  | "hotel"
  | "flight"
  | "restaurant"
  | "event"
  | "product"
  | "email"
  | "finance"
  | "contact"
  | "generic";

export interface DetailField {
  key: string;
  label?: string;
  display: DisplayType;
  icon?: string;
  color?: HighlightColor | string;
  format?: string;
  hidden?: boolean;
}

export interface ResponseTemplate {
  id: string;
  ownerId?: string;
  name: string;
  description?: string;
  resultType: ResultType;
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
  soulMdInherited?: boolean;
  soulMdSourceName?: string;
  soulMdSourceId?: string;
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
    displayName?: string;
    executorKey: string;
    status: string;
    lastPollAt?: string;
    secondsSincePoll?: number;
    activeTaskCount: number;
    processMetrics?: Record<string, unknown>;
    pendingCommand?: string;
  }>;
  stuckTasks: Array<{
    id: string;
    taskId: string;
    title?: string;
    claimedAt: string;
    status: string;
    elapsedSeconds: number;
  }>;
  unackedMessages: Array<{
    id: string;
    messageId: string;
    conversationId: string;
    claimedAt: string;
    elapsedSeconds: number;
  }>;
}

export interface InviteInfo {
  displayName: string;
  description?: string;
  capabilities?: string[];
  creator?: { displayName: string };
}

export interface Routine {
  id: string;
  participantId: string;
  ownerId: string;
  name: string;
  description?: string;
  instructions: string;
  status: "active" | "paused" | "disabled" | "expired";
  scheduleType: "interval" | "cron";
  scheduleConfig: Record<string, unknown>;
  reportTo?: string;
  state: Record<string, unknown>;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  maxRuns?: number;
  expiresAt?: string;
  consecutiveFailures: number;
  responseTemplate?: string;
  insertedAt: string;
  updatedAt: string;
}
