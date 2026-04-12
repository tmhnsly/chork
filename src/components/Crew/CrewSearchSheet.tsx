"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import {
  FaMagnifyingGlass,
  FaEllipsisVertical,
  FaUserPlus,
  FaBan,
  FaPlus,
  FaCheck,
} from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { UserAvatar, shimmerStyles, showToast } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  searchClimbersForInvite,
  type UserSearchResult,
  type Crew,
} from "@/lib/data/crew-queries";
import { blockUser, inviteToCrew } from "@/app/crew/actions";
import styles from "./crewSearchSheet.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  myCrews: Crew[];
  onCreateCrew: () => void;
}

/**
 * Global climber search + invite flow. Typing into the search field
 * queries profiles by handle or display name; each result exposes an
 * "Invite to crew" action that opens a second-level sheet to pick
 * which crew the invite is for.
 */
export function CrewSearchSheet({ open, onClose, myCrews, onCreateCrew }: Props) {
  const { profile } = useAuth();
  const currentUserId = profile?.id ?? "";

  const [query, setQuery] = useState("");
  const [activeTarget, setActiveTarget] = useState<UserSearchResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Keyed cache — tagging rows with the query they belong to lets us
  // derive the loading state from a mismatch instead of calling
  // setResults(null) inside the effect (Next 15 set-state-in-effect).
  const [cache, setCache] = useState<{
    key: string;
    rows: UserSearchResult[];
  } | null>(null);

  const q = query.trim();
  const queryKey = q.length >= 2 ? q : "";
  const results = queryKey && cache?.key === queryKey ? cache.rows : null;

  // Debounced search — fire 250ms after the last keystroke. Queries
  // under 2 chars never fire; the component renders its "start typing"
  // empty state via queryKey === "".
  useEffect(() => {
    if (!open || !queryKey) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const supabase = createBrowserSupabase();
      const rows = await searchClimbersForInvite(supabase, queryKey, currentUserId);
      if (!cancelled) setCache({ key: queryKey, rows });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, queryKey, currentUserId]);

  function handleBlock(target: UserSearchResult) {
    startTransition(async () => {
      const res = await blockUser(target.user_id);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      // Evict from the keyed cache so they disappear from the UI now —
      // the next query would re-filter anyway, but we don't want a
      // stale list staring back at the user while they type.
      setCache((prev) =>
        prev
          ? { ...prev, rows: prev.rows.filter((r) => r.user_id !== target.user_id) }
          : prev
      );
      showToast(`Blocked @${target.username}`, "info");
    });
  }

  const emptyState = useMemo(() => {
    if (query.trim().length < 2) return "Start typing a handle or name.";
    if (results !== null && results.length === 0) return "No climbers match that search.";
    return null;
  }, [query, results]);

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title="Find climbers"
        description="Search climbers to invite to a crew"
      >
        <div className={styles.body}>
          <h2 className={styles.heading}>Find climbers</h2>

          <div className={styles.searchWrap}>
            <FaMagnifyingGlass className={styles.searchIcon} aria-hidden />
            <input
              type="search"
              className={styles.search}
              placeholder="Handle or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {results === null && query.trim().length >= 2 ? (
            <ul className={styles.list} aria-busy="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className={`${styles.row} ${shimmerStyles.skeleton}`} />
              ))}
            </ul>
          ) : emptyState ? (
            <p className={styles.empty}>{emptyState}</p>
          ) : (
            <ul className={styles.list}>
              {results!.map((r) => (
                <ResultRow
                  key={r.user_id}
                  result={r}
                  pending={pending}
                  onInvite={() => setActiveTarget(r)}
                  onBlock={() => handleBlock(r)}
                />
              ))}
            </ul>
          )}
        </div>
      </BottomSheet>

      {activeTarget && (
        <CrewPickerSheet
          target={activeTarget}
          myCrews={myCrews}
          onClose={() => setActiveTarget(null)}
          onCreateCrew={onCreateCrew}
          onSent={() => {
            setActiveTarget(null);
            setCache((prev) =>
              prev
                ? {
                    ...prev,
                    rows: prev.rows.map((r) =>
                      r.user_id === activeTarget.user_id
                        ? { ...r, has_pending_invite: true }
                        : r
                    ),
                  }
                : prev
            );
          }}
        />
      )}
    </>
  );
}

