"use server";

import { mutateAuthUser } from "@/lib/pb-actions";

export async function updateProfile(formData: FormData) {
  return mutateAuthUser(formData);
}
