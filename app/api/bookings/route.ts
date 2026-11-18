import { getD1 } from "@/lib/d1";

import { env } from "cloudflare:workers";

import { Resend } from "resend";

export const runtime = "edge";

type BookingRequest = {
  serviceId?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;
  customerNotes?: unknown;
  startsAt?: unknown;
  turnstileToken?: unknown;
};

type TurnstileResult = {
  success?: boolean;
  hostname?: string;
  "error-codes"?: string[];
};

const MAX_REQUEST_BYTES = 12_000;

function respond(
  data: Record<string, unknown>,
  status: number
): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function getEnvironment(name: string): string {
  const bindings = env as unknown as Record<
    string,
    unknown
  >;

  const bindingValue = bindings[name];

  if (
    typeof bindingValue === "string" &&
    bindingValue.trim().length > 0
  ) {
    return bindingValue.trim();
  }

  const processValue = process.env[name];

  if (
    typeof processValue === "string" &&
    processValue.trim().length > 0
  ) {
    return processValue.trim();
  }

  throw new Error(
    `Missing server configuration: ${name}`
  );
}

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAppointment(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

// --------------------------------------------------
// CLOUDFLARE TURNSTILE
// --------------------------------------------------

async function verifyTurnstile(
  token: string,
  secret: string,
  expectedHostname: string
): Promise<boolean> {
  const form = new FormData();

  form.append("secret", secret);
  form.append("response", token);

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 8000);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: form,
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      console.error(
        "Turnstile HTTP error:",
        response.status
      );
      return false;
    }

    const result =
      (await response.json()) as TurnstileResult;

    if (!result.success) {
      console.error(
        "Turnstile verification failed:",
        result["error-codes"] ?? []
      );
      return false;
    }

    // Official Cloudflare always-pass test secret.
    // Local development only.
    const isDevelopmentTestKey =
      secret ===
      "1x0000000000000000000000000000000AA";

    if (isDevelopmentTestKey) {
      if (expectedHostname !== "localhost") {
        console.error(
          "Test Turnstile key is restricted to localhost."
        );
        return false;
      }

      return true;
    }

    if (
      !result.hostname ||
      result.hostname !== expectedHostname
    ) {
      console.error(
        "Turnstile hostname verification failed."
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Turnstile request error:",
      error instanceof Error
        ? error.message
        : "Unknown verification error"
    );

    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// --------------------------------------------------
// RESEND EMAIL NOTIFICATIONS
// --------------------------------------------------

type NotificationDetails = {
  bookingId: string;
  serviceName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startsAt: Date;
};

async function sendBookingNotifications(
  details: NotificationDetails
): Promise<void> {
  let resend: Resend;
  let fromEmail: string;
  let adminEmail: string;

  try {
    resend = new Resend(
      getEnvironment("RESEND_API_KEY")
    );

    fromEmail = getEnvironment(
      "BOOKING_FROM_EMAIL"
    );

    adminEmail = getEnvironment(
      "PAOLA_ADMIN_EMAIL"
    );
  } catch {
    console.error(
      "Booking email configuration is missing."
    );
    return;
  }

  const {
    bookingId,
    serviceName,
    customerName,
    customerEmail,
    customerPhone,
    startsAt,
  } = details;

  const dateLabel = formatAppointment(startsAt);

  const safeName = escapeHtml(customerName);
  const safeEmail = escapeHtml(customerEmail);
  const safePhone = escapeHtml(customerPhone);
  const safeService = escapeHtml(serviceName);
  const safeDate = escapeHtml(dateLabel);
  const safeBookingId = escapeHtml(bookingId);

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;
                max-width:600px;margin:auto;
                color:#222;line-height:1.6">
      <h1 style="color:#111">
        New Appointment Request
      </h1>

      <p>
        A customer has requested an appointment
        with Paola Makeup & Hair Styles.
      </p>

      <h2>Booking Details</h2>

      <p><strong>Customer:</strong> ${safeName}</p>
      <p><strong>Email:</strong> ${safeEmail}</p>
      <p><strong>Phone:</strong> ${safePhone}</p>
      <p><strong>Service:</strong> ${safeService}</p>
      <p><strong>Date:</strong> ${safeDate}</p>
      <p><strong>Status:</strong> Pending</p>

      <p>
        <strong>Booking ID:</strong>
        ${safeBookingId}
      </p>

      <hr />

      <p>
        Sign in to your admin dashboard
        to review this appointment.
      </p>

      <p>Paola Makeup & Hair Styles</p>
    </div>
  `;

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;
                max-width:600px;margin:auto;
                color:#222;line-height:1.6">
      <h1>Thank You, ${safeName}!</h1>

      <p>
        We've received your appointment request
        at Paola Makeup & Hair Styles.
      </p>

      <h2>Your Appointment Request</h2>

      <p><strong>Service:</strong> ${safeService}</p>
      <p><strong>Date:</strong> ${safeDate}</p>
      <p><strong>Status:</strong> Pending Approval</p>

      <p>
        Your appointment is
        <strong>not confirmed yet</strong>.
        We'll review your request and notify
        you when a decision has been made.
      </p>

      <p>
        <strong>Booking ID:</strong>
        ${safeBookingId}
      </p>

      <hr />

      <p>
        Thank you for choosing
        Paola Makeup & Hair Styles.
      </p>
    </div>
  `;

  // Send independently so one failure does not
  // prevent the other notification.

  const results = await Promise.allSettled([
    resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `New Booking Request - ${serviceName}`,
      html: adminHtml,
    }),

    resend.emails.send({
      from: fromEmail,
      to: [customerEmail],
      subject:
        "Appointment Request Received - Paola Makeup & Hair Styles",
      html: customerHtml,
    }),
  ]);

  for (let index = 0; index < results.length; index++) {
    const result = results[index];

    const notificationType =
      index === 0 ? "admin" : "customer";

    if (result.status === "rejected") {
      console.error(
        `Resend ${notificationType} notification failed.`
      );
      continue;
    }

    if (result.value.error) {
      console.error(
        `Resend ${notificationType} notification error:`,
        result.value.error.name
      );
      continue;
    }

    console.info(
      `Resend ${notificationType} notification accepted.`
    );
  }
}

