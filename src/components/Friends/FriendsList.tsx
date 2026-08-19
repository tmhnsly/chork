"use client";

import { useState, useTransition } from "react";
import { FaUserPlus, FaCheck, FaXmark, FaUserGroup } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import { suggestionReason, type Friend, type FriendSuggestion } from "@/lib/data/friend-queries";
import type { ActionResult } from "@/lib/action-result";
import { countOf } from "@/lib/plural";
import { requestFriend, respondToFriend } from "@/app/friends/actions";
import { ClimberRow } from "@/components/ui/ClimberRow/ClimberRow";
import styles from "./friendsList.module.scss";

interface Props {
  active: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
  suggestions: FriendSuggestion[];
}

/**
 * The /friends surface.
 *
 * Order is deliberate: decisions first (someone is waiting on you),
 * then people you've climbed with who aren't linked yet, then the
 * friends you already have. Suggestions sit above the list rather than
 * below it because on a fresh account the list is empty and the
 * suggestions are the entire point — a crew's zero state was a hero
 * asking you to name a group before anything existed.
 */
export function FriendsList({ active, incoming, outgoing, suggestions }: Props) {
  const [pending, startTransition] = useTransition();
  // Rows the server hasn't caught up on yet. Keyed by the other
  // climber's id, which every one of these actions is scoped to.
  const [acted, setActed] = useState<Record<string, string>>({});

  function act(
    key: string,
    label: string,
    run: () => Promise<ActionResult<unknown>>,
  ) {
    startTransition(async () => {
      const result = await run();
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      setActed((prev) => ({ ...prev, [key]: label }));
    });
  }

  // Outgoing counts. Without it, sending your first request rendered
  // the "Waiting" row and "No friends yet" at the same time, which
  // reads as the request having failed.
  const hasAnything =
    active.length > 0
    || incoming.length > 0
    || outgoing.length > 0
    || suggestions.length > 0;

  return (
    <div className={styles.stack}>
      {incoming.length > 0 && (
        <section className={styles.section} aria-labelledby="friends-incoming">
          <h2 id="friends-incoming" className={styles.heading}>
            {countOf(incoming.length, "request")}
          </h2>
          <ul className={styles.list}>
            {incoming.map((m) => (
              <li key={m.friend_id}>
                <ClimberRow
                  climber={m}
                  note={acted[m.user_id]}
                  actions={
                    acted[m.user_id] ? null : (
                      <>
                        <Button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            act(m.user_id, "Friends", () =>
                              respondToFriend(m.friend_id, true),
                            )
                          }
                        >
                          <FaCheck aria-hidden /> Accept
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={pending}
                          aria-label={`Decline ${m.username ?? "this request"}`}
                          onClick={() =>
                            act(m.user_id, "Declined", () =>
                              respondToFriend(m.friend_id, false),
                            )
                          }
                        >
                          <FaXmark aria-hidden />
                        </Button>
                      </>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className={styles.section} aria-labelledby="friends-suggested">
          <h2 id="friends-suggested" className={styles.heading}>
            Climbed with you
          </h2>
          <p className={styles.hint}>
            From matches you&rsquo;ve shared. They have to accept.
          </p>
          <ul className={styles.list}>
            {suggestions.map((s) => (
              <li key={s.user_id}>
                <ClimberRow
                  climber={s}
                  meta={suggestionReason(s)}
                  note={acted[s.user_id]}
                  actions={
                    acted[s.user_id] ? null : (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          act(s.user_id, "Asked", () => requestFriend(s.user_id))
                        }
                      >
                        <FaUserPlus aria-hidden /> Add
                      </Button>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length > 0 && (
        <section className={styles.section} aria-labelledby="friends-active">
          <h2 id="friends-active" className={styles.heading}>
            {countOf(active.length, "friend")}
          </h2>
          <ul className={styles.list}>
            {active.map((m) => (
              <li key={m.friend_id}>
                <ClimberRow climber={m} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className={styles.section} aria-labelledby="friends-sent">
          <h2 id="friends-sent" className={styles.heading}>
            Waiting
          </h2>
          <ul className={styles.list}>
            {outgoing.map((m) => (
              <li key={m.friend_id}>
                <ClimberRow climber={m} note="Asked" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hasAnything && (
        <div className={styles.zero}>
          <FaUserGroup className={styles.zeroIcon} aria-hidden />
          <p className={styles.zeroTitle}>No friends yet</p>
          <p className={styles.zeroBody}>
            Run a match with someone and they&rsquo;ll show up here to add.
            No codes, no searching for handles.
          </p>
        </div>
      )}
    </div>
  );
}
