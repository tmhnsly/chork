import "server-only";

/**
 * Shared shape + validation primitives for every admin server action.
 * Kept in a non-"use server" module so the action files can pull
 * `ActionResult` / `SLUG_RE` / `EMAIL_RE` without each one becoming
 * an exported server endpoint.
 */

export type ActionResult<T = unknown> = { error: string } | ({ success: true } & T);

// Slugs: lowercase letters, digits, single hyphens. Matches the same
// shape the app already uses for gym slugs (see migration 001).
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