// --------------------------------------------------
// POST /api/bookings
// --------------------------------------------------

// PAOLA_D1_BOOKING_MIGRATION
// Database operations run server-side. No D1 access from the browser.

type D1Service = {
  id: string;
  name: string;
  price: string;
  duration_minutes: number;
  is_active: number;
};

type D1Settings = {
  timezone: string;
  booking_enabled: number;
  minimum_notice_hours: number;
  booking_window_days: number;
};

type D1Hours = {
  day_of_week: number;
  is_open: number;
  open_time: string;
  close_time: string;
};

class BookingRuleError extends Error {}

function getLocalParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    dayOfWeek: new Date(
      Date.UTC(year, month - 1, day)
    ).getUTCDay(),
  };
}

function toSeconds(value: string): number {
  const pieces = value.split(":").map(Number);

  if (
    pieces.length < 2 ||
    pieces.length > 3 ||
    pieces.some((part) => !Number.isInteger(part))
  ) {
    throw new Error("Invalid business hours.");
  }

  return pieces[0] * 3600 +
    pieces[1] * 60 +
    (pieces[2] ?? 0);
}

async function createD1Booking(
  db: D1Database,
  details: {
    serviceId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerNotes: string;
    appointmentDate: Date;
  }
): Promise<{ bookingId: string; serviceName: string }> {
  const {
    serviceId,
    customerName,
    customerEmail,
    customerPhone,
    customerNotes,
    appointmentDate,
  } = details;

  const service = await db
    .prepare(
      `SELECT id, name, price, duration_minutes, is_active
       FROM services WHERE id = ?`
    )
    .bind(serviceId)
    .first<D1Service>();

  if (!service || !service.is_active) {
    throw new BookingRuleError("Service is unavailable");
  }

  const settings = await db
    .prepare(
      `SELECT timezone, booking_enabled,
              minimum_notice_hours, booking_window_days
       FROM business_settings WHERE id = 1`
    )
    .first<D1Settings>();

  if (!settings || !settings.booking_enabled) {
    throw new BookingRuleError(
      "Online booking is unavailable"
    );
  }

  const startMs = appointmentDate.getTime();
  const nowMs = Date.now();

  if (
    startMs <
    nowMs + settings.minimum_notice_hours * 3600000
  ) {
    throw new BookingRuleError(
      "Booking does not meet minimum notice"
    );
  }

  if (
    startMs >
    nowMs + settings.booking_window_days * 86400000
  ) {
    throw new BookingRuleError(
      "Booking date is too far in advance"
    );
  }

  const endDate = new Date(
    startMs + service.duration_minutes * 60000
  );

  const startLocal = getLocalParts(
    appointmentDate,
    settings.timezone
  );

  const endLocal = getLocalParts(
    endDate,
    settings.timezone
  );

  const hours = await db
    .prepare(
      `SELECT day_of_week, is_open, open_time, close_time
       FROM business_hours WHERE day_of_week = ?`
    )
    .bind(startLocal.dayOfWeek)
    .first<D1Hours>();

  if (!hours || !hours.is_open) {
    throw new BookingRuleError(
      "Business is closed on this day"
    );
  }

  if (
    startLocal.date !== endLocal.date ||
    toSeconds(startLocal.time) < toSeconds(hours.open_time) ||
    toSeconds(endLocal.time) > toSeconds(hours.close_time)
  ) {
    throw new BookingRuleError(
      "Appointment is outside business hours"
    );
  }

  const startsAt = appointmentDate.toISOString();
  const endsAt = endDate.toISOString();

  const blocked = await db
    .prepare(
      `SELECT id FROM availability_blocks
       WHERE starts_at < ? AND ends_at > ?
       LIMIT 1`
    )
    .bind(endsAt, startsAt)
    .first();

  if (blocked) {
    throw new BookingRuleError(
      "Selected time is unavailable"
    );
  }

  const bookingId = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO bookings (
          id,
          service_id,
          customer_name,
          customer_email,
          customer_phone,
          customer_notes,
          starts_at,
          ends_at,
          quoted_price,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .bind(
        bookingId,
        serviceId,
        customerName,
        customerEmail,
        customerPhone,
        customerNotes || null,
        startsAt,
        endsAt,
        service.price
      )
      .run();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";

    // SQLite trigger errors vary by driver; do not expose
    // raw database errors to customers.
    if (
      /overlap|already booked|conflict/i.test(message)
    ) {
      throw new BookingRuleError(
        "Selected time is already booked"
      );
    }

    if (/blocked|unavailable/i.test(message)) {
      throw new BookingRuleError(
        "Selected time is unavailable"
      );
    }

    throw error;
  }

  return {
    bookingId,
    serviceName: service.name,
  };
}
export async function POST(request: Request) {
  try {
    // 1. Validate request format.

    const contentType =
      request.headers.get("content-type") ?? "";

    if (
      !contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      return respond(
        { error: "JSON requests are required." },
        415
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") ?? "0"
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_REQUEST_BYTES
    ) {
      return respond(
        { error: "Request is too large." },
        413
      );
    }

    const rawBody = await request.text();

    if (
      new TextEncoder().encode(rawBody).length >
      MAX_REQUEST_BYTES
    ) {
      return respond(
        { error: "Request is too large." },
        413
      );
    }

    let body: BookingRequest;

    try {
      const parsed: unknown = JSON.parse(rawBody);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("Invalid body");
      }

      body = parsed as BookingRequest;
    } catch {
      return respond(
        { error: "Invalid request format." },
        400
      );
    }

    // 2. Validate customer details.

    const serviceId = getString(body.serviceId);

    const customerName = getString(
      body.customerName
    );

    const customerEmail = getString(
      body.customerEmail
    ).toLowerCase();

    const customerPhone = getString(
      body.customerPhone
    );

    const customerNotes = getString(
      body.customerNotes
    );

    const startsAt = getString(body.startsAt);

    const turnstileToken = getString(
      body.turnstileToken
    );

    if (!isUUID(serviceId)) {
      return respond(
        { error: "Please select a valid service." },
        400
      );
    }

    if (
      customerName.length < 2 ||
      customerName.length > 150
    ) {
      return respond(
        { error: "Please enter your full name." },
        400
      );
    }

    if (
      !isEmail(customerEmail) ||
      customerEmail.length > 254
    ) {
      return respond(
        { error: "Please enter a valid email address." },
        400
      );
    }

    if (
      customerPhone.length < 7 ||
      customerPhone.length > 30
    ) {
      return respond(
        { error: "Please enter a valid phone number." },
        400
      );
    }

    if (customerNotes.length > 1000) {
      return respond(
        {
          error:
            "Additional notes must be under 1000 characters.",
        },
        400
      );
    }

    const hasTimezone =
      /(?:Z|[+-]\d{2}:\d{2})$/i.test(startsAt);

    const appointmentDate = new Date(startsAt);

    if (
      !hasTimezone ||
      !Number.isFinite(
        appointmentDate.getTime()
      )
    ) {
      return respond(
        {
          error:
            "Please select a valid appointment time.",
        },
        400
      );
    }

    if (!turnstileToken) {
      return respond(
        {
          error:
            "Please complete security verification.",
        },
        400
      );
    }

    // 3. Verify request origin and Turnstile.

    const requestUrl = new URL(request.url);
    const origin = request.headers.get("origin");

    if (origin) {
      let originUrl: URL;

      try {
        originUrl = new URL(origin);
      } catch {
        return respond(
          { error: "Invalid request origin." },
          403
        );
      }

      if (originUrl.origin !== requestUrl.origin) {
        return respond(
          {
            error:
              "Request origin is not allowed.",
          },
          403
        );
      }
    }

    const turnstileSecret = getEnvironment(
      "TURNSTILE_SECRET_KEY"
    );

    const verified = await verifyTurnstile(
      turnstileToken,
      turnstileSecret,
      requestUrl.hostname
    );

    if (!verified) {
      return respond(
        {
          error:
            "Security verification failed. Please try again.",
        },
        403
      );
    }

    // 4. Save the appointment in Cloudflare D1.
    // Turnstile and request validation have already passed.

    const db = getD1();

    if (!db) {
      throw new Error("Cloudflare D1 binding DB is unavailable.");
    }

    let bookingId: string;
    let serviceName: string;

    try {
      const created = await createD1Booking(db, {
        serviceId,
        customerName,
        customerEmail,
        customerPhone,
        customerNotes,
        appointmentDate,
      });

      bookingId = created.bookingId;
      serviceName = created.serviceName;
    } catch (error) {
      if (error instanceof BookingRuleError) {
        return respond({ error: error.message }, 409);
      }

      console.error(
        "D1 booking insert failed:",
        error instanceof Error ? error.message : "Unknown error"
      );

      return respond(
        {
          error:
            "Unable to save the appointment. Please try again.",
        },
        500
      );
    }

    // 5. Booking successfully saved in D1.
    // Notification failures must not undo the booking.

    // 7. Attempt email notifications.
    // Never return a booking failure after the
    // appointment has already been saved.

    try {
      await sendBookingNotifications({
        bookingId,
        serviceName,
        customerName,
        customerEmail,
        customerPhone,
        startsAt: appointmentDate,
      });
    } catch {
      console.error(
        "Booking notifications could not complete."
      );
    }

    // 8. Return the existing success response.

    return respond(
      {
        success: true,
        bookingId,
        status: "pending",
        message:
          "Your appointment request has been received.",
      },
      201
    );
  } catch (error) {
    console.error(
      "Booking API failure:",
      error instanceof Error
        ? error.message
        : "Unknown server error"
    );

    return respond(
      {
        error:
          "Booking is temporarily unavailable. Please try again later.",
      },
      500
    );
  }
}
