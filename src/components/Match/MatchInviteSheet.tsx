"use client";

import { BottomSheet, SheetBody } from "@/components/ui";
import type { Match } from "@/lib/data/match-types";
import { MatchJoinPanel } from "./MatchJoinPanel";

interface Props {
  match: Match;
  isHost: boolean;
  onInviteFriends: () => void;
  onAddGuest: () => void;
  onClose: () => void;
}

/** The lobby's join card, as a sheet, once the match is under way. */
export function MatchInviteSheet({ match, isHost, onInviteFriends, onAddGuest, onClose }: Props) {
  return (
    <BottomSheet open onClose={onClose} title="Invite">
      <SheetBody>
        <MatchJoinPanel
          match={match}
          isHost={isHost}
          onInviteFriends={onInviteFriends}
          onAddGuest={onAddGuest}
        />
      </SheetBody>
    </BottomSheet>
  );
}
