"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { FaGear, FaPen, FaRightFromBracket, FaTrash, FaShieldHalved } from "react-icons/fa6";
import { useAuth } from "@/lib/auth-context";
import styles from "./settingsMenu.module.scss";

interface Props {
  onEditProfile: () => void;
  onDeleteAccount: () => void;
}

export function SettingsMenu({ onEditProfile, onDeleteAccount }: Props) {
  const { signOut } = useAuth();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className={styles.trigger} aria-label="Settings">
          <FaGear />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={8} align="end">
          <DropdownMenu.Item className={styles.item} onSelect={onEditProfile}>
            <FaPen className={styles.itemIcon} />
            Edit profile
          </DropdownMenu.Item>

          <DropdownMenu.Item className={styles.item} asChild>
            <Link href="/privacy">
              <FaShieldHalved className={styles.itemIcon} />
              Privacy policy
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className={styles.separator} />

          <DropdownMenu.Item className={`${styles.item} ${styles.itemWarning}`} onSelect={signOut}>
            <FaRightFromBracket className={styles.itemIcon} />
            Sign out
          </DropdownMenu.Item>

          <DropdownMenu.Item className={`${styles.item} ${styles.itemDanger}`} onSelect={onDeleteAccount}>
            <FaTrash className={styles.itemIcon} />
            Delete account
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
