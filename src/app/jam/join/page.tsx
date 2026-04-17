import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { PageHeader } from "@/components/motion";
import { JoinJamForm } from "@/components/Jam/JoinJamForm";
import styles from "./join.module.scss";

export const metadata = {
  title: "Join a jam - Chork",
};

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function JoinJamPage({ searchParams }: Props) {
  const auth = await requireSignedIn();
  if ("error" in auth) redirect("/login");

  const { code } = await searchParams;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Join a jam"
        subtitle="Enter the six-character code or scan a QR."
      />
      <JoinJamForm initialCode={code ?? null} />
    </main>
  );
}
