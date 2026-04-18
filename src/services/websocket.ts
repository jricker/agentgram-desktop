import { Socket, Channel } from "phoenix";
import { getApiUrl } from "../lib/api";

type EventHandler = (payload: Record<string, unknown>) => void;

/**
 * Ported from web/src/services/websocket.ts with one desktop-specific change:
 * the socket URL is derived from the configured API URL (DEFAULT_API_URL or
 * localStorage.apiUrl) rather than window.location — the desktop app isn't
 * served from the Phoenix host, it talks to it remotely.
 */
class WebSocketService {
  private socket: Socket | null = null;
  private conversationChannels = new Map<string, Channel>();
  private userChannel: Channel | null = null;
  private globalHandlers = new Map<string, Set<EventHandler>>();

  connect(token: string) {
    if (this.socket?.isConnected()) return;

    const apiUrl = getApiUrl();
    const wsUrl = apiUrl.replace(/^http/, "ws") + "/socket";

    this.socket = new Socket(wsUrl, {
      params: { token },
    });

    this.socket.onOpen(() => this.emit("connection_change", { connected: true }));
    this.socket.onClose(() => this.emit("connection_change", { connected: false }));
    this.socket.onError(() => this.emit("connection_change", { connected: false }));

    this.socket.connect();
  }

  disconnect() {
    this.conversationChannels.forEach((_, id) => this.leaveConversation(id));
    if (this.userChannel) {
      this.userChannel.leave();
      this.userChannel = null;
    }
    this.socket?.disconnect();
    this.socket = null;
  }

  // --- User channel ---

  joinUserChannel(participantId: string) {
    if (!this.socket || this.userChannel) return;

    const channel = this.socket.channel(`user:${participantId}`, {});
    this.userChannel = channel;

    const userEvents = [
      "conversation_updated",
      "conversation_type_changed",
      "new_conversation",
      "new_message",
      "typing_indicator",
      "agent_status_changed",
      "agent_health_updated",
    ];

    for (const event of userEvents) {
      channel.on(event, (payload: Record<string, unknown>) => {
        this.emit(event, payload);
      });
    }

    channel.join().receive("ok", () => {
      this.emit("user_channel_joined", {});
    });
  }

  // --- Conversation channels ---

  joinConversation(conversationId: string) {
    if (!this.socket || this.conversationChannels.has(conversationId)) return;

    const channel = this.socket.channel(`conversation:${conversationId}`, {});
    this.conversationChannels.set(conversationId, channel);

    const convEvents = [
      "new_message",
      "typing",
      "typing_indicator",
      "presence_state",
      "presence_diff",
      "recent_messages",
      "member_added",
      "member_removed",
      "conversation_title_changed",
      "message_deleted",
    ];

    for (const event of convEvents) {
      channel.on(event, (payload: Record<string, unknown>) => {
        this.emit(`conv:${event}`, { ...payload, _conversationId: conversationId });
      });
    }

    channel
      .join()
      .receive("ok", () => {
        this.emit("conversation_joined", { conversationId });
      })
      .receive("error", (resp: Record<string, unknown>) => {
        console.warn(`[ws] Failed to join conversation:${conversationId}`, resp);
        this.conversationChannels.delete(conversationId);
      });
  }

  leaveConversation(conversationId: string) {
    const channel = this.conversationChannels.get(conversationId);
    if (!channel) return;
    channel.leave();
    this.conversationChannels.delete(conversationId);
  }

  // --- Send actions ---

  sendMessage(
    conversationId: string,
    content: string,
    options?: {
      contentType?: string;
      metadata?: Record<string, unknown>;
      parentMessageId?: string;
    }
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const channel = this.conversationChannels.get(conversationId);
      if (!channel) return reject(new Error("Not joined to conversation"));

      channel
        .push("new_message", {
          content,
          content_type: options?.contentType ?? "text",
          metadata: options?.metadata ?? {},
          parent_message_id: options?.parentMessageId,
        })
        .receive("ok", resolve)
        .receive("error", reject)
        .receive("timeout", () => reject(new Error("Message send timeout")));
    });
  }

  sendTyping(conversationId: string) {
    const channel = this.conversationChannels.get(conversationId);
    if (!channel) return;
    channel.push("typing", {});
  }

  markConversationRead(conversationId: string): boolean {
    const channel = this.conversationChannels.get(conversationId);
    if (!channel) return false;
    channel
      .push("mark_conversation_read", {})
      .receive("error", (resp) =>
        console.warn("[ws] mark_conversation_read error", { conversationId, resp })
      )
      .receive("timeout", () =>
        console.warn("[ws] mark_conversation_read timeout", { conversationId })
      );
    return true;
  }

  // --- Event bus ---

  on(event: string, handler: EventHandler) {
    if (!this.globalHandlers.has(event)) {
      this.globalHandlers.set(event, new Set());
    }
    this.globalHandlers.get(event)!.add(handler);
    return () => {
      this.globalHandlers.get(event)?.delete(handler);
    };
  }

  private emit(event: string, payload: Record<string, unknown>) {
    this.globalHandlers.get(event)?.forEach((handler) => handler(payload));
  }

  isConnected() {
    return this.socket?.isConnected() ?? false;
  }
}

export const ws = new WebSocketService();
