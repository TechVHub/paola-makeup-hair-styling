import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type ServiceRow = {
  duration_minutes: number;
};

type SettingsRow = {
  timezone: string;
  booking_enabled: number;
  minimum_notice_hours: number;
  booking_window_days: number;
};

type HoursRow = {
  open_time: string;
  close_time: string;
};

type IntervalRow = {
  starts_at: string;
  ends_at: string;
};

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function dateKey(parts: ReturnType<typeof localParts>) {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function localToUTC(
  date: string,
  hour: number,
  minute: number,
  timezone: string
): Date[] {
  const [year, month, day] = date.split("-").map(Number);

  const nominalUTC = Date.UTC(year, month - 1, day, hour, minute);
  const matches: Date[] = [];

  // Test all realistic UTC offsets in 15-minute increments.
  // This rejects nonexistent DST times and detects repeated times.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = new Date(nominalUTC - offset * 60_000);
    const parts = localParts(candidate, timezone);

    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute
    ) {
      matches.push(candidate);
    }
  }

  return matches.sort((a, b) => a.getTime() - b.getTime());
}

function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlaps(
  start: number,
  end: number,
  interval: IntervalRow
): boolean {
  return (
    start < Date.parse(interval.ends_at) &&
    end > Date.parse(interval.starts_at)
  );
}

export async function GET(request: NextRequest) {
  try {
    const serviceId = request.nextUrl.searchParams.get("serviceId");
    const date = request.nextUrl.searchParams.get("date");

    if (
      !serviceId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId) ||
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return NextResponse.json(
        { error: "Valid serviceId and date are required." },
        { status: 400 }
      );
    }

    const [year, month, day] = date.split("-").map(Number);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));

    if (
      Number.isNaN(calendarDate.getTime()) ||
      calendarDate.getUTCFullYear() !== year ||
      calendarDate.getUTCMonth() !== month - 1 ||
      calendarDate.getUTCDate() !== day
    ) {
      return NextResponse.json(
        { error: "Invalid calendar date." },
        { status: 400 }
      );
    }

    const db = getD1();

    const [service, settings] = await Promise.all([
      db.prepare(
        "SELECT duration_minutes FROM services WHERE id = ? AND is_active = 1"
      ).bind(serviceId).first<ServiceRow>(),
      db.prepare(
        "SELECT timezone, booking_enabled, minimum_notice_hours, booking_window_days FROM business_settings WHERE id = 1"
      ).first<SettingsRow>(),
    ]);

    if (!service || !settings || settings.booking_enabled !== 1) {
      return NextResponse.json(
        { slots: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const timezone = settings.timezone;
    const now = new Date();
    const today = dateKey(localParts(now, timezone));
    const maximumTime =
      now.getTime() + settings.booking_window_days * 86_400_000;

    const maximumDate = dateKey(
      localParts(new Date(maximumTime), timezone)
    );

    if (date < today || date > maximumDate) {
      return NextResponse.json(
        { slots: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const dayOfWeek = calendarDate.getUTCDay();

    const hours = await db.prepare(
      "SELECT open_time, close_time FROM business_hours WHERE day_of_week = ? AND is_open = 1"
    ).bind(dayOfWeek).first<HoursRow>();

    if (!hours) {
      return NextResponse.json(
        { slots: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const openMinutes = minutesFromTime(hours.open_time);
    const closeMinutes = minutesFromTime(hours.close_time);
    const minimumTime =
      now.getTime() + settings.minimum_notice_hours * 3_600_000;

    // Fetch only intervals that could overlap the requested local day.
    // A 48-hour UTC envelope safely covers local DST transitions.
    const envelopeStart = new Date(
      Date.UTC(year, month - 1, day) - 24 * 3_600_000
    ).toISOString();

    const envelopeEnd = new Date(
      Date.UTC(year, month - 1, day + 1) + 24 * 3_600_000
    ).toISOString();

    const [bookingsResult, blocksResult] = await Promise.all([
      db.prepare(`
        SELECT starts_at, ends_at
        FROM bookings
        WHERE status IN ('pending', 'confirmed', 'completed')
          AND starts_at < ?
          AND ends_at > ?
      `).bind(envelopeEnd, envelopeStart).all<IntervalRow>(),

      db.prepare(`
        SELECT starts_at, ends_at
        FROM availability_blocks
        WHERE starts_at < ?
          AND ends_at > ?
      `).bind(envelopeEnd, envelopeStart).all<IntervalRow>(),
    ]);

    const unavailable = [
      ...bookingsResult.results,
      ...blocksResult.results,
    ];

    const slots: { starts_at: string }[] = [];

    // Existing scheduling rules use 30-minute increments.
    for (let slotNumber = 0; slotNumber < 48; slotNumber++) {
      const startMinutes = slotNumber * 30;

      if (startMinutes < openMinutes) continue;
      if (startMinutes + service.duration_minutes > closeMinutes) continue;

      const hour = Math.floor(startMinutes / 60);
      const minute = startMinutes % 60;

      const candidates = localToUTC(date, hour, minute, timezone);

      // PostgreSQL resolves an ambiguous fall-back local time to the
      // standard-time occurrence. Preserve that single-slot behavior.
      const candidate = candidates.at(-1);

      if (!candidate) continue;

      const start = candidate.getTime();
      const end = start + service.duration_minutes * 60_000;

      if (start < minimumTime || start > maximumTime) continue;

      if (unavailable.some((item) => overlaps(start, end, item))) {
        continue;
      }

      slots.push({ starts_at: candidate.toISOString() });
    }

    slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    return NextResponse.json(
      { slots },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("D1 availability lookup failed:", error);

    return NextResponse.json(
      { error: "Unable to load appointment availability." },
      { status: 500 }
    );
  }
}
