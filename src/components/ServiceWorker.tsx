"use client";

import { useEffect } from "react";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        logger.warn("sw_registration_failed", { err: formatErrorForLog(err) });
      });
    }
  }, []);

  return null;
}
