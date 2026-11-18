import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import { getD1 } from "@/lib/d1";
export const runtime = "edge";

function setting(name: string) {
  const e = env as unknown as Record<string, unknown>;
  const value = e[name] ?? process.env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing configuration: ${name}`);
  return value.trim();
}
function reply(data: Record<string, unknown>, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
async function admin(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;
  // Match the currently working local admin authentication configuration.
  // Review use of service-role credentials before any production deployment.
  const supabase = createClient(setting("NEXT_PUBLIC_SUPABASE_URL"), setting("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user, error } = await supabase.auth.getUser(token);
  if (error || !user.user) return false;
  const { data: allowed, error: roleError } = await supabase.rpc("is_paola_admin");
  return !roleError && allowed === true;
}
const cats = new Set(["makeup", "bridal", "hair", "special_event", "other"]);
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid payload.");
  return value as Record<string, unknown>;
}
function str(value: unknown, max = 500): string {
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid text.");
  return value.trim();
}
function id(value: unknown): string {
  const v = str(value, 100);
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new Error("Invalid ID.");
  return v;
}
function num(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error("Invalid numeric value.");
  return value;
}
function bool(value: unknown): number {
  if (typeof value !== "boolean") throw new Error("Invalid boolean value.");
  return value ? 1 : 0;
}
function category(value: unknown) {
  const v = str(value, 30);
  if (!cats.has(v)) throw new Error("Invalid category.");
  return v;
}
function optional(value: unknown, max = 2000): string | null {
  return value == null ? null : str(value, max) || null;
}
function slug(value: unknown) {
  const v = str(value, 120);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) throw new Error("Invalid collection slug.");
  return v;
}
function photo(row: Record<string, unknown>) { return { ...row, is_featured: row.is_featured === 1 }; }
export async function GET(request: Request) {
  try {
    if (!(await admin(request))) return reply({ error: "Administrator access required." }, 403);
    const db = getD1();
    const [p, c, a] = await Promise.all([
      db.prepare("SELECT * FROM portfolio_photos ORDER BY sort_order, created_at DESC").all(),
      db.prepare("SELECT * FROM portfolio_collections ORDER BY category, sort_order, id").all(),
      db.prepare("SELECT collection_id,photo_id FROM portfolio_collection_photos ORDER BY collection_id,sort_order,photo_id").all(),
    ]);
    return reply({ photos: p.results.map(r => photo(r)), collections: c.results, assignments: a.results });
  } catch (e) { console.error("Portfolio admin GET:", e); return reply({ error: "Unable to load portfolio." }, 500); }
}
export async function POST(request: Request) {
  try {
    if (!(await admin(request))) return reply({ error: "Administrator access required." }, 403);
    const input = obj(await request.json());
    const db = getD1();
    switch (input.action) {
      case "createPhoto": {
        const p = obj(input.photo);
        const title = str(p.title, 120);
        if (!title) throw new Error("Photo title required.");
        const path = str(p.image_path, 500);
        if (!path || path.includes("..") || path.startsWith("/")) throw new Error("Invalid image path.");
        await db.prepare(`INSERT INTO portfolio_photos (id,title,category,description,image_path,is_featured,sort_order)
          VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), title, category(p.category), optional(p.description), path, bool(p.is_featured), num(p.sort_order, -1000000, 1000000)).run();
        return reply({ success: true });
      }
      case "updatePhoto": {
        const photoId = id(input.id);
        const changes = obj(input.changes);
        const allowed: Record<string, string> = {
          title: "title", category: "category", description: "description", image_path: "image_path",
          image_position_x: "image_position_x", image_position_y: "image_position_y",
          image_zoom: "image_zoom", is_featured: "is_featured", sort_order: "sort_order",
        };
        const columns: string[] = [];
        const values: (string | number | null)[] = [];
        for (const [key, raw] of Object.entries(changes)) {
          if (!allowed[key]) throw new Error("Unsupported photo field.");
          let value: string | number | null;
          switch (key) {
            case "title": value = str(raw, 120); if (!value) throw new Error("Photo title required."); break;
            case "category": value = category(raw); break;
            case "description": value = optional(raw); break;
            case "image_path": value = str(raw, 500); if (!value || value.includes("..") || value.startsWith("/")) throw new Error("Invalid image path."); break;
            case "image_position_x": case "image_position_y": value = num(raw, 0, 100); break;
            case "image_zoom": value = num(raw, 50, 300); break;
            case "is_featured": value = bool(raw); break;
            default: value = num(raw, -1000000, 1000000);
          }
          columns.push(`${allowed[key]} = ?`);
          values.push(value);
        }
        if (!columns.length) throw new Error("No changes provided.");
        const result = await db.prepare(`UPDATE portfolio_photos SET ${columns.join(", ")} WHERE id = ?`).bind(...values, photoId).run();
        if (!result.meta.changes) return reply({ error: "Photo not found." }, 404);
        return reply({ success: true });
      }
      case "deletePhoto": {
        const result = await db.prepare("DELETE FROM portfolio_photos WHERE id = ?").bind(id(input.id)).run();
        if (!result.meta.changes) return reply({ error: "Photo not found." }, 404);
        // Intentionally retain the image in Storage; cleanup is a separate, audited operation.
        return reply({ success: true, storageRetained: true });
      }
      case "createCollection": {
        const c = obj(input.collection);
        const name = str(c.name, 100);
        if (!name) throw new Error("Collection name required.");
        await db.prepare(`INSERT INTO portfolio_collections (id,name,slug,category,sort_order)
          VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(), name, slug(c.slug), category(c.category), num(c.sort_order, -1000000, 1000000)).run();
        return reply({ success: true });
      }
      case "renameCollection": {
        const name = str(input.name, 100);
        if (!name) throw new Error("Collection name required.");
        const result = await db.prepare("UPDATE portfolio_collections SET name = ?, slug = ? WHERE id = ?")
          .bind(name, slug(input.slug), id(input.id)).run();
        if (!result.meta.changes) return reply({ error: "Collection not found." }, 404);
        return reply({ success: true });
      }
      case "setCover": {
        const cid = id(input.id);
        const pid = input.photo_id == null || input.photo_id === "" ? null : id(input.photo_id);
        if (pid) {
          const rows = await db.prepare(`SELECT c.category AS collection_category,p.category AS photo_category
            FROM portfolio_collections c JOIN portfolio_photos p ON p.id = ? WHERE c.id = ?`).bind(pid, cid).first<{collection_category:string;photo_category:string}>();
          if (!rows || rows.collection_category !== rows.photo_category) throw new Error("Cover must be a photo in this category.");
        }
        const result = await db.prepare("UPDATE portfolio_collections SET cover_photo_id = ? WHERE id = ?").bind(pid, cid).run();
        if (!result.meta.changes) return reply({ error: "Collection not found." }, 404);
        return reply({ success: true });
      }
      case "setOrder": {
        const result = await db.prepare("UPDATE portfolio_collections SET sort_order = ? WHERE id = ?")
          .bind(num(input.sort_order, -1000000, 1000000), id(input.id)).run();
        if (!result.meta.changes) return reply({ error: "Collection not found." }, 404);
        return reply({ success: true });
      }
      case "assignPhoto": {
        const cid = id(input.collection_id), pid = id(input.photo_id);
        const checked = bool(input.checked);
        if (checked) {
          const row = await db.prepare(`SELECT c.category AS collection_category,p.category AS photo_category
            FROM portfolio_collections c JOIN portfolio_photos p ON p.id = ? WHERE c.id = ?`).bind(pid, cid).first<{collection_category:string;photo_category:string}>();
          if (!row || row.collection_category !== row.photo_category) throw new Error("Photo and collection categories must match.");
          await db.prepare("INSERT OR IGNORE INTO portfolio_collection_photos (collection_id,photo_id) VALUES (?,?)").bind(cid, pid).run();
        } else {
          await db.prepare("DELETE FROM portfolio_collection_photos WHERE collection_id = ? AND photo_id = ?").bind(cid, pid).run();
        }
        return reply({ success: true });
      }
      case "deleteCollection": {
        const result = await db.prepare("DELETE FROM portfolio_collections WHERE id = ?").bind(id(input.id)).run();
        if (!result.meta.changes) return reply({ error: "Collection not found." }, 404);
        return reply({ success: true });
      }
      default: return reply({ error: "Unsupported action." }, 400);
    }
  } catch (e) {
    console.error("Portfolio admin POST:", e);
    const message = e instanceof Error ? e.message : "Unable to save portfolio.";
    const conflict = /UNIQUE constraint|FOREIGN KEY constraint/i.test(message);
    return reply({ error: conflict ? "A conflicting photo or collection already exists." : message }, conflict ? 409 : 400);
  }
}