"use client";

import { type ReactNode } from "react";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import styles from "./settingsMenu.module.scss";

// ── Types ─────────────────────────────────────────

type MenuVariant = "default" | "warning" | "danger";

interface MenuItem {
  label: string;
  icon?: ReactNode;
  variant?: MenuVariant;
  onSelect?: () => void;
  /** Render as a link instead of a button */
  href?: string;
}

interface MenuGroup {
  items: MenuItem[];
}

interface Props {
  /** The trigger element — rendered via asChild */
  trigger: ReactNode;
  /** Menu item groups, separated by dividers */
  groups: MenuGroup[];
  /** Alignment relative to trigger */
  align?: "start" | "center" | "end";
  /** Offset from trigger in px */
  sideOffset?: number;
}

// ── Component ─────────────────────────────────────

export function DropdownMenu({ trigger, groups, align = "end", sideOffset = 8 }: Props) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>
        {trigger}
      </Primitive.Trigger>

      <Primitive.Portal>
        <Primitive.Content
          className={styles.content}
          sideOffset={sideOffset}
          align={align}
        >
          <Primitive.Arrow className={styles.arrow} width={12} height={6} />

          {groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <Primitive.Separator className={styles.separator} />}
              {group.items.map((item) => {
                const variant = item.variant ?? "default";
                const cls = [
                  styles.item,
                  variant !== "default" ? styles[`item--${variant}`] : "",
                ].filter(Boolean).join(" ");

                if (item.href) {
                  return (
                    <Primitive.Item key={item.label} className={cls} asChild>
                      <a href={item.href}>
                        {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                        {item.label}
                      </a>
                    </Primitive.Item>
                  );
                }

                return (
                  <Primitive.Item
                    key={item.label}
                    className={cls}
                    onSelect={item.onSelect}
                  >
                    {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                    {item.label}
                  </Primitive.Item>
                );
              })}
            </div>
          ))}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
