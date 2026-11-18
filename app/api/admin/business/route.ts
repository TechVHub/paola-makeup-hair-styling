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

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function authorize(request: Request) {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const token = header.slice(7).trim();
  if (!token) return false;

  const supabase = createClient(
    setting("NEXT_PUBLIC_SUPABASE_URL"),
    setting("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData.user) return false;

  const { data: isAdmin, error: roleError } =
    await supabase.rpc("is_paola_admin");

  return !roleError && isAdmin === true;
}

function flag(value: unknown): number {
  if (typeof value !== "boolean") {
    throw new Error("Invalid boolean value.");
  }
  return value ? 1 : 0;
}

function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error("Invalid numeric value.");
  }
  return value;
}

function stringValue(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) {
    throw new Error("Invalid text value.");
  }
  return value.trim();
}

function time(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid business hour.");
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match) throw new Error("Invalid business hour.");

  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("Invalid UTC date.");
  }
  return value;
}

function price(value: unknown): string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 99999999.99
  ) {
    throw new Error("Invalid service price.");
  }

  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 0.000001) {
    throw new Error("Prices must have at most two decimal places.");
  }

  return (cents / 100).toFixed(2);
}

function normalizeService(input: Record<string, unknown>) {
  const name = stringValue(input.name, 120);
  if (!name) throw new Error("Service name is required.");

  const category = stringValue(input.category, 60);
  const description =
    input.description == null
      ? null
      : stringValue(input.description, 5000) || null;

  const imagePath =
    input.image_path == null
      ? null
      : stringValue(input.image_path, 500);

  return {
    name,
    category,
    description,
    price: price(input.price),
    price_is_starting_at: flag(input.price_is_starting_at),
    duration_minutes: integer(input.duration_minutes, 15, 480),
    is_active: flag(input.is_active),
    sort_order: integer(input.sort_order, -100000, 100000),
    image_path: imagePath,
  };
}

function validDuration(minutes: number) {
  if (minutes % 15 !== 0) {
    throw new Error("Duration must be in 15-minute increments.");
  }
}

function mapService(row: Record<string, unknown>) {
  return {
    ...row,
    price: Number(row.price),
    price_is_starting_at: row.price_is_starting_at === 1,
    is_active: row.is_active === 1,
  };
}

