import { Fragment } from "react";
import { usernameChunks } from "@/lib/data/username-display";

interface Props {
  /** The handle, without a leading `@`. */
  username: string;
  className?: string;
}

/**
 * A climber's handle, rendered so it wraps at sensible places.
 *
 * Every surface writes `@{username}` inline, which is fine until the
 * column is narrow: CSS has no line-break opportunity at an
 * underscore, so `@emil_brokenberger` is one unbreakable word and the
 * browser either overflows it or — under `overflow-wrap: anywhere` —
 * splits wherever the edge lands. The podium rendered
 * "@EMIL_BROKENBERG / ER".
 *
 * This emits a `<wbr>` between chunks so the break falls after an
 * underscore, where a human would put it, and whole words stay whole.
 * `<wbr>` is inert when the text fits, so wide layouts are unchanged.
 *
 * The `@` is bound to the first chunk rather than standing alone, so
 * it can never be orphaned on its own line.
 *
 * Callers keep their own class — this replaces the `<span>` they were
 * already wrapping the handle in, rather than adding another element.
 */
export function Username({ username, className }: Props) {
  const chunks = usernameChunks(username);

  return (
    <span className={className}>
      @
      {chunks.map((chunk, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {chunk}
        </Fragment>
      ))}
    </span>
  );
}
