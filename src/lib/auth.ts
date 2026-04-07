import "server-only";
import { createServerPBFromCookies } from "./pocketbase-server";
import { getAuthUser } from "./pocketbase-shared";
import type { TypedPocketBase } from "./pocketbase-types";
export { cookieOptions } from "./cookie-config";

type AuthSuccess = { pb: TypedPocketBase; userId: string };
type AuthFailure = { error: string };

/**
 * Require authentication for a server action.
 * Validates the auth record shape via the runtime type guard.
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const pb = await createServerPBFromCookies();
  const user = getAuthUser(pb);
  if (!user) {
    return { error: "You need to be signed in to do that" };
  }
  return { pb, userId: user.id };
}
