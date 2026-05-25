import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const redirectBase = forwardedHost ? `https://${forwardedHost}` : origin;

  if (code) {
    const cookieStore = await cookies();
    // Capture cookies set during session exchange so we can attach them to the redirect.
    // NextResponse.redirect() creates a new Response — without this, Set-Cookie headers
    // from exchangeCodeForSession are lost and the browser never receives the session.
    const newCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
              newCookies.push({ name, value, options: options as Record<string, unknown> });
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // First-time users go to set-password, returning users go to dashboard
      const { data: { user } } = await supabase.auth.getUser();
      const passwordSet = user?.user_metadata?.password_set === true;
      const destination = next !== "/dashboard" ? next : passwordSet ? "/dashboard" : "/setup-password";

      const response = NextResponse.redirect(`${redirectBase}${destination}`);
      // Explicitly set session cookies on the redirect response
      newCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
      });
      return response;
    }

    // Code exchange failed — most common cause: PKCE verifier missing because the link
    // was opened in a different browser than the one that requested it.
    const isFlowError =
      error.message?.toLowerCase().includes("flow_state") ||
      error.message?.toLowerCase().includes("code_verifier") ||
      error.message?.toLowerCase().includes("pkce");
    const isExpired =
      error.message?.toLowerCase().includes("expired") ||
      error.message?.toLowerCase().includes("otp_expired");

    const errorCode = isExpired ? "link_expired" : isFlowError ? "wrong_browser" : "auth_error";
    return NextResponse.redirect(`${redirectBase}/login?error=${errorCode}`);
  }

  return NextResponse.redirect(`${redirectBase}/login?error=auth_error`);
}
