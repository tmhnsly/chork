"use client";

import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { Box, Text } from "@radix-ui/themes";
import { FiX } from "react-icons/fi";
import styles from "./toast.module.scss";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={`${styles.toastViewport} ${className || ""}`}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

// Aligned with shadcn's variant types
export type ToastVariant = "default" | "destructive";

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & {
    variant?: ToastVariant;
  }
>(({ className, variant = "default", ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={`${styles.toast} ${
        variant === "destructive" ? styles.destructive : ""
      } ${className || ""}`}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={`${styles.toastAction} ${className || ""}`}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <Box position="absolute" top="1" right="1">
    <ToastPrimitives.Close
      ref={ref}
      className={`${styles.toastClose} ${className || ""}`}
      toast-close=""
      {...props}
    >
      <FiX size={16} />
    </ToastPrimitives.Close>
  </Box>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={`${styles.toastTitle} ${className || ""}`}
    {...props}
  >
    <Text size="2" weight="bold">
      {props.children}
    </Text>
  </ToastPrimitives.Title>
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={`${styles.toastDescription} ${className || ""}`}
    {...props}
  >
    <Text size="1">{props.children}</Text>
  </ToastPrimitives.Description>
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

// Export these types to match shadcn's pattern
export type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
export type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
