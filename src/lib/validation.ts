/** Username format: lowercase alphanumeric + underscores, min 3 chars. */
export const USERNAME_RE = /^[a-z0-9_]+$/;

/** Fields that can be updated on a user record via mutateAuthUser. */
export const ALLOWED_USER_FIELDS = new Set([
  "username",
  "name",
  "avatar",
  "onboarded",
]);
