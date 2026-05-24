import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
}

// createBrowserClient stores session in cookies (not localStorage)
// so the server-side middleware can read it and auth works end-to-end
export const supabase = createBrowserClient(url, key);

// Helper: returns { Authorization: "Bearer <token>" } or throws if not logged in
export async function authHeader(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Not authenticated");
  }
  return { Authorization: `Bearer ${data.session.access_token}` };
}
