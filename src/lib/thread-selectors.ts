import type { Conversation } from "./api";

/**
 * Resolve the conversation a sourced agent-thread is anchored to. Sourced
 * threads carry the parent's id either on the dedicated `parentConversationId`
 * column or, for legacy rows that predate it, inside `metadata.source_conversation_id`
 * / its camelCase variant.
 */
export function agentConversationSourceId(conversation: Conversation): string | undefined {
  const metadata = (conversation.metadata ?? {}) as Record<string, unknown>;
  return (
    conversation.parentConversationId ??
    (typeof metadata.source_conversation_id === "string"
      ? (metadata.source_conversation_id as string)
      : undefined) ??
    (typeof metadata.sourceConversationId === "string"
      ? (metadata.sourceConversationId as string)
      : undefined)
  );
}

/**
 * Pure filter: child agent threads of a given parent conversation, excluding
 * the parent itself and task work-conversations (those have their own UI).
 */
export function selectChildAgentThreads(
  agentConversations: Conversation[] | undefined,
  parentConversationId: string
): Conversation[] {
  if (!agentConversations || agentConversations.length === 0) return [];
  return agentConversations.filter((c) => {
    if (c.id === parentConversationId || c.type === "task") return false;
    return agentConversationSourceId(c) === parentConversationId;
  });
}

/**
 * Read the thread's lifecycle status from `metadata.thread_status`. Defaults
 * to `"open"` for legacy threads that pre-date the field.
 * Possible values: "open", "resolved", "abandoned".
 */
export function threadStatus(conversation: Conversation): string {
  const metadata = (conversation.metadata ?? {}) as Record<string, unknown>;
  const status = metadata.thread_status ?? metadata.threadStatus;
  return typeof status === "string" ? status : "open";
}

export function isResolvedThread(conversation: Conversation): boolean {
  const s = threadStatus(conversation);
  return s === "resolved" || s === "abandoned";
}

/**
 * Pull the thread's topic from metadata (if it was opened with one).
 */
export function threadTopic(conversation: Conversation): string | null {
  const metadata = (conversation.metadata ?? {}) as Record<string, unknown>;
  const topic = metadata.thread_topic ?? metadata.threadTopic;
  if (typeof topic !== "string") return null;
  const trimmed = topic.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * `true` when the conversation is an agent thread — used to decide whether
 * to show the back-to-parent button and the in-thread directives.
 */
export function isAgentThread(conversation: Conversation | undefined | null): boolean {
  if (!conversation) return false;
  const metadata = (conversation.metadata ?? {}) as Record<string, unknown>;
  return metadata.agent_thread === true || metadata.agentThread === true;
}
