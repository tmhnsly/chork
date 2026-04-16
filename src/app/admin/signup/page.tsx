import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
import { GymSignupForm } from "@/components/admin/GymSignupForm";
import styles from "./signup.module.scss";

export const metadata = {
  title: "Start a gym on Chork",
};

/**
 * Gym admin onboarding. Distinct from climber onboarding — collects
 * gym metadata and seats the signing-up user as owner of the new gym.
 * Signed-out visitors are bounced to /login with a redirect back here;
 * existing admins are sent straight to the dashboard.
 */
export default async function AdminSignupPage() {
  const supabase = await createServerSupabase();
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/signup");

  // If they already admin a gym, skip the signup.
  const { data: existing } = await supabase
    .from("gym_admins")
    .select("gym_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existing?.gym_id) redirect("/admin");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Start a gym on Chork</h1>
        <p className={styles.body}>
          Get your gym set up in a couple of minutes. You can invite more
          admins and route setters from your dashboard afterwards.
        </p>
      </header>
      <GymSignupForm />
    </main>
  );
}
