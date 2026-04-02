import "server-only";

import PocketBase from "pocketbase";
import { cookies } from "next/headers";
import type { TypedPocketBase } from "./pocketbase-types";

export function createServerPB(cookieString: string): TypedPocketBase {
  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL) as TypedPocketBase;
  pb.authStore.loadFromCookie(cookieString);
  return pb;
}

export async function createServerPBFromCookies(): Promise<TypedPocketBase> {
  const cookieStore = await cookies();
  const cookieString = cookieStore.toString();
  return createServerPB(cookieString);
}

/**
 * Cached admin PB instance — reused across requests within the same
 * server process to avoid re-authenticating on every call.
 * Used for operations that need to bypass collection API rules
 * (e.g. incrementing likes on another user's comment).
 */
let _adminPB: TypedPocketBase | null = null;

export async function createAdminPB(): Promise<TypedPocketBase> {
  if (_adminPB?.authStore.isValid) return _adminPB;

  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL) as TypedPocketBase;
  await pb.collection("_superusers").authWithPassword(
    process.env.PB_TYPEGEN_EMAIL!,
    process.env.PB_TYPEGEN_PASSWORD!
  );
  _adminPB = pb;
  return pb;
}
