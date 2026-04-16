import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Profile - Chork",
};

export default async function ProfilePage() {
  const supabase = await createServerSupabase();
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  redirect(`/u/${profile.username}`);
}
