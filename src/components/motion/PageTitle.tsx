"use client";

import { RevealText } from "./RevealText";

interface Props {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3";
}

/**
 * Thin wrapper around RevealText for use in server components.
 * Import this instead of RevealText when you need a title in an RSC page.
 */
export function PageTitle({ text, className, as = "h1" }: Props) {
  return <RevealText text={text} className={className} as={as} />;
}
