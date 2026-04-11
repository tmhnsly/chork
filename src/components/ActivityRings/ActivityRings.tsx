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
 * Rings animate via CSS transition when values change.
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
        const circumference = 2 * Math.PI * radius;
        const progress = Math.min(1, Math.max(0, ring.value));
        const offset = circumference * (1 - progress);

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
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${center} ${center})`}
              className={styles.ring}
            />
          </g>
        );
      })}
    </svg>
  );
}
