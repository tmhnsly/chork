export { createBrowserSupabase } from "./client";
// server.ts and middleware.ts are imported directly where needed
// to avoid pulling server-only code into client bundles.
