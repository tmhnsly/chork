import Link from "next/link";
import { FaArrowLeft, FaBolt } from "react-icons/fa6";
import { RevealText } from "@/components/motion";
import styles from "./not-found.module.scss";

export const metadata = {
  title: "Off the wall - Chork",
  description: "This route doesn't exist.",
};

/**
 * App-level 404. Rendered whenever `notFound()` is called in a server
 * component or the requested path matches no route. Mirrors the
 * climber-first tone of the rest of the app — "off the wall" reads
 * like a climber joke rather than an error code.
 *
 * Deliberately static and server-rendered so it's instant, and
 * deliberately not async — no auth checks, no DB calls, just a
 * punchy copy block and a way back.
 */
export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <span className={styles.code} aria-hidden>
          <span className={styles.codeDigit}>4</span>
          <span className={styles.codeBolt}>
            <FaBolt aria-hidden />
          </span>
          <span className={styles.codeDigit}>4</span>
        </span>

        <RevealText text="Off the wall" as="h1" className={styles.title} />
        <p className={styles.body}>
          This route doesn&apos;t exist. Either you&apos;ve sent an ancient link
          that&apos;s been archived, or somebody&apos;s mistyped the URL.
        </p>

        <Link href="/" className={styles.cta}>
          <FaArrowLeft aria-hidden /> Back to the wall
        </Link>
      </div>
    </main>
  );
}
