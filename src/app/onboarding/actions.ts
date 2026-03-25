"use server";

import { mutateAuthUser } from "@/lib/pb-actions";

export async function completeOnboarding(formData: FormData) {
  formData.append("onboarded", "true");
  return mutateAuthUser(formData);
}
