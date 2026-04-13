"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { ClimberSearch } from "./ClimberSearch";
import type { Crew } from "@/lib/data/crew-queries";

interface Props {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  myCrews: Crew[];
  onCreateCrew: () => void;
}

/**
 * Panel-flavoured wrapper around `ClimberSearch`. Used by flows that
 * want the invite UI as a modal — e.g. the "add people" step when
 * creating a new crew. The Crew home uses `ClimberSearch` inline on
 * the page itself, so there's no indirection through a sheet.
 */
export function CrewSearchSheet({ open, onClose, currentUserId, myCrews, onCreateCrew }: Props) {
  if (!open) return null;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Find climbers"
      description="Search climbers to invite to a crew"
    >
      <ClimberSearch
        currentUserId={currentUserId}
        myCrews={myCrews}
        onCreateCrew={onCreateCrew}
        autoFocus
      />
    </BottomSheet>
  );
}
