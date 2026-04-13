"use client";

import { type ReactNode } from "react";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import styles from "./settingsMenu.module.scss";

// ── Types ─────────────────────────────────────────

type MenuVariant = "default" | "warning" | "danger";

interface MenuItem {
  label: string;
  icon?: ReactNode;
  /** Trailing badge / icon / swatch stack, right-aligned. */
  trailing?: ReactNode;
  variant?: MenuVariant;
  onSelect?: () => void;
  /** Render as a link instead of a button */
  href?: string;
  /** If set, the item becomes a submenu trigger. `onSelect` and
   *  `href` are ignored when `submenu` is present. */
  submenu?: MenuItem[];
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
              {group.items.map((item) => renderItem(item))}
            </div>
          ))}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

// ── Item renderer ─────────────────────────────────
// Recursive so submenus can nest; Radix handles the flyout + keyboard
// nav when we use Sub / SubTrigger / SubContent.
function renderItem(item: MenuItem): ReactNode {
  const variant = item.variant ?? "default";
  const cls = [
    styles.item,
    variant !== "default" ? styles[`item--${variant}`] : "",
  ].filter(Boolean).join(" ");

  const body = (
    <>
      {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
      <span className={styles.itemLabel}>{item.label}</span>
      {item.trailing && <span className={styles.itemTrailing}>{item.trailing}</span>}
    </>
  );

  if (item.submenu) {
    return (
      <Primitive.Sub key={item.label}>
        <Primitive.SubTrigger className={cls}>
          {body}
          <span className={styles.subChevron} aria-hidden>›</span>
        </Primitive.SubTrigger>
        <Primitive.Portal>
          <Primitive.SubContent className={styles.content} sideOffset={4} alignOffset={-4}>
            {item.submenu.map((child) => renderItem(child))}
          </Primitive.SubContent>
        </Primitive.Portal>
      </Primitive.Sub>
    );
  }

  if (item.href) {
    return (
      <Primitive.Item key={item.label} className={cls} asChild>
        <a href={item.href}>{body}</a>
      </Primitive.Item>
    );
  }

  return (
    <Primitive.Item key={item.label} className={cls} onSelect={item.onSelect}>
      {body}
    </Primitive.Item>
  );
}
