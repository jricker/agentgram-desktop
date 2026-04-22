import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, ChevronRight, SquarePen, Bot } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { useStreamingStore } from "../../stores/streamingStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "../../lib/utils";
import { ConversationList } from "./ConversationList";
import { ChatThread } from "./ChatThread";
import { MessageComposer } from "./MessageComposer";
import { ConversationDetailsPanel } from "./ConversationDetailsPanel";
import { NewConversationDialog } from "./NewConversationDialog";
import { ChatHeaderMenu } from "./ChatHeaderMenu";
import { GroupAvatar } from "./GroupAvatar";

const DETAILS_KEY = "agentchat:showDetails";
const ACTIVE_TAB_KEY = "agentchat:messagesTab";

type MessagesTab = "chats" | "agents";

function readDetailsPref(): boolean {
  try {
    return localStorage.getItem(DETAILS_KEY) === "1";
  } catch {
    return false;
  }
}

function readTabPref(): MessagesTab {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY) === "agents" ? "agents" : "chats";
  } catch {
    return "chats";
  }
}

export function MessagesView() {
  const activeId = useChatStore((s) => s.activeConversationId);
  const fetchAgentConversations = useChatStore((s) => s.fetchAgentConversations);
  const agentLoaded = useChatStore((s) => s.agentConversationsLoaded);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const personalConversations = useChatStore((s) => s.conversations);
  const agentStreams = useStreamingStore((s) => s.streams);

  const [showDetails, setShowDetails] = useState(readDetailsPref);
  const [showNew, setShowNew] = useState(false);
  const [activeTab, setActiveTab] = useState<MessagesTab>(readTabPref);
  const agentFetchOnce = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(DETAILS_KEY, showDetails ? "1" : "0");
    } catch {}
  }, [showDetails]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {}
  }, [activeTab]);

  // Lazy-load agent conversations the first time the agents tab is opened —
  // matches web + mobile behavior so the initial personal load isn't held up
  // by the larger scope=agents call.
  useEffect(() => {
    if (activeTab === "agents" && !agentFetchOnce.current) {
      agentFetchOnce.current = true;
      if (!agentLoaded) fetchAgentConversations();
    }
  }, [activeTab, agentLoaded, fetchAgentConversations]);

  // Subtle indicator on the Agent-to-Agent tab when something is happening
  // there while the user is looking at Chats — any active stream counts.
  const hasAgentActivity = useMemo(
    () => Object.keys(agentStreams).length > 0,
    [agentStreams]
  );

  // Show a badge on the Chats tab when there are unread personal convs and
  // we're on a different tab. Filter against the personal list — the
  // server's unread-counts endpoint returns entries for every conversation
  // the user can see, including agent-to-agent ones; summing those would
  // inflate the badge.
  const totalPersonalUnread = useMemo(() => {
    const personalIds = new Set(personalConversations.map((c) => c.id));
    let sum = 0;
    for (const [id, n] of Object.entries(unreadCounts)) {
      if (personalIds.has(id)) sum += typeof n === "number" ? n : 0;
    }
    return sum;
  }, [unreadCounts, personalConversations]);

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <aside
        className="w-80 shrink-0 flex flex-col border-r border-border bg-card"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div
          className="h-14 shrink-0 px-4 border-b border-border flex items-center justify-between"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <h2 className="text-sm font-semibold text-foreground">Messages</h2>
          {activeTab === "chats" && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              title="New conversation"
              aria-label="New conversation"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <SquarePen className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          className="flex items-center gap-1 px-3 py-2 border-b border-border"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <TabPill
            label="Chats"
            icon={MessageSquare}
            active={activeTab === "chats"}
            onClick={() => setActiveTab("chats")}
            badge={totalPersonalUnread > 0 ? totalPersonalUnread : undefined}
          />
          <TabPill
            label="Agent-to-Agent"
            icon={Bot}
            active={activeTab === "agents"}
            onClick={() => setActiveTab("agents")}
            activity={hasAgentActivity}
          />
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <ConversationList scope={activeTab === "agents" ? "agents" : "personal"} />
        </div>
      </aside>

      <section className="flex-1 flex flex-col bg-background overflow-hidden">
        {activeId ? (
          <ActiveConversation
            conversationId={activeId}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails((v) => !v)}
          />
        ) : (
          <EmptyState />
        )}
      </section>

      {activeId && showDetails && (
        <DetailsPanelWrapper
          conversationId={activeId}
          onClose={() => setShowDetails(false)}
        />
      )}

      {showNew && <NewConversationDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function ActiveConversation({
  conversationId,
  showDetails,
  onToggleDetails,
}: {
  conversationId: string;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === conversationId)
  );
  const myId = useAuthStore((s) => s.participant?.id);

  const online = usePresenceStore((s) => s.online);

  // Match web's ChatView header — show a stacked GroupAvatar for group
  // conversations or whenever there's more than one other participant.
  const otherMembers = useMemo(
    () =>
      (conversation?.members ?? []).filter((m) => m.participantId !== myId),
    [conversation, myId]
  );
  const showGroupAvatar =
    conversation?.type === "group" || otherMembers.length >= 2;
  const otherParticipant = otherMembers[0]?.participant;

  const headerTitle =
    conversation?.title ||
    otherParticipant?.displayName ||
    (conversation?.type === "group" ? "Group" : "Conversation");

  const presenceLine = useMemo(() => {
    if (!conversation) return null;
    const members = conversation.members ?? [];
    const others = members.filter((m) => m.participantId !== myId);
    const onlineCount = others.filter((m) => online.has(m.participantId)).length;
    const isDM = conversation.type === "direct" || others.length === 1;
    if (isDM) {
      return onlineCount > 0 ? "Online" : "Offline";
    }
    if (conversation.type === "channel" || conversation.type === "group") {
      return onlineCount > 0
        ? `${onlineCount} online · ${others.length + 1} members`
        : `${others.length + 1} members`;
    }
    return null;
  }, [conversation, online, myId]);

  const presenceDotColor = useMemo(() => {
    if (!presenceLine) return null;
    if (presenceLine === "Online" || presenceLine.startsWith(`${"0"} online`)) {
      return presenceLine === "Online" ? "bg-success" : "bg-muted-foreground/40";
    }
    return presenceLine.includes("online ·") ? "bg-success" : null;
  }, [presenceLine]);

  return (
    <>
      <header
        className="h-14 shrink-0 px-4 border-b border-border bg-card flex items-center gap-3"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onToggleDetails}
          aria-pressed={showDetails}
          title={showDetails ? "Hide details" : "Show conversation details"}
          className="group/header flex items-center gap-3 min-w-0 flex-1 rounded-md px-1 py-1 -ml-1 hover:bg-accent/50 text-left transition-colors"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {conversation?.avatarUrl ? (
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={conversation.avatarUrl} alt={headerTitle} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {headerTitle.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : showGroupAvatar && otherMembers.length > 0 ? (
            <GroupAvatar members={otherMembers} size={36} />
          ) : (
            <Avatar className="h-9 w-9 shrink-0">
              {otherParticipant?.avatarUrl ? (
                <AvatarImage src={otherParticipant.avatarUrl} alt={headerTitle} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {headerTitle.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{headerTitle}</p>
            {presenceLine && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                {presenceDotColor && (
                  <span className={cn("h-1.5 w-1.5 rounded-full", presenceDotColor)} />
                )}
                {presenceLine}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover/header:text-muted-foreground group-hover/header:translate-x-0.5" />
        </button>

        {conversation && (
          <ChatHeaderMenu
            conversation={conversation}
            onAfterDangerAction={() => {
              // Details panel clings to the deleted conversation id —
              // close it so the thread column shows the EmptyState.
            }}
          />
        )}
      </header>

      <ChatThread conversationId={conversationId} />
      <MessageComposer conversationId={conversationId} />
    </>
  );
}

function DetailsPanelWrapper({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === conversationId)
  );
  const myId = useAuthStore((s) => s.participant?.id);
  const refreshConversation = useChatStore((s) => s.refreshConversation);

  // The conversation list endpoint may not include full member / participant
  // payloads. Pull a fresh copy on open so the panel has complete data.
  useEffect(() => {
    refreshConversation(conversationId);
  }, [conversationId, refreshConversation]);

  if (!conversation) return null;

  return (
    <ConversationDetailsPanel
      conversation={conversation}
      currentUserId={myId}
      onClose={onClose}
      onAfterLeave={onClose}
    />
  );
}

function TabPill({
  label,
  icon: Icon,
  active,
  onClick,
  badge,
  activity,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  badge?: number;
  activity?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {activity && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      )}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <MessageSquare className="w-12 h-12 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-foreground">Select a conversation</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Your recent conversations with agents appear on the left. Pick one to jump in.
      </p>
    </div>
  );
}
