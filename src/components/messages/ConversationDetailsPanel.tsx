import { useCallback, useMemo, useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { useAgentStore } from "../../stores/agentStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  X,
  Bot,
  UserMinus,
  UserPlus,
  Pencil,
  Check,
  Crown,
  Trash2,
  LogOut,
} from "lucide-react";
import { cn, getInitials } from "../../lib/utils";
import type { Conversation, ConversationMember } from "../../lib/api";

interface Props {
  conversation: Conversation;
  currentUserId?: string;
  onClose: () => void;
  onAfterLeave?: () => void;
}

export function ConversationDetailsPanel({
  conversation,
  currentUserId,
  onClose,
  onAfterLeave,
}: Props) {
  const online = usePresenceStore((s) => s.online);
  const updateTitle = useChatStore((s) => s.updateConversationTitle);
  const addMember = useChatStore((s) => s.addMember);
  const removeMember = useChatStore((s) => s.removeMember);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const leaveConversation = useChatStore((s) => s.leaveConversation);

  // Desktop's agent store is a Record<id, ManagedAgent>. Memoize the
  // flattened list so the selector returns a stable reference until the
  // record itself changes — avoids the Zustand `?? []` re-render trap.
  const agentsMap = useAgentStore((s) => s.agents);
  const agents = useMemo(
    () => Object.values(agentsMap).map((m) => m.agent),
    [agentsMap]
  );

  const isAdmin = conversation.createdBy === currentUserId;
  const members = conversation.members ?? [];

  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversation.title ?? "");
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [danger, setDanger] = useState<"leave" | "delete" | null>(null);

  const handleRename = useCallback(async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === conversation.title) {
      setEditing(false);
      return;
    }
    try {
      await updateTitle(conversation.id, trimmed);
      setEditing(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Rename failed");
    }
  }, [titleDraft, conversation.id, conversation.title, updateTitle]);

  const handleRemove = useCallback(
    async (participantId: string, name: string) => {
      if (!confirm(`Remove ${name} from this conversation?`)) return;
      try {
        await removeMember(conversation.id, participantId);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Remove failed");
      }
    },
    [conversation.id, removeMember]
  );

  const handleAddSelected = useCallback(async () => {
    setActionError(null);
    try {
      for (const id of addingIds) {
        await addMember(conversation.id, id);
      }
      setAddingIds(new Set());
      setShowAddMembers(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to add");
    }
  }, [addingIds, conversation.id, addMember]);

  const toggleAddId = useCallback((id: string) => {
    setAddingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDangerConfirm = useCallback(async () => {
    if (!danger) return;
    setActionError(null);
    try {
      if (danger === "delete") {
        await deleteConversation(conversation.id);
      } else if (danger === "leave" && currentUserId) {
        await leaveConversation(conversation.id, currentUserId);
      }
      setDanger(null);
      onAfterLeave?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    }
  }, [
    danger,
    conversation.id,
    currentUserId,
    deleteConversation,
    leaveConversation,
    onAfterLeave,
  ]);

  const memberIds = new Set(members.map((m) => m.participantId));
  const availableAgents = agents.filter(
    (a) => a.status === "active" && !memberIds.has(a.id)
  );

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4 shrink-0">
        <h3 className="text-sm font-semibold">Details</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Title section */}
        <div className="border-b border-border px-4 py-4">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <button
                onClick={handleRename}
                className="rounded p-1 text-primary hover:bg-muted"
                title="Save"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="flex-1 truncate text-base font-semibold">
                {conversation.title || "Untitled conversation"}
              </h2>
              {isAdmin && (
                <button
                  onClick={() => {
                    setTitleDraft(conversation.title ?? "");
                    setEditing(true);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground capitalize">
            {conversation.type} · {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Members */}
        <div className="px-4 py-3">
          <h4 className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Members
          </h4>
          <ul className="space-y-0.5">
            {members.map((m) => (
              <MemberRow
                key={m.participantId}
                member={m}
                isOnline={online.has(m.participantId)}
                isSelf={m.participantId === currentUserId}
                isAdmin={isAdmin}
                isConversationCreator={m.participantId === conversation.createdBy}
                onRemove={() =>
                  handleRemove(
                    m.participantId,
                    m.participant?.displayName ?? "this member"
                  )
                }
              />
            ))}
          </ul>

          {isAdmin && (
            <div className="mt-2">
              {!showAddMembers ? (
                <button
                  onClick={() => setShowAddMembers(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <UserPlus className="h-4 w-4" />
                  Add members
                </button>
              ) : (
                <div className="rounded-lg border border-border p-2">
                  <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                    Select agents to add
                  </p>
                  {availableAgents.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1 py-0.5">
                      No agents available
                    </p>
                  ) : (
                    <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                      {availableAgents.map((agent) => (
                        <li key={agent.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                            <input
                              type="checkbox"
                              checked={addingIds.has(agent.id)}
                              onChange={() => toggleAddId(agent.id)}
                            />
                            <Avatar className="h-6 w-6">
                              {agent.avatarUrl && <AvatarImage src={agent.avatarUrl} />}
                              <AvatarFallback className="bg-primary/10 text-primary">
                                <Bot className="h-3 w-3" />
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-sm">{agent.displayName}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowAddMembers(false);
                        setAddingIds(new Set());
                      }}
                    >
                      Cancel
                    </Button>
                    {addingIds.size > 0 && (
                      <Button size="sm" onClick={handleAddSelected}>
                        Add ({addingIds.size})
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="border-t border-border px-4 py-3">
          {danger ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium">
                {danger === "delete"
                  ? "Delete this conversation?"
                  : "Leave this conversation?"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {danger === "delete"
                  ? "This removes it for everyone and cannot be undone."
                  : "You'll no longer see new messages here."}
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDanger(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDangerConfirm}
                >
                  {danger === "delete" ? "Delete" : "Leave"}
                </Button>
              </div>
            </div>
          ) : isAdmin ? (
            <button
              onClick={() => setDanger("delete")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete conversation
            </button>
          ) : (
            <button
              onClick={() => setDanger("leave")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Leave conversation
            </button>
          )}
        </div>

        {actionError && (
          <p className="px-4 pb-3 text-[11px] text-destructive">{actionError}</p>
        )}
      </div>
    </aside>
  );
}

function MemberRow({
  member,
  isOnline,
  isSelf,
  isAdmin,
  isConversationCreator,
  onRemove,
}: {
  member: ConversationMember;
  isOnline: boolean;
  isSelf: boolean;
  isAdmin: boolean;
  isConversationCreator: boolean;
  onRemove: () => void;
}) {
  const p = member.participant;
  const name = p?.displayName ?? "Unknown";
  const isAgent = p?.type === "agent";

  return (
    <li className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <div className="relative shrink-0">
        <Avatar className="h-8 w-8">
          {p?.avatarUrl && <AvatarImage src={p.avatarUrl} alt={name} />}
          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
            {isAgent ? <Bot className="h-3.5 w-3.5" /> : getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
            isOnline ? "bg-success" : "bg-muted-foreground/40"
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {isSelf && <span className="text-[10px] text-muted-foreground">(You)</span>}
          {isConversationCreator && (
            <Crown className="h-3 w-3 text-amber-500 shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {isAgent ? "Agent" : "Human"} · {isOnline ? "Online" : "Offline"}
        </p>
      </div>

      {isAdmin && !isSelf && (
        <button
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 transition-opacity"
          title="Remove member"
        >
          <UserMinus className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
