import { notFound, redirect } from "next/navigation";
import { requireAdminOfSet } from "@/lib/auth";
import {
  getSetForAdmin,
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

  // Same rule as the edit page: authorise against the set's own gym
  // so an admin of more than one gym can reach all of their sets.
  const gate = await requireAdminOfSet(setId);
  if ("error" in gate) {
    if (gate.reason === "forbidden") redirect("/");
    notFound();
  }

  const [set, routes, tags] = await Promise.all([
    getSetForAdmin(gate.auth.supabase, setId),
    getAdminRoutesForSet(gate.auth.supabase, setId),
    getRouteTags(gate.auth.supabase),
  ]);
  if (!set) notFound();

  return (
    <main className={styles.page}>
      <PageHeader title="Routes" subtitle={formatSetLabel(set)} />
      <RoutesAdmin setId={setId} initialRoutes={routes} tags={tags} />
    </main>
  );
}
