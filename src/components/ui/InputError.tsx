import styles from "./ui.module.scss";

interface Props {
  message?: string;
}

/** Consistent inline error message for form fields. */
export function InputError({ message }: Props) {
  if (!message) return null;
  return <span className={styles.fieldError}>{message}</span>;
}
