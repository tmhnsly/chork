"use client";

import { useRef } from "react";
import Image from "next/image";
import styles from "./ui.module.scss";

interface Props {
  currentUrl: string | null;
  fallbackText: string;
  onFileSelect: (file: File) => void;
  label?: string;
}

export function AvatarPicker({
  currentUrl,
  fallbackText,
  onFileSelect,
  label = "Add a photo",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  }

  return (
    <div className={styles.avatarSection}>
      <button
        type="button"
        className={styles.avatarPicker}
        onClick={() => fileRef.current?.click()}
      >
        {currentUrl ? (
          <Image src={currentUrl} alt="" width={96} height={96} className={styles.avatarImage} unoptimized />
        ) : (
          <span className={styles.avatarFallback}>
            {fallbackText.charAt(0).toUpperCase()}
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        hidden
      />
      <span className={styles.avatarLabel}>{label}</span>
    </div>
  );
}
