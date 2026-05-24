import { supabase } from "./supabase";

export type WatchlistItem = {
  id: string;
  user_id: string;
  ticker: string;
  company_name: string | null;
  notes: string | null;
  added_at: string;
};

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from("watchlist")
    .select("*")
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addToWatchlist(ticker: string, companyName?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("watchlist").upsert(
    { user_id: user.id, ticker: ticker.toUpperCase(), company_name: companyName ?? null },
    { onConflict: "user_id,ticker" }
  );
  if (error) throw error;
}

export async function removeFromWatchlist(id: string): Promise<void> {
  const { error } = await supabase.from("watchlist").delete().eq("id", id);
  if (error) throw error;
}

export async function isInWatchlist(ticker: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("watchlist")
    .select("id")
    .eq("ticker", ticker.toUpperCase())
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
}
