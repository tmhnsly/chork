"use client";

import styles from "./activityRings.module.scss";

interface Ring {
  /** 0–1 progress value */
  value: number;
  /** CSS color variable */
  color: string;
}

interface Props {
  /** Outer ring first, inner ring last */
  rings: Ring[];
  /** Size in px */
  size?: number;
  className?: string;
}

const TRACK_COLOR = "var(--mono-bg)";

/**
 * Apple Fitness-style concentric progress rings.
 *
 * The entrance animation is pure CSS — each ring carries
 * `pathLength={1}`, which normalises `stroke-dashoffset` to a 0-1
 * range regardless of radius, so the `ringDraw` keyframe can start
 * every ring from the same "fully hidden" offset and let the
 * element's resting `strokeDashoffset` value become the end frame.
 * No `useEffect` / `setState` bounce needed to kick the animation.
 */
export function ActivityRings({ rings, size = 72, className }: Props) {
  const strokeWidth = size * 0.1;
  const gap = strokeWidth * 0.4;
  const center = size / 2;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {rings.map((ring, i) => {
        const radius = center - strokeWidth / 2 - i * (strokeWidth + gap);
        const progress = Math.min(1, Math.max(0, ring.value));
        const offset = 1 - progress;

        return (
          <g key={i}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={TRACK_COLOR}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={ring.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${center} ${center})`}
              className={styles.ring}
              style={{ "--ring-delay": `${i * 150}ms` } as React.CSSProperties}
            />
          </g>
        );
      })}
    </svg>
  );
}
