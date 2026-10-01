import type { ReactNode } from "react";
import styles from "./tileGrid.module.scss";

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * The four-column grid the wall's Card, a game's screen and the
 * marketing device lay their `SendGridTile`s in. (The climber and
 * player peek sheets keep their own denser grids.)
 */
export function TileGrid({ children, className }: Props) {
  return <div className={[styles.grid, className].filter(Boolean).join(" ")}>{children}</div>;
}
