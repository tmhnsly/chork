import { redirect } from "next/navigation";
import { createServerPBFromCookies } from "@/lib/pocketbase-server";
import { getAuthUser } from "@/lib/pocketbase";

export const metadata = {
  title: "Profile — Chork",
};

export default async function ProfilePage() {
  const pb = await createServerPBFromCookies();
  const user = getAuthUser(pb);

  if (!user) {
    redirect("/login");
  }

  redirect(`/u/${user.username}`);
}
