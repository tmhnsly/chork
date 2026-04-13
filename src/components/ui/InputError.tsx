import styles from "./ui.module.scss";

interface Props {
  message?: string;
  id?: string;
}

/** Consistent inline error message for form fields. */
export function InputError({ message, id }: Props) {
  if (!message) return null;
  return <span id={id} className={styles.fieldError}>{message}</span>;
}
