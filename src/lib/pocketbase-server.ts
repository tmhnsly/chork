import "server-only";

import { cache } from "react";
import PocketBase from "pocketbase";
import { cookies } from "next/headers";
import type { TypedPocketBase } from "./pocketbase-types";

// Validate required env vars at module load — fail fast with a clear message
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const ADMIN_EMAIL = process.env.PB_TYPEGEN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_TYPEGEN_PASSWORD;

if (!PB_URL) {
  throw new Error("[chork] NEXT_PUBLIC_POCKETBASE_URL is not set");
}

export function createServerPB(cookieString: string): TypedPocketBase {
  const pb = new PocketBase(PB_URL) as TypedPocketBase;
  pb.authStore.loadFromCookie(cookieString);
  return pb;
}

/**
 * Get a PB instance authenticated from request cookies.
 * Wrapped in React cache() — within a single RSC render, multiple
 * calls return the same instance instead of creating a new one each time.
 * This deduplicates across query functions called in the same render.
 */
export const createServerPBFromCookies = cache(
  async (): Promise<TypedPocketBase> => {
    const cookieStore = await cookies();
    const cookieString = cookieStore.toString();
    return createServerPB(cookieString);
  }
);

/**
 * Cached admin PB instance — reused across requests within the same
 * server process. Re-authenticates automatically if the session expires.
 */
let _adminPB: TypedPocketBase | null = null;
let _adminPBPromise: Promise<TypedPocketBase> | null = null;

async function authenticateAdmin(): Promise<TypedPocketBase> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "[chork] PB_TYPEGEN_EMAIL and PB_TYPEGEN_PASSWORD must be set for admin operations"
    );
  }
  const pb = new PocketBase(PB_URL) as TypedPocketBase;
  await pb.collection("_superusers").authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  _adminPB = pb;
  return pb;
}

/**
 * Get the cached admin PB instance. Concurrent callers await the same
 * in-flight auth promise — prevents duplicate sessions under parallel requests.
 */
export async function createAdminPB(): Promise<TypedPocketBase> {
  if (_adminPB?.authStore.isValid) return _adminPB;
  if (!_adminPBPromise) {
    _adminPBPromise = authenticateAdmin().finally(() => {
      _adminPBPromise = null;
    });
  }
  return _adminPBPromise;
}

/** Clear the cached admin PB so the next call re-authenticates. */
export function clearAdminPB(): void {
  _adminPB = null;
  _adminPBPromise = null;
}
