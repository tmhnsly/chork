import { notFound, redirect } from "next/navigation";
import { requireGymAdmin } from "@/lib/auth";
import {
  getAllSetsForAdminGym,
  getAdminRoutesForSet,
  getRouteTags,
} from "@/lib/data/admin-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import { PageHeader } from "@/components/motion";
import { RoutesAdmin } from "@/components/admin/RoutesAdmin";
import styles from "./routes.module.scss";

export const metadata = {
  title: "Routes - Admin - Chork",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminRoutesPage({ params }: Props) {
  const { id: setId } = await params;
  const auth = await requireGymAdmin();
  if ("error" in auth) redirect("/");
  const { supabase, gymId } = auth;

  // Pull the full set record so we can render the set label + confirm
  // the set belongs to the caller's gym. We already have the list of
  // gym sets cached on the admin-queries layer; reuse it.
  const sets = await getAllSetsForAdminGym(supabase, gymId);
  const set = sets.find((s) => s.id === setId);
  if (!set) notFound();

  const [routes, tags] = await Promise.all([
    getAdminRoutesForSet(supabase, setId),
    getRouteTags(supabase),
  ]);

  return (
    <main className={styles.page}>
      <PageHeader title="Routes" subtitle={formatSetLabel(set)} />
      <RoutesAdmin setId={setId} initialRoutes={routes} tags={tags} />
    </main>
  );
}
