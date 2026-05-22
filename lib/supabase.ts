import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
}

// Single shared client — import this everywhere instead of calling createClient() directly
export const supabase = createClient(url, key, {
  auth: {
    detectSessionInUrl: true,  // picks up the token from the URL hash after magic link redirect
    persistSession: true,      // stores session in localStorage so it survives page reloads
  },
});

// Helper: returns { Authorization: "Bearer <token>" } or throws if not logged in
export async function authHeader(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Not authenticated");
  }
  return { Authorization: `Bearer ${data.session.access_token}` };
}
