"use client";

import { useState, useTransition, useEffect } from "react";
import { FaUserPlus, FaCheck } from "react-icons/fa6";
import { SearchField, Button, showToast } from "@/components/ui";
import { useDebouncedFlush } from "@/hooks/use-debounced-flush";
import { ClimberRow } from "@/components/ui/ClimberRow/ClimberRow";
import {
  searchClimbers,
  requestFriend,
  respondToFriend,
  type ClimberSearchHit,
} from "@/app/friends/actions";
import styles from "./friendSearch.module.scss";

/**
 * Find a climber by handle or name.
 *
 * Suggestions are for people the app thinks you know; this is for the
 * person you KNOW you know and cannot find on the list. Typing is
 * debounced and the request is server-side, so a keystroke is not a
 * round-trip and the fuzzy matching (typos, partial names) happens in
 * Postgres where the trigram index is.
 *
 * Every hit carries how you already stand with them, so a friend
 * shows "Friends", a pending ask shows "Sent", and only a stranger
 * gets an Add button. Search's job is lookup — finding someone you
 * already know is a valid answer — where suggestions' job is
 * discovery, and exclude linked people for that reason.
 */
export function FriendSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClimberSearchHit[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [acting, startAct] = useTransition();
  const [acted, setActed] = useState<Record<string, string>>({});

  // Debounced so a name typed at speed costs one request, and flushed
  // on unmount so navigating away mid-type does not leave a stale
  // request landing on a page that is gone.
  const { schedule } = useDebouncedFlush<string>({
    delayMs: 250,
    flush: (q) => {
      startSearch(async () => {
        if (q.trim().length < 2) {
          setHits(null);
          return;
        }
        const r = await searchClimbers(q);
        if ("error" in r) {
          showToast(r.error, "error");
          return;
        }
        setHits(r.hits);
      });
    },
  });

  useEffect(() => {
    schedule(query);
  }, [query, schedule]);

  function add(hit: ClimberSearchHit) {
    startAct(async () => {
      const r = await requestFriend(hit.user_id);
      if ("error" in r) return showToast(r.error, "error");
      // Reads as sent whatever the RPC did — a `declined` row means
      // they declined you and must not learn that from a toast.
      setActed((prev) => ({ ...prev, [hit.user_id]: "Sent" }));
    });
  }

  const trimmed = query.trim();
  const showResults = trimmed.length >= 2 && hits !== null;

  return (
    <section className={styles.section} aria-label="Find a climber">
      <SearchField
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a climber by name"
        ariaLabel="Find a climber by name"
        autoComplete="off"
      />

      {showResults && (
        <ul className={styles.list} aria-busy={searching}>
          {hits.length === 0 && !searching && (
            <li className={styles.empty}>
              Nobody called &ldquo;{trimmed}&rdquo; — or they&rsquo;ve
              turned off friend requests.
            </li>
          )}
          {hits.map((hit) => {
            const note =
              acted[hit.user_id]
              ?? (hit.friend_status === "friends"
                ? "Friends"
                : hit.friend_status === "sent"
                  ? "Sent"
                  : undefined);
            return (
              <li key={hit.user_id}>
                <ClimberRow
                  climber={hit}
                  note={note}
                  actions={
                    note ? null : hit.friend_status === "received" ? (
                      // They already asked YOU — accepting is the action.
                      <AcceptFromSearch hit={hit} onDone={() =>
                        setActed((p) => ({ ...p, [hit.user_id]: "Friends" }))
                      } />
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => add(hit)}
                        disabled={acting}
                        aria-label={`Add @${hit.username}`}
                      >
                        <FaUserPlus aria-hidden /> Add
                      </Button>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Accept needs the friends ROW id and search hits carry only the
 * status, so this resolves it on tap via `friend_status` rather than
 * making every search result pay for a lookup it will not use.
 */
function AcceptFromSearch({
  hit,
  onDone,
}: {
  hit: ClimberSearchHit;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      onClick={() =>
        start(async () => {
          const { getFriendStatusAction } = await import("@/app/friends/actions");
          const s = await getFriendStatusAction(hit.user_id);
          if ("error" in s || !s.friendId) {
            showToast("Couldn't find that request — try from the list above.", "error");
            return;
          }
          const r = await respondToFriend(s.friendId, true);
          if ("error" in r) return showToast(r.error, "error");
          onDone();
        })
      }
      disabled={pending}
      aria-label={`Accept @${hit.username}`}
    >
      <FaCheck aria-hidden /> Accept
    </Button>
  );
}
