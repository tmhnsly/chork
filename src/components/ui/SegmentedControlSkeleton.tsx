import styles from "./segmentedControl.module.scss";

/**
 * `SegmentedControl`, waiting: the same track and options from the
 * same stylesheet, first option selected, no handlers — a server
 * `loading.tsx` can't pass the real control an onChange. Renders the
 * real words so nothing reflows when the control takes over.
 */
export function SegmentedControlSkeleton({ options }: { options: string[] }) {
  return (
    <div className={styles.track} aria-hidden>
      {options.map((label, i) => (
        <span key={label} className={`${styles.option} ${i === 0 ? styles.optionSelected : ""}`}>
          {label}
        </span>
      ))}
    </div>
  );
}
