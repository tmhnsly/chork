"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./adminNav.module.scss";

const LINKS = [
  { href: "/admin",              label: "Dashboard" },
  { href: "/admin/sets",         label: "Sets" },
  { href: "/admin/team",         label: "Team" },
  { href: "/admin/competitions", label: "Competitions" },
];

/** Gym-scoped sections. Competitions are organiser-scoped, so the
 *  gym choice is meaningless there and isn't carried onto that link. */
const GYM_SCOPED = ["/admin", "/admin/sets", "/admin/team"];

export interface AdminNavGym {
  id: string;
  name: string;
}

interface Props {
  /** Gyms this user admins. The switcher renders only when >1 —
   *  a single-gym admin has nothing to choose. */
  gyms: AdminNavGym[];
}

/**
 * Admin sub-nav rendered at the top of every admin surface. Client
 * component so the active state highlights without a round-trip.
 * Matches the segmented-control visual pattern used on the Chorkboard
 * for tab-style switching.
 *
 * Also owns which gym the gym-scoped pages are showing, via a `?gym=`
 * param. Explicit in the URL rather than a cookie or a profile column
 * so the choice is shareable, survives a hard refresh, and can't go
 * stale against the admin's actual gym list. A forged value is
 * harmless: every page re-verifies with `requireGymAdmin(gymId)`,
 * which checks the `gym_admins` row before trusting it.
 */
export function AdminNav({ gyms }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentGym = searchParams.get("gym");

  const withGym = (href: string) =>
    currentGym && GYM_SCOPED.includes(href)
      ? `${href}?gym=${currentGym}`
      : href;

  return (
    <div className={styles.bar}>
      <nav className={styles.nav} aria-label="Admin sections">
        {LINKS.map((link) => {
          const isActive =
            link.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={withGym(link.href)}
              className={`${styles.link} ${isActive ? styles.linkActive : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {gyms.length > 1 && (
        <label className={styles.gymPicker}>
          <span className={styles.gymPickerLabel}>Gym</span>
          <select
            className={styles.gymSelect}
            value={currentGym ?? gyms[0].id}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams.toString());
              next.set("gym", e.target.value);
              router.push(`${pathname}?${next.toString()}`);
              // The gym-scoped pages read this on the server, so the
              // RSC payload has to be refetched, not just re-rendered.
              router.refresh();
            }}
          >
            {gyms.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
