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
