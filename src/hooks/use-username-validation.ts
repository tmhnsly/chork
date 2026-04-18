"use client";

import { useCallback, useRef, useState } from "react";
import { checkUsernameAvailable } from "@/lib/user-actions";
import { validateUsername } from "@/lib/validation";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
export type UsernameStatus = "idle" | "checking" | "available" | "invalid";

export function useUsernameValidation(currentUsername?: string) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  // Request token so late-arriving server responses from older inputs
  // can't stomp the state for a newer value. Every call increments it;
  // any write is gated on "this request is still the latest".
  const reqRef = useRef(0);

  const reset = useCallback(() => {
    reqRef.current++;
    setError("");
    setStatus("idle");
  }, []);

  const validate = useCallback(
    async (value: string, userId: string): Promise<boolean> => {
      const token = ++reqRef.current;
      setError("");

      const { error: validationError } = validateUsername(value);
      if (validationError) {
        if (reqRef.current === token) {
          setError(validationError);
          setStatus("invalid");
        }
        return false;
      }

      if (value === currentUsername) {
        if (reqRef.current === token) setStatus("available");
        return true;
      }

      if (reqRef.current === token) setStatus("checking");

      try {
        const available = await checkUsernameAvailable(value, userId);
        if (reqRef.current !== token) return available;
        if (!available) {
          setError("Username is taken");
          setStatus("invalid");
          return false;
        }
        setStatus("available");
        return true;
      } catch (err) {
        // Server error — allow submit, server will validate on save
        logger.warn("username_validation_failed", { err: formatErrorForLog(err) });
        if (reqRef.current === token) setStatus("idle");
        return true;
      }
    },
    [currentUsername]
  );

  return { error, status, setError, validate, reset };
}
