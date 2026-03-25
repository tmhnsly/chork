import PocketBase from "pocketbase";
import type { TypedPocketBase, UsersResponse } from "./pocketbase-types";

export const cookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
};

/** Extract a typed UsersResponse from pb.authStore.record */
export function getAuthUser(pb: PocketBase): UsersResponse | null {
  if (pb.authStore.isValid && pb.authStore.record) {
    return pb.authStore.record as unknown as UsersResponse;
  }
  return null;
}

let pb: TypedPocketBase | null = null;

export function getClientPB(): TypedPocketBase {
  if (pb) return pb;

  pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL) as TypedPocketBase;

  if (typeof document !== "undefined") {
    pb.authStore.loadFromCookie(document.cookie);
  }

  pb.authStore.onChange(() => {
    if (typeof document !== "undefined") {
      document.cookie = pb!.authStore.exportToCookie(cookieOptions);
    }
  });

  return pb;
}
