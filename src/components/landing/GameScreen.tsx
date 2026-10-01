"use client";

import { TileGrid, UserAvatar } from "@/components/ui";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { countOf } from "@/lib/plural";
import { GAME, YOU } from "./fixtures";
import { gameScreenAt } from "./screens/gameScreen";
import { BoardRows } from "./BoardRows";
import styles from "./gameScreen.module.scss";

interface Props {
  step: number;
}

const noop = () => {};

/** A game on the device: who's in, the routes, and the board. */
export function GameScreen({ step }: Props) {
  const { tiles, rows } = gameScreenAt(step);
  return (
    <div className={styles.game}>
      <header>
        <h2 className={styles.title}>{GAME.name}</h2>
        <div className={styles.players}>
          <span className={styles.stack} aria-hidden>
            {GAME.players.slice(0, 4).map((p) => (
              <UserAvatar key={p.id} user={{ id: p.id, username: p.username, name: p.name, avatar_url: p.avatar_url }} size="stack" />
            ))}
          </span>
          <span className={styles.playersCount}>
            {countOf(GAME.players.length, "player")} · {GAME.location}
          </span>
        </div>
      </header>
      <TileGrid>
        {tiles.map((t) => (
          <SendGridTile key={t.number} number={t.number} state={t.state} gradeLabel={t.gradeLabel} onClick={noop} />
        ))}
      </TileGrid>
      <BoardRows rows={rows} youId={YOU.id} />
    </div>
  );
}
