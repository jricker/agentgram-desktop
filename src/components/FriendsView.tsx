import { useEffect, useMemo, useRef, useState } from "react";
import { Search, User, UserPlus, Loader2, MessageCircle, UserMinus, ShieldOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "../lib/utils";
import * as api from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import { useChatStore } from "../stores/chatStore";
import { useFriendStore } from "../stores/friendStore";
import { useNavStore } from "../stores/navStore";

type Segment = "friends" | "requests" | "sent";
const SEGMENTS: Segment[] = ["friends", "requests", "sent"];

function otherParticipant(connection: api.UserConnection, currentUserId?: string) {
  return connection.requesterId === currentUserId ? connection.addressee : connection.requester;
}

function initials(name?: string) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function makeHandle(person?: api.Participant) {
  const metadataHandle = person?.metadata?.handle;
  const metadataUsername = person?.metadata?.username;
  const explicitHandle =
    typeof metadataHandle === "string" && metadataHandle.trim()
      ? metadataHandle
      : typeof metadataUsername === "string" && metadataUsername.trim()
        ? metadataUsername
        : undefined;

  const fallback = (explicitHandle ?? person?.displayName)
    ?.toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return fallback ? `@${fallback}` : "@friend";
}

function formatFriendsSince(connection: api.UserConnection) {
  const value = connection.connectedAt ?? connection.respondedAt;
  if (!value) return "Friend on Agentgram";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Friend on Agentgram";

  return `Friends since ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)}`;
}

export function FriendsView() {
  const currentUserId = useAuthStore((s) => s.participant?.id);
  const setView = useNavStore((s) => s.setView);
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const {
    connections,
    loading,
    pendingCount,
    fetchConnections,
    fetchPendingCount,
    requestFriend,
    respondFriend,
    revokeFriend,
    blockFriend,
  } = useFriendStore();

  const [segment, setSegment] = useState<Segment>("friends");
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<api.Participant[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchConnections();
    fetchPendingCount();
  }, [fetchConnections, fetchPendingCount]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = search.trim();
    if (q.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.searchPeople(q);
        setPeople(data.people ?? []);
      } catch (e) {
        setPeople([]);
        console.warn("[Friends] people search failed", e);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [search]);

  const received = useMemo(
    () => connections.filter((c) => c.status === "pending" && c.addresseeId === currentUserId),
    [connections, currentUserId]
  );
  const sent = useMemo(
    () => connections.filter((c) => c.status === "pending" && c.requesterId === currentUserId),
    [connections, currentUserId]
  );
  const friends = useMemo(
    () => connections.filter((c) => c.status === "accepted"),
    [connections]
  );

  const currentList = segment === "requests" ? received : segment === "sent" ? sent : friends;

  const updateSearchResult = (participantId: string, patch: Partial<api.Participant>) => {
    setPeople((rows) => rows.map((p) => (p.id === participantId ? { ...p, ...patch } : p)));
  };

  const handleConnect = async (person: api.Participant) => {
    setBusyId(person.id);
    setError(null);
    try {
      const connection = await requestFriend(person.id);
      updateSearchResult(person.id, {
        connectionId: connection?.id,
        connectionStatus: connection?.status ?? "pending",
        canRequest: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send friend request");
    } finally {
      setBusyId(null);
    }
  };

  const handleRespond = async (id: string, decision: "accepted" | "rejected") => {
    setBusyId(id);
    setError(null);
    try {
      await respondFriend(id, decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update request");
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (connection: api.UserConnection) => {
    const label = connection.status === "accepted" ? "Unfriend" : "Cancel request";
    if (!confirm(`${label}?`)) return;
    setBusyId(connection.id);
    setError(null);
    try {
      await revokeFriend(connection.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update connection");
    } finally {
      setBusyId(null);
    }
  };

  const handleBlock = async (connection: api.UserConnection) => {
    if (!confirm("Block this user? This blocks search, requests, DMs, and shared access.")) return;
    setBusyId(connection.id);
    setError(null);
    try {
      await blockFriend(connection.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not block user");
    } finally {
      setBusyId(null);
    }
  };

  const handleMessage = async (connection: api.UserConnection) => {
    const peer = otherParticipant(connection, currentUserId);
    if (!peer) return;
    const existing = conversations.find(
      (c) => c.type === "direct" && c.members?.some((m) => m.participantId === peer.id)
    );
    setBusyId(connection.id);
    try {
      if (existing) {
        setActiveConversation(existing.id);
      } else {
        const conv = await createConversation({ type: "direct", memberIds: [peer.id] });
        setActiveConversation(conv.id);
      }
      setView("chat");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">Friends</h1>
          <Button variant="outline" size="sm" onClick={() => { fetchConnections(); fetchPendingCount(); }}>
            Refresh
          </Button>
        </div>
        <div className="relative mt-3 max-w-xl">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people by name or email..."
            className="pl-9"
          />
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {search.trim().length >= 2 && (
          <section className="mb-6 max-w-3xl">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">People</div>
            <div className="overflow-hidden rounded-lg border border-border">
              {searching ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching people...
                </div>
              ) : people.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">No people found.</div>
              ) : (
                people.map((person) => (
                  <PersonSearchRow
                    key={person.id}
                    person={person}
                    connections={connections}
                    currentUserId={currentUserId}
                    busy={busyId === person.id || busyId === person.connectionId}
                    onConnect={() => handleConnect(person)}
                    onOpenRequests={() => setSegment("requests")}
                  />
                ))
              )}
            </div>
          </section>
        )}

        <div className="mb-4 flex gap-2">
          {SEGMENTS.map((value) => {
            const count = value === "requests" ? pendingCount || received.length : value === "friends" ? friends.length : sent.length;
            return (
              <button
                key={value}
                onClick={() => setSegment(value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  segment === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {value}{count > 0 ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>

        <section className="max-w-3xl">
          {loading && connections.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading friends...
            </div>
          ) : currentList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {segment === "friends" ? "No friends yet. Search above to connect." : segment === "requests" ? "No friend requests." : "No sent requests."}
            </div>
          ) : segment === "friends" ? (
            <div className="divide-y divide-border">
              {currentList.map((connection) => (
                <FriendRow
                  key={connection.id}
                  connection={connection}
                  currentUserId={currentUserId}
                  busy={busyId === connection.id}
                  onRevoke={() => handleRevoke(connection)}
                  onMessage={() => handleMessage(connection)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {currentList.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  currentUserId={currentUserId}
                  segment={segment}
                  busy={busyId === connection.id}
                  onAccept={() => handleRespond(connection.id, "accepted")}
                  onReject={() => handleRespond(connection.id, "rejected")}
                  onRevoke={() => handleRevoke(connection)}
                  onBlock={() => handleBlock(connection)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PersonSearchRow({
  person,
  connections,
  currentUserId,
  busy,
  onConnect,
  onOpenRequests,
}: {
  person: api.Participant;
  connections: api.UserConnection[];
  currentUserId?: string;
  busy: boolean;
  onConnect: () => void;
  onOpenRequests: () => void;
}) {
  const connection =
    connections.find((c) => c.id === person.connectionId) ??
    connections.find((c) => c.requesterId === person.id || c.addresseeId === person.id);
  const status = connection?.status ?? person.connectionStatus ?? "none";
  const incoming = connection?.status === "pending" && connection.addresseeId === currentUserId;
  const canRequest = person.canRequest || status === "none" || status === "rejected" || status === "revoked";

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <Avatar className="h-9 w-9">
        {person.avatarUrl && <AvatarImage src={person.avatarUrl} />}
        <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{person.displayName}</div>
      </div>
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : status === "accepted" ? (
        <Badge variant="secondary" className="bg-success/10 text-success">Friends</Badge>
      ) : incoming ? (
        <Button size="sm" variant="outline" onClick={onOpenRequests}>Respond</Button>
      ) : canRequest ? (
        <Button size="sm" onClick={onConnect}><UserPlus className="mr-1 h-3 w-3" />Connect</Button>
      ) : (
        <Badge variant="outline" className="capitalize">{status}</Badge>
      )}
    </div>
  );
}

/** X-style friend row with avatar, name/handle, bio, and icon action buttons */
function FriendRow({
  connection,
  currentUserId,
  busy,
  onRevoke,
  onMessage,
}: {
  connection: api.UserConnection;
  currentUserId?: string;
  busy: boolean;
  onRevoke: () => void;
  onMessage: () => void;
}) {
  const person = otherParticipant(connection, currentUserId);
  const handle = makeHandle(person);
  const bio = person?.description || connection.message || formatFriendsSince(connection);

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <Avatar className="h-11 w-11 shrink-0">
        {person?.avatarUrl && <AvatarImage src={person.avatarUrl} />}
        <AvatarFallback>{initials(person?.displayName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{person?.displayName ?? "Unknown"}</div>
            <div className="truncate text-xs text-muted-foreground">{handle}</div>
          </div>
          {busy ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={onMessage}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80"
                title={`Message ${person?.displayName ?? "friend"}`}
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                onClick={onRevoke}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
                title={`Unfriend ${person?.displayName ?? "friend"}`}
              >
                <UserMinus className="h-4 w-4 text-destructive" />
              </button>
            </div>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{bio}</p>
      </div>
    </div>
  );
}

/** Card for requests and sent segments */
function ConnectionCard({
  connection,
  currentUserId,
  segment,
  busy,
  onAccept,
  onReject,
  onRevoke,
  onBlock,
}: {
  connection: api.UserConnection;
  currentUserId?: string;
  segment: Segment;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onRevoke: () => void;
  onBlock: () => void;
}) {
  const person = otherParticipant(connection, currentUserId);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          {person?.avatarUrl && <AvatarImage src={person.avatarUrl} />}
          <AvatarFallback>{initials(person?.displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{person?.displayName ?? "Unknown"}</div>
          {connection.message && <div className="truncate text-xs text-muted-foreground">{connection.message}</div>}
        </div>
        <Badge variant={connection.status === "accepted" ? "secondary" : "outline"} className="capitalize">
          {connection.status}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : segment === "requests" ? (
          <>
            <Button size="sm" onClick={onAccept}>Accept</Button>
            <Button size="sm" variant="outline" onClick={onReject}>Reject</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onBlock}>
              <ShieldOff className="mr-1 h-3 w-3" />Block
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onRevoke}>Cancel request</Button>
        )}
      </div>
    </div>
  );
}
