/** Cookie options shared by client (onChange sync) and server (exportToCookie). */
export const cookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
};
