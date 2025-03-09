import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getUserRole } from "@/lib/get-user-role";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next();

  // Create a Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          supabaseResponse = NextResponse.next();
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options); // ✅ Correct way
          });
        },
      },
    }
  );

  // Get the current user from Supabase
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get the user's role using the custom getUserRole function
  const role = await getUserRole();

  // Redirect non-admin users trying to access admin pages
  if (
    user &&
    role !== "admin" &&
    request.nextUrl.pathname.startsWith("/admin")
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users to sign-in page
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/signin") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const redirectUrl = new URL("/signin", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users attempting to access the sign-in page
  if (user && request.nextUrl.pathname.startsWith("/signin")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}
