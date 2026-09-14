"use client";

import { FaPlus, FaPaperPlane } from "react-icons/fa6";
import { Button, UserAvatar, Username } from "@/components/ui";
import type { Match, MatchPlayerView } from "@/lib/data/match-types";
import { ownerIdOf } from "@/lib/data/match-types";
import { MatchJoinPanel } from "./MatchJoinPanel";
import styles from "./matchLobby.module.scss";

interface Props {
  match: Match;
  players: MatchPlayerView[];
  isHost: boolean;
  isChork: boolean;
  onAddRoute: () => void;
  onInviteFriends: () => void;
  onAddGuest: () => void;
}

/**
 * A live match with no routes yet. The setup screen, in the place
 * the match happens: the code and QR so people can get in, the
 * players as they arrive, and one thing to do next. Nobody fills a
 * form to get here — see the spec.
 */
export function MatchLobby({
  match,
  players,
  isHost,
  isChork,
  onAddRoute,
  onInviteFriends,
  onAddGuest,
}: Props) {
  return (
    <div className={styles.lobby}>
      <section className={styles.card} aria-label="Join">
        <MatchJoinPanel
          match={match}
          isHost={isHost}
          onInviteFriends={onInviteFriends}
          onAddGuest={onAddGuest}
        />
      </section>

      <section className={styles.card} aria-label="Players">
        <h2 className={styles.heading}>Players</h2>
        <ul className={styles.players}>
          {players.map((p) => (
            <li key={p.player_id} className={styles.player}>
              <UserAvatar
                user={{
                  id: ownerIdOf(p),
                  username: p.username ?? "guest",
                  name: p.display_name ?? "",
                  avatar_url: p.avatar_url ?? "",
                }}
                size="row"
              />
              <span className={styles.playerName}>
                {p.is_guest || !p.username ? (
                  p.display_name ?? "Guest"
                ) : (
                  <Username username={p.username} />
                )}
              </span>
              {p.is_host && <span className={styles.tag}>Host</span>}
              {p.is_guest && <span className={styles.tag}>Guest</span>}
            </li>
          ))}
        </ul>
        {players.length < 2 && (
          <p className={styles.waiting}>Waiting for players — share the code.</p>
        )}
      </section>

      <Button type="button" onClick={onAddRoute} fullWidth>
        <FaPlus aria-hidden /> {isChork ? "Set the first challenge" : "Add the first route"}
      </Button>
      <Button type="button" variant="secondary" onClick={onInviteFriends} fullWidth>
        <FaPaperPlane aria-hidden /> Invite friends
      </Button>
    </div>
  );
}
