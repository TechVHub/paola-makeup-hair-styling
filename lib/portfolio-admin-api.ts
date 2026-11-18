import { getSupabase } from "./supabase";

export async function portfolioAdminApi<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const { data: { session }, error } = await getSupabase().auth.getSession();
  if (error || !session?.access_token) throw new Error("Session expired. Please sign in again.");
  const response = await fetch("/api/admin/portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload }),
    cache: "no-store",
  });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || "Portfolio operation failed.");
  return data;
}

export async function portfolioAdminLoad<T = Record<string, unknown>>(): Promise<T> {
  const { data: { session }, error } = await getSupabase().auth.getSession();
  if (error || !session?.access_token) throw new Error("Session expired. Please sign in again.");
  const response = await fetch("/api/admin/portfolio", {
    headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
  });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || "Unable to load portfolio.");
  return data;
}