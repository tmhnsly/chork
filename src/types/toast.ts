// types.ts
import { ReactNode } from "react";

export type ToastType = "default" | "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  title?: string;
  description: string;
  type?: ToastType;
  duration?: number;
  action?: ReactNode;
  actionAltText?: string;
  onActionClick?: () => void;
}

export interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, toast: Partial<Toast>) => void;
}
