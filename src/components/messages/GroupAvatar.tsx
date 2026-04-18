import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot } from "lucide-react";
import { getInitials } from "../../lib/utils";
import type { ConversationMember } from "../../lib/api";

interface Props {
  members: ConversationMember[];
  size?: number;
}

/**
 * Avatar treatment for multi-member conversations.
 *  - 0 members: placeholder
 *  - 1 member : single avatar
 *  - 2 members: two overlapping circles (top-left + bottom-right)
 *  - 3+      : 2x2 grid with a "+N" overflow tile bottom-right
 */
export function GroupAvatar({ members, size = 40 }: Props) {
  const count = members.length;

  if (count === 0) {
    return (
      <Avatar style={{ width: size, height: size }}>
        <AvatarFallback className="text-xs">?</AvatarFallback>
      </Avatar>
    );
  }

  if (count === 1) {
    const m = members[0]!;
    return (
      <Avatar style={{ width: size, height: size }}>
        {m.participant?.avatarUrl && <AvatarImage src={m.participant.avatarUrl} />}
        <AvatarFallback className="text-[9px]">
          {m.participant?.type === "agent" ? (
            <Bot className="h-3 w-3" />
          ) : (
            getInitials(m.participant?.displayName)
          )}
        </AvatarFallback>
      </Avatar>
    );
  }

  if (count === 2) {
    const small = Math.round(size * 0.62);
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <div className="absolute left-0 top-0 rounded-full border-2 border-card">
          <Avatar style={{ width: small, height: small }}>
            {members[0]!.participant?.avatarUrl && (
              <AvatarImage src={members[0]!.participant!.avatarUrl} />
            )}
            <AvatarFallback className="text-[8px]">
              {members[0]!.participant?.type === "agent" ? (
                <Bot className="h-2.5 w-2.5" />
              ) : (
                getInitials(members[0]!.participant?.displayName)
              )}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="absolute bottom-0 right-0 z-10 rounded-full border-2 border-card">
          <Avatar style={{ width: small, height: small }}>
            {members[1]!.participant?.avatarUrl && (
              <AvatarImage src={members[1]!.participant!.avatarUrl} />
            )}
            <AvatarFallback className="text-[8px]">
              {members[1]!.participant?.type === "agent" ? (
                <Bot className="h-2.5 w-2.5" />
              ) : (
                getInitials(members[1]!.participant?.displayName)
              )}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    );
  }

  const cell = Math.round((size - 2) / 2);
  const overflow = count - 3;
  const shown = members.slice(0, 3);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute left-0 top-0 rounded-full border border-card">
        <Avatar style={{ width: cell, height: cell }}>
          {shown[0]!.participant?.avatarUrl && (
            <AvatarImage src={shown[0]!.participant!.avatarUrl} />
          )}
          <AvatarFallback className="text-[7px]">
            {shown[0]!.participant?.type === "agent" ? (
              <Bot className="h-2 w-2" />
            ) : (
              getInitials(shown[0]!.participant?.displayName)
            )}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="absolute right-0 top-0 z-10 rounded-full border border-card">
        <Avatar style={{ width: cell, height: cell }}>
          {shown[1]!.participant?.avatarUrl && (
            <AvatarImage src={shown[1]!.participant!.avatarUrl} />
          )}
          <AvatarFallback className="text-[7px]">
            {shown[1]!.participant?.type === "agent" ? (
              <Bot className="h-2 w-2" />
            ) : (
              getInitials(shown[1]!.participant?.displayName)
            )}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="absolute bottom-0 left-0 z-20 rounded-full border border-card">
        <Avatar style={{ width: cell, height: cell }}>
          {shown[2]!.participant?.avatarUrl && (
            <AvatarImage src={shown[2]!.participant!.avatarUrl} />
          )}
          <AvatarFallback className="text-[7px]">
            {shown[2]!.participant?.type === "agent" ? (
              <Bot className="h-2 w-2" />
            ) : (
              getInitials(shown[2]!.participant?.displayName)
            )}
          </AvatarFallback>
        </Avatar>
      </div>
      {overflow > 0 && (
        <div
          className="absolute bottom-0 right-0 z-30 flex items-center justify-center rounded-full border border-card bg-muted"
          style={{ width: cell, height: cell }}
        >
          <span className="text-[8px] font-bold text-muted-foreground">+{overflow}</span>
        </div>
      )}
    </div>
  );
}
