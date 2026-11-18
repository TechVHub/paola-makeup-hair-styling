import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
export function publicPortfolioClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Public portfolio configuration is missing.");
    // Never share the admin client's persisted session or use a service key.
    client = createClient(url, key, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: "paola-public-portfolio",
    } });
  }
  return client;
}
export type Photo = {
  id: string; title: string; category: string; description: string | null; image_path: string;
  image_position_x: number;
  image_position_y: number;
  image_zoom: number;
};
export type Collection = {
  id: string; name: string; slug: string; category: string;
  description: string | null; cover_photo_id: string | null; sort_order: number;
};
export type Assignment = { collection_id: string; photo_id: string };
export const categories: Record<string, string> = {
  makeup: "Makeup", hair: "Hair Styling", bridal: "Bridal", special_event: "Special Events", other: "Other",
};
export function photoUrl(path: string) {
  return publicPortfolioClient().storage.from("paola-portfolio").getPublicUrl(path).data.publicUrl;
}
// Public portfolio database records are served by the local D1 API.
async function query<T>(kind: string, category: string, slug?: string): Promise<T> {
  const params = new URLSearchParams({ kind, category });
  if (slug) params.set("slug", slug);
  const response = await fetch(`/api/portfolio?${params}`, { cache: "no-store" });
  const result = await response.json() as { rows?: T; row?: T; error?: string };
  if (!response.ok) throw new Error(result.error || "Unable to load portfolio.");
  return (kind === "collection" ? result.row : result.rows) as T;
}
export function loadPhotos(category: string) {
  return query<Photo[]>("photos", category);
}
export function loadCollections(category: string) {
  return query<Collection[]>("collections", category);
}
export async function loadAssignments(collections: Collection[]) {
  if (!collections.length) return [] as Assignment[];
  const categories = [...new Set(collections.map(c => c.category))];
  const all = (await Promise.all(categories.map(c => query<Assignment[]>("assignments", c)))).flat();
  const ids = new Set(collections.map(c => c.id));
  return all.filter(a => ids.has(a.collection_id));
}
export function loadCollection(category: string, slug: string) {
  return query<Collection | null>("collection", category, slug);
}