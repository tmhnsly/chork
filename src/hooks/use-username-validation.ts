"use client";

import { useState, useCallback } from "react";
import { checkUsernameAvailable } from "@/lib/user-actions";
import { validateUsername } from "@/lib/validation";

export function useUsernameValidation(currentUsername?: string) {
  const [error, setError] = useState("");

  const validate = useCallback(
    async (value: string, userId: string): Promise<boolean> => {
      setError("");

      const { error: validationError } = validateUsername(value);
      if (validationError) {
        setError(validationError);
        return false;
      }
      if (value === currentUsername) return true;

      try {
        const available = await checkUsernameAvailable(value, userId);
        if (!available) {
          setError("Username is taken");
          return false;
        }
      } catch (err) {
        // Server error — allow submit, server will validate
        console.warn("[chork] username validation failed:", err);
      }
      return true;
    },
    [currentUsername]
  );

  return { error, setError, validate };
}
