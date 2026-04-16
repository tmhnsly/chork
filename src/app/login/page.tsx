import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in - Chork",
};

export default function LoginPage() {
  // useSearchParams in LoginForm forces a client-side bail-out for
  // the ?next= param. Suspense wraps it so prerender doesn't fail.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
