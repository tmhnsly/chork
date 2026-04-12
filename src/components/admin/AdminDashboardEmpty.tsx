import Link from "next/link";
import { FaPlus } from "react-icons/fa6";
import styles from "./adminDashboardEmpty.module.scss";

/**
 * Initial dashboard state for a freshly-onboarded gym admin: no live
 * set yet, one clear CTA to create their first set. Subsequent phases
 * replace this with the populated dashboard once a set exists.
 */
export function AdminDashboardEmpty() {
  return (
    <section className={styles.card} aria-labelledby="admin-empty-heading">
      <h2 id="admin-empty-heading" className={styles.heading}>
        Ready to set the first comp?
      </h2>
      <p className={styles.body}>
        Create your first set to give climbers something to log. You can
        save it as a draft and publish when the holds are on the wall.
      </p>
      <Link href="/admin/sets/new" className={styles.cta}>
        <FaPlus aria-hidden /> Create a set
      </Link>
    </section>
  );
}