// ── Single result row ───────────────────────────────────────
function ResultRow({
  result,
  pending,
  onInvite,
  onBlock,
}: {
  result: UserSearchResult;
  pending: boolean;
  onInvite: () => void;
  onBlock: () => void;
}) {
  const actionLabel = result.has_pending_invite
    ? "Pending invite"
    : result.shares_crew
      ? "In a crew with you"
      : "Invite to crew";
  const actionDisabled = result.has_pending_invite || result.shares_crew || pending;

  return (
    <li className={styles.row}>
      <UserAvatar
        user={{
          id: result.user_id,
          username: result.username,
          name: result.name,
          avatar_url: result.avatar_url,
        }}
        size={40}
      />
      <div className={styles.rowText}>
        <span className={styles.rowName}>@{result.username}</span>
        {result.name && <span className={styles.rowSub}>{result.name}</span>}
        {result.active_gym_name && (
          <span className={styles.rowGym}>{result.active_gym_name}</span>
        )}
      </div>
      <div className={styles.rowActions}>
        <button
          type="button"
          className={`${styles.inviteBtn} ${actionDisabled ? styles.inviteBtnDisabled : ""}`}
          onClick={onInvite}
          disabled={actionDisabled}
        >
          {result.has_pending_invite ? (
            <>
              <FaCheck aria-hidden /> {actionLabel}
            </>
          ) : (
            <>
              <FaUserPlus aria-hidden /> {actionLabel}
            </>
          )}
        </button>

        <Primitive.Root>
          <Primitive.Trigger asChild>
            <button
              type="button"
              className={styles.menuTrigger}
              aria-label="More actions"
            >
              <FaEllipsisVertical />
            </button>
          </Primitive.Trigger>
          <Primitive.Portal>
            <Primitive.Content className={styles.menuContent} align="end" sideOffset={8}>
              <Primitive.Item
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onSelect={onBlock}
              >
                <FaBan aria-hidden /> Block @{result.username}
              </Primitive.Item>
            </Primitive.Content>
          </Primitive.Portal>
        </Primitive.Root>
      </div>
    </li>
  );
}

// ── Second-level sheet: pick which crew to invite into ─────
function CrewPickerSheet({
  target,
  myCrews,
  onClose,
  onCreateCrew,
  onSent,
}: {
  target: UserSearchResult;
  myCrews: Crew[];
  onClose: () => void;
  onCreateCrew: () => void;
  onSent: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [workingId, setWorkingId] = useState<string | null>(null);

  function handlePickCrew(crew: Crew) {
    setWorkingId(crew.id);
    startTransition(async () => {
      const res = await inviteToCrew(crew.id, target.user_id);
      setWorkingId(null);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast(`Invited @${target.username} to ${crew.name}`, "success");
      onSent();
    });
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Invite @${target.username}`}
      description="Pick a crew to add them to"
    >
      <div className={styles.pickerBody}>
        <h2 className={styles.heading}>Invite @{target.username}</h2>
        <p className={styles.pickerSub}>Pick a crew to add them to.</p>

        {myCrews.length === 0 ? (
          <p className={styles.empty}>You aren&apos;t in any crews yet — create one.</p>
        ) : (
          <ul className={styles.pickerList}>
            {myCrews.map((crew) => (
              <li key={crew.id}>
                <button
                  type="button"
                  className={styles.pickerRow}
                  onClick={() => handlePickCrew(crew)}
                  disabled={pending}
                >
                  <span className={styles.pickerName}>{crew.name}</span>
                  <span className={styles.pickerMeta}>
                    {crew.member_count} member{crew.member_count === 1 ? "" : "s"}
                  </span>
                  {workingId === crew.id && (
                    <span className={styles.pickerSpinner} aria-label="Sending" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className={styles.createBtn}
          onClick={onCreateCrew}
          disabled={pending}
        >
          <FaPlus aria-hidden /> Create a new crew
        </button>
      </div>
    </BottomSheet>
  );
}
