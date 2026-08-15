import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader } from "@/components/motion";
import { JoinMatchForm } from "@/components/Match/JoinMatchForm";
import styles from "./join.module.scss";

export const metadata = {
  title: "Join a match",
};

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function JoinMatchPage({ searchParams }: Props) {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  const { code } = await searchParams;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Join a match"
        subtitle="Enter the six-character code or scan a QR."
      />
      <JoinMatchForm initialCode={code ?? null} />
    </main>
  );
}
