import PocketBase from "pocketbase";
import type { TypedPocketBase } from "./pocketbase-types";
import { cookieOptions } from "./cookie-config";

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