export async function GET(request: Request) {
  try {
    if (!(await authorize(request))) {
      return reply({ error: "Administrator access required." }, 403);
    }

    const db = getD1();

    const [services, hours, blocks, settings] = await Promise.all([
      db.prepare("SELECT * FROM services ORDER BY sort_order").all(),
      db.prepare("SELECT * FROM business_hours ORDER BY day_of_week").all(),
      db.prepare("SELECT * FROM availability_blocks ORDER BY starts_at").all(),
      db.prepare(`
        SELECT id, booking_enabled, minimum_notice_hours,
               booking_window_days
        FROM business_settings WHERE id = 1
      `).first(),
    ]);

    return reply({
      success: true,
      services: services.results.map((row) => mapService(row)),
      hours: hours.results.map((row) => ({
        ...row,
        is_open: row.is_open === 1,
      })),
      blocks: blocks.results,
      settings: settings
        ? {
            ...settings,
            booking_enabled: settings.booking_enabled === 1,
          }
        : null,
    });
  } catch (error) {
    console.error("Business GET:", error);
    return reply({ error: "Unable to load business data." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    if (!(await authorize(request))) {
      return reply({ error: "Administrator access required." }, 403);
    }

    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply({ error: "Invalid request." }, 400);
    }

    const input = body as Record<string, unknown>;
    const action = input.action;
    const db = getD1();

    if (action === "saveService") {
      if (
        !input.service ||
        typeof input.service !== "object" ||
        Array.isArray(input.service)
      ) {
        return reply({ error: "Missing service." }, 400);
      }

      const service = normalizeService(
        input.service as Record<string, unknown>
      );

      validDuration(service.duration_minutes);

      const id = input.id;

      if (id != null) {
        if (typeof id !== "string" || !id.trim()) {
          return reply({ error: "Invalid service ID." }, 400);
        }

        const result = await db.prepare(`
          UPDATE services
          SET name = ?, category = ?, description = ?, price = ?,
              price_is_starting_at = ?, duration_minutes = ?,
              is_active = ?, sort_order = ?,
              image_path = COALESCE(?, image_path)
          WHERE id = ?
        `).bind(
          service.name,
          service.category,
          service.description,
          service.price,
          service.price_is_starting_at,
          service.duration_minutes,
          service.is_active,
          service.sort_order,
          service.image_path,
          id
        ).run();

        if (!result.meta.changes) {
          return reply({ error: "Service not found." }, 404);
        }
      } else {
        await db.prepare(`
          INSERT INTO services (
            id, name, category, description, price,
            price_is_starting_at, duration_minutes,
            is_active, sort_order, image_path
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          service.name,
          service.category,
          service.description,
          service.price,
          service.price_is_starting_at,
          service.duration_minutes,
          service.is_active,
          service.sort_order,
          service.image_path
        ).run();
      }

      return reply({ success: true });
    }

    if (action === "toggleService") {
      const id = stringValue(input.id, 100);
      if (!id) throw new Error("Missing service ID.");

      const active = flag(input.is_active);

      const result = await db.prepare(`
        UPDATE services SET is_active = ? WHERE id = ?
      `).bind(active, id).run();

      if (!result.meta.changes) {
        return reply({ error: "Service not found." }, 404);
      }

      return reply({ success: true });
    }

    if (action === "saveHours") {
      if (!Array.isArray(input.hours) || input.hours.length !== 7) {
        return reply({ error: "Seven business days are required." }, 400);
      }

      const days = input.hours.map((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new Error("Invalid business hours.");
        }

        const row = item as Record<string, unknown>;
        const day = integer(row.day_of_week, 0, 6);
        const open = time(row.open_time);
        const close = time(row.close_time);

        if (close <= open) {
          throw new Error("Closing time must be later than opening time.");
        }

        return {
          day,
          is_open: flag(row.is_open),
          open,
          close,
        };
      });

      if (new Set(days.map((day) => day.day)).size !== 7) {
        throw new Error("Business days must be unique.");
      }

      await db.batch(
        days.map((day) =>
          db.prepare(`
            INSERT INTO business_hours (
              day_of_week, is_open, open_time, close_time
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(day_of_week) DO UPDATE SET
              is_open = excluded.is_open,
              open_time = excluded.open_time,
              close_time = excluded.close_time
          `).bind(day.day, day.is_open, day.open, day.close)
        )
      );

      return reply({ success: true });
    }

    if (action === "addBlock") {
      const start = timestamp(input.starts_at);
      const end = timestamp(input.ends_at);

      if (end <= start) {
        throw new Error("End time must follow start time.");
      }

      if ((Date.parse(end) - Date.parse(start)) > 366 * 86400000) {
        throw new Error("Unavailable period is too long.");
      }

      const reason =
        input.reason == null
          ? null
          : stringValue(input.reason, 200) || null;

      await db.prepare(`
        INSERT INTO availability_blocks (
          id, starts_at, ends_at, reason
        ) VALUES (?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        start,
        end,
        reason
      ).run();

      return reply({ success: true });
    }

    if (action === "removeBlock") {
      const id = stringValue(input.id, 100);
      if (!id) throw new Error("Missing block ID.");

      const result = await db.prepare(`
        DELETE FROM availability_blocks WHERE id = ?
      `).bind(id).run();

      if (!result.meta.changes) {
        return reply({ error: "Unavailable period not found." }, 404);
      }

      return reply({ success: true });
    }

    if (action === "saveSettings") {
      const result = await db.prepare(`
        UPDATE business_settings
        SET booking_enabled = ?,
            minimum_notice_hours = ?,
            booking_window_days = ?
        WHERE id = 1
      `).bind(
        flag(input.booking_enabled),
        integer(input.minimum_notice_hours, 0, 8760),
        integer(input.booking_window_days, 1, 365)
      ).run();

      if (!result.meta.changes) {
        return reply({ error: "Business settings not found." }, 404);
      }

      return reply({ success: true });
    }

    return reply({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("Business POST:", error);

    const message =
      error instanceof Error ? error.message : "Unable to save changes.";

    const conflict =
      /UNIQUE constraint|FOREIGN KEY constraint|overlaps an active booking/i
        .test(message);

    return reply({
      error: conflict
        ? "This change conflicts with an existing record or appointment."
        : /constraint failed/i.test(message)
        ? "The change does not meet the database requirements."
        : message,
    }, conflict ? 409 : 400);
  }
}