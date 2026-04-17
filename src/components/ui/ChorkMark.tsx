import styles from "./chorkMark.module.scss";

type Mode = "duotone-dark" | "duotone-light" | "mono-dark" | "mono-light" | "accent" | "auto";

interface Props {
  /** Explicit colour for the C arc stroke */
  arcColour?: string;
  /** Explicit colour for the dot fill */
  dotColour?: string;
  /** Preset colour mode - overridden by explicit colours */
  mode?: Mode;
  /** Size in px. Defaults to filling parent. */
  size?: number;
  className?: string;
}

/**
 * Chork brand mark - the "C" arc with dot.
 * Follows the app's current theme by default.
 */
export function ChorkMark({ arcColour, dotColour, mode = "auto", size, className }: Props) {
  const modeClass = !arcColour && !dotColour ? styles[mode] : undefined;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={[styles.mark, modeClass, className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <path
        d="M29 11 A14 14 0 1 0 29 37"
        className={styles.arc}
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        style={arcColour ? { stroke: arcColour } : undefined}
      />
      <circle
        cx="38"
        cy="24"
        r="7.5"
        className={styles.dot}
        style={dotColour ? { fill: dotColour } : undefined}
      />
    </svg>
  );
}
