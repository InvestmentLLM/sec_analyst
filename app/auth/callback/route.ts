import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const redirectBase = forwardedHost ? `https://${forwardedHost}` : origin;

      // First-time users go to set-password, returning users go to dashboard
      const { data: { user } } = await supabase.auth.getUser();
      const passwordSet = user?.user_metadata?.password_set === true;
      const destination = next !== "/dashboard" ? next : passwordSet ? "/dashboard" : "/setup-password";

      return NextResponse.redirect(`${redirectBase}${destination}`);
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const redirectBase = forwardedHost ? `https://${forwardedHost}` : origin;
  return NextResponse.redirect(`${redirectBase}/login?error=auth_error`);
}
