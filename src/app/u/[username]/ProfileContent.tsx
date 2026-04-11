"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";
import { RevealText } from "@/components/motion";
import styles from "./user.module.scss";

interface Props {
  username: string;
  children: ReactNode;
}

/**
 * Client wrapper that adds entrance animations to the user profile page.
 */
export function ProfileContent({ username, children }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}
