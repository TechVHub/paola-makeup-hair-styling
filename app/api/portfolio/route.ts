import { getD1 } from "@/lib/d1";
export const runtime = "edge";
const cats = new Set(["makeup", "bridal", "hair", "special_event", "other"]);
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") ?? "";
    const kind = url.searchParams.get("kind") ?? "";
    if (!cats.has(category)) return Response.json({ error: "Invalid category." }, { status: 400 });
    const db = getD1();
    if (kind === "photos") {
      const rows = await db.prepare(`SELECT id,title,category,description,image_path,image_position_x,image_position_y,image_zoom
        FROM portfolio_photos WHERE category = ? AND is_featured = 1 ORDER BY sort_order,id`).bind(category).all();
      return Response.json({ rows: rows.results });
    }
    if (kind === "collections") {
      const rows = await db.prepare(`SELECT id,name,slug,category,description,cover_photo_id,sort_order
        FROM portfolio_collections WHERE category = ? ORDER BY sort_order,id`).bind(category).all();
      return Response.json({ rows: rows.results });
    }
    if (kind === "collection") {
      const slug = url.searchParams.get("slug") ?? "";
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return Response.json({ row: null });
      const row = await db.prepare(`SELECT id,name,slug,category,description,cover_photo_id,sort_order
        FROM portfolio_collections WHERE category = ? AND slug = ?`).bind(category, slug).first();
      return Response.json({ row: row ?? null });
    }
    if (kind === "assignments") {
      const rows = await db.prepare(`SELECT a.collection_id,a.photo_id
        FROM portfolio_collection_photos a JOIN portfolio_collections c ON c.id = a.collection_id
        WHERE c.category = ? ORDER BY a.collection_id,a.photo_id`).bind(category).all();
      return Response.json({ rows: rows.results });
    }
    return Response.json({ error: "Invalid query." }, { status: 400 });
  } catch (error) { console.error("Public portfolio D1:", error); return Response.json({ error: "Portfolio unavailable." }, { status: 500 }); }
}