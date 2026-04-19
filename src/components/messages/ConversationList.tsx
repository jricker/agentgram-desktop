import { memo, useCallback, useMemo, useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { usePresenceStore } from "../../stores/presenceStore";
import {
  cn,
  getConversationTitle,
  getInitials,
  formatConversationTime,
} from "../../lib/utils";
import {
  Hash,
  Pin,
  MessageCircle,
  Users,
  Bot,
  ChevronRight,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { GroupAvatar } from "./GroupAvatar";
import type { Conversation } from "../../lib/api";

interface Section {
  label: string;
  icon: typeof MessageCircle;
  conversations: Conversation[];
}

function categorize(conversations: Conversation[]): Section[] {
  const dms: Conversation[] = [];
  const channels: Conversation[] = [];
  const groups: Conversation[] = [];

  for (const conv of conversations) {
    if (conv.type === "channel") channels.push(conv);
    else if (conv.type === "group") groups.push(conv);
    else dms.push(conv);
  }

  const sections: Section[] = [];
  if (dms.length > 0) sections.push({ label: "DMs", icon: MessageCircle, conversations: dms });
  if (channels.length > 0)
    sections.push({ label: "Channels", icon: Hash, conversations: channels });
  if (groups.length > 0) sections.push({ label: "Groups", icon: Users, conversations: groups });
  return sections;
}

export function ConversationList({
  scope = "personal",
}: {
  scope?: "personal" | "agents";
}) {
  const personalConvos = useChatStore((s) => s.conversations);
  const agentConvos = useChatStore((s) => s.agentConversations);
  const conversations = scope === "agents" ? agentConvos : personalConvos;
  const personalLoading = useChatStore((s) => s.conversationsLoading);
  const agentLoading = useChatStore((s) => s.agentConversationsLoading);
  const loading = scope === "agents" ? agentLoading : personalLoading;
  const activeId = useChatStore((s) => s.activeConversationId);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const setActive = useChatStore((s) => s.setActiveConversation);
  const online = usePresenceStore((s) => s.online);
  const currentUserId = useAuthStore((s) => s.participant?.id);

  const sections = useMemo(() => categorize(conversations), [conversations]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = useCallback((label: string) => {
    setCollapsed((p) => ({ ...p, [label]: !p[label] }));
  }, []);

  if (loading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <MessageSquare className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          {scope === "agents" ? "No agent conversations" : "No conversations yet"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {scope === "agents"
            ? "Heartbeat and agent-to-agent DMs will appear here."
            : "Click the pencil icon above to start one."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-2 py-1">
      {sections.map((section) => {
        const isCollapsed = collapsed[section.label] ?? false;
        const Icon = section.icon;
        return (
          <div key={section.label}>
            <button
              onClick={() => toggle(section.label)}
              className="flex w-full items-center gap-1.5 px-2 pb-1 pt-3 first:pt-1 hover:bg-muted/40 rounded-md transition-colors"
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform duration-200",
                  !isCollapsed && "rotate-90"
                )}
              />
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {section.conversations.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="flex flex-col gap-0.5">
                {section.conversations.map((conv) => {
                  const anyOnline =
                    conv.members?.some(
                      (m) =>
                        m.participantId !== currentUserId &&
                        online.has(m.participantId)
                    ) ?? false;
                  const hasAgent =
                    conv.members?.some(
                      (m) =>
                        m.participantId !== currentUserId &&
                        m.participant?.type === "agent"
                    ) ?? false;
                  return (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={conv.id === activeId}
                      unreadCount={
                        scope === "agents" ? 0 : unreadCounts[conv.id] ?? 0
                      }
                      anyOnline={anyOnline}
                      hasAgent={hasAgent}
                      currentUserId={currentUserId}
                      onClick={() => setActive(conv.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  unreadCount,
  anyOnline,
  hasAgent,
  currentUserId,
  onClick,
}: {
  conversation: Conversation;
  isActive: boolean;
  unreadCount: number;
  anyOnline: boolean;
  hasAgent: boolean;
  currentUserId?: string;
  onClick: () => void;
}) {
  const title = getConversationTitle(conversation, currentUserId);
  const isGroup = conversation.type === "group";
  const isChannel = conversation.type === "channel";
  const otherMembers = (conversation.members ?? []).filter(
    (m) => m.participantId !== currentUserId
  );
  const otherMember = otherMembers[0]?.participant;
  const hasUnread = unreadCount > 0;
  const timeStr = formatConversationTime(conversation.updatedAt);

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
        isActive
          ? "bg-primary/10 text-foreground"
          : "text-foreground/80 hover:bg-muted/50",
        hasUnread && !isActive && "text-foreground"
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
        {isChannel ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        ) : isGroup && otherMembers.length > 0 ? (
          <GroupAvatar members={otherMembers} size={28} />
        ) : (
          <div className="relative">
            {otherMember?.avatarUrl ? (
              <img
                src={otherMember.avatarUrl}
                alt=""
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                {getInitials(title)}
              </div>
            )}
            {hasAgent && (
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                  anyOnline ? "bg-success" : "bg-muted-foreground"
                )}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1">
          {conversation.pinned && (
            <Pin className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              hasUnread ? "font-semibold" : "font-medium"
            )}
          >
            {title}
          </span>
          {hasUnread && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeStr}</span>
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          {(isChannel || isGroup) && (
            <>
              <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                <Users className="h-2.5 w-2.5" />
                {otherMembers.length + 1}
              </span>
              {isGroup && (
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                  {otherMembers.slice(0, 2).map((m, i) => (
                    <span key={m.participantId} className="inline-flex items-center">
                      {i > 0 && ", "}
                      {m.participant?.type === "agent" && (
                        <Bot className="mr-0.5 inline h-2.5 w-2.5 align-text-bottom" />
                      )}
                      {m.participant?.displayName || "?"}
                    </span>
                  ))}
                  {otherMembers.length > 2 && (
                    <span className="font-semibold">
                      {" "}
                      +{otherMembers.length - 2}
                    </span>
                  )}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  );
});
