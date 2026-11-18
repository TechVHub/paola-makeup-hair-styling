import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import { getD1 } from "@/lib/d1";

export const runtime = "edge";

function setting(name: string): string {
  const bindings = env as unknown as Record<string, unknown>;
  const value = bindings[name] ?? process.env[name];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing configuration: ${name}`);
  }

  return value.trim();
}

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Authentication required." }, 401);
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return json({ error: "Authentication required." }, 401);
    }

    const supabase = createClient(
      setting("NEXT_PUBLIC_SUPABASE_URL"),
      setting("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return json({ error: "Session expired. Sign in again." }, 401);
    }

    const { data: isAdmin, error: roleError } =
      await supabase.rpc("is_paola_admin");

    if (roleError || isAdmin !== true) {
      return json({ error: "Administrator access required." }, 403);
    }

    const db = getD1();

    const result = await db.prepare(`
      SELECT
        b.id,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.customer_notes,
        b.starts_at,
        b.ends_at,
        b.quoted_price,
        b.status,
        b.created_at,
        s.name AS service_name,
        s.duration_minutes AS service_duration
      FROM bookings b
      LEFT JOIN services s ON s.id = b.service_id
      ORDER BY b.starts_at ASC
    `).all<{
      id: string;
      customer_name: string;
      customer_email: string;
      customer_phone: string;
      customer_notes: string | null;
      starts_at: string;
      ends_at: string;
      quoted_price: number;
      status: string;
      created_at: string;
      service_name: string | null;
      service_duration: number | null;
    }>();

    const bookings = result.results.map((row) => ({
      id: row.id,
      customer_name: row.customer_name,
      customer_email: row.customer_email,
      customer_phone: row.customer_phone,
      customer_notes: row.customer_notes,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      quoted_price: row.quoted_price,
      status: row.status,
      created_at: row.created_at,
      services: row.service_name
        ? {
            name: row.service_name,
            duration_minutes: row.service_duration,
          }
        : null,
    }));

    return json({ success: true, bookings }, 200);
  } catch (error) {
    console.error(
      "Admin D1 booking list error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return json({ error: "Unable to load appointments." }, 500);
  }
}