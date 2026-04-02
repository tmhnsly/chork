"use server";

import { mutateAuthUser } from "@/lib/user-actions";

export async function completeOnboarding(formData: FormData) {
  formData.append("onboarded", "true");
  return mutateAuthUser(formData);
}
