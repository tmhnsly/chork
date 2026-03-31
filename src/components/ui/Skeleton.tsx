import type { HTMLAttributes } from "react";
import styles from "./skeleton.module.scss";

type SkeletonVariant = "text" | "circle" | "rect" | "square";

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
}

const variantClass: Record<SkeletonVariant, string> = {
  text: styles.text,
  circle: styles.circle,
  rect: styles.rect,
  square: styles.square,
};

export function Skeleton({
  variant = "rect",
  width,
  height,
  className,
  style,
  ...props
}: Props) {
  const cls = [styles.skeleton, variantClass[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  );
}
