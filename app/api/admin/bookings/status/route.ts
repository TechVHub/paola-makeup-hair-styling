
import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "edge";

type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "declined";

type StatusRequest = {
  bookingId?: unknown;
  status?: unknown;
  expectedStatus?: unknown;
};

type EmailStatus = "confirmed" | "declined" | "cancelled";

const transitions: Record<string, string[]> = {
  pending: ["confirmed", "declined"],
  confirmed: ["completed", "cancelled"],
};

function setting(name: string): string {
  const bindings = env as unknown as Record<string, unknown>;
  const value = bindings[name] ?? process.env[name];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing configuration: ${name}`);
  }

  return value.trim();
}

function json(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function getEmailContent(status: EmailStatus) {
  switch (status) {
    case "confirmed":
      return {
        subject:
          "Appointment Confirmed - Paola Makeup & Hair Styles",
        heading: "Your Appointment Is Confirmed!",
        description:
          "Great news! Your appointment has been confirmed. We look forward to seeing you.",
        statusLabel: "Confirmed",
      };

    case "declined":
      return {
        subject:
          "Appointment Update - Paola Makeup & Hair Styles",
        heading: "Your Appointment Request Update",
        description:
          "Unfortunately, we are unable to accept your appointment request at the selected time. Please visit our website to request another available appointment.",
        statusLabel: "Declined",
      };

    case "cancelled":
      return {
        subject:
          "Appointment Canceled - Paola Makeup & Hair Styles",
        heading: "Your Appointment Has Been Canceled",
        description:
          "We regret to inform you that your previously confirmed appointment has been canceled. We apologize for any inconvenience. If you would like to book another appointment, please visit our website to select a new available date and time.",
        statusLabel: "Canceled",
      };
  }
}

async function sendStatusEmail(
  email: string,
  customerName: string,
  serviceName: string,
  startsAt: string,
  status: EmailStatus
): Promise<boolean> {
  try {
    const resend = new Resend(
      setting("RESEND_API_KEY")
    );

    const content = getEmailContent(status);

    const html = `
      <div style="
        font-family:Arial,sans-serif;
        max-width:600px;
        margin:auto;
        color:#222;
        line-height:1.6;
      ">
        <h1>${escapeHtml(content.heading)}</h1>

        <p>Hello ${escapeHtml(customerName)},</p>

        <p>${escapeHtml(content.description)}</p>

        <h2>Appointment Details</h2>

        <p>
          <strong>Service:</strong>
          ${escapeHtml(serviceName)}
        </p>

        <p>
          <strong>Date:</strong>
          ${escapeHtml(formatDate(startsAt))}
        </p>

        <p>
          <strong>Status:</strong>
          ${escapeHtml(content.statusLabel)}
        </p>

        <hr />

        <p>
          Thank you for choosing
          Paola Makeup & Hair Styles.
        </p>
      </div>
    `;

    const result = await resend.emails.send({
      from: setting("BOOKING_FROM_EMAIL"),
      to: [email],
      subject: content.subject,
      html,
    });

    if (result.error) {
      console.error(
        "Resend status notification error:",
        result.error.name
      );
      return false;
    }

    console.info(
      "Appointment status email accepted by Resend."
    );

    return true;
  } catch (error) {
    console.error(
      "Appointment status email failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return false;
  }
}

export async function POST(request: Request) {
  try {
    // Require a JSON request from the same origin.
    const origin = request.headers.get("origin");

    if (origin && origin !== new URL(request.url).origin) {
      return json(
        { error: "Request origin is not allowed." },
        403
      );
    }

    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json")
    ) {
      return json(
        { error: "JSON is required." },
        415
      );
    }

    const bearer = request.headers.get("authorization");

    if (!bearer?.startsWith("Bearer ")) {
      return json(
        { error: "Authentication required." },
        401
      );
    }

    const token = bearer.slice(7).trim();

    if (!token) {
      return json(
        { error: "Authentication required." },
        401
      );
    }

    const bodyText = await request.text();

    if (bodyText.length > 4000) {
      return json(
        { error: "Request is too large." },
        413
      );
    }

    let body: StatusRequest;

    try {
      body = JSON.parse(bodyText) as StatusRequest;
    } catch {
      return json(
        { error: "Invalid JSON." },
        400
      );
    }

    const bookingId =
      typeof body.bookingId === "string"
        ? body.bookingId
        : "";

    const status =
      typeof body.status === "string"
        ? body.status
        : "";

    const expectedStatus =
      typeof body.expectedStatus === "string"
        ? body.expectedStatus
        : "";

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      !uuidPattern.test(bookingId) ||
      !transitions[expectedStatus]?.includes(status)
    ) {
      return json(
        { error: "Invalid appointment update." },
        400
      );
    }

    // Verify the Supabase user and admin role.
    const supabaseUrl = setting(
      "NEXT_PUBLIC_SUPABASE_URL"
    );

    const serviceKey = setting(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    // Use the admin's bearer token for role verification.
    const userClient = createClient(
      supabaseUrl,
      serviceKey,
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
      await userClient.auth.getUser(token);

    if (userError || !userData.user) {
      return json(
        { error: "Session expired. Sign in again." },
        401
      );
    }

    const { data: isAdmin, error: adminError } =
      await userClient.rpc("is_paola_admin");

    if (adminError || isAdmin !== true) {
      return json(
        { error: "Administrator access required." },
        403
      );
    }

    // Server-only client for the authorized update.
    const adminClient = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // Conditional update prevents stale dashboard actions.
    const { data: updated, error: updateError } =
      await adminClient
        .from("bookings")
        .update({
          status: status as BookingStatus,
        })
        .eq("id", bookingId)
        .eq("status", expectedStatus)
        .select(`
          id,
          customer_name,
          customer_email,
          starts_at,
          status,
          services(name)
        `);

    if (updateError) {
      console.error(
        "Appointment status update failed:",
        updateError.code
      );

      return json(
        {
          error:
            "Unable to update appointment. Please refresh and try again.",
        },
        409
      );
    }

    if (!updated || updated.length !== 1) {
      return json(
        {
          error:
            "This appointment has changed. Refresh and try again.",
        },
        409
      );
    }

    const booking = updated[0];

    // Completed appointments do not require an email.
    if (status === "completed") {
      return json(
        {
          success: true,
          status,
          emailSent: false,
          emailRequired: false,
          message: "Appointment marked as completed.",
        },
        200
      );
    }

    // Confirmed, declined, and cancelled send emails.
    const service = booking.services as unknown as
      | { name: string }
      | { name: string }[]
      | null;

    const serviceName = Array.isArray(service)
      ? service[0]?.name ?? "Beauty Appointment"
      : service?.name ?? "Beauty Appointment";

    const emailSent = await sendStatusEmail(
      booking.customer_email,
      booking.customer_name,
      serviceName,
      booking.starts_at,
      status as EmailStatus
    );

    return json(
      {
        success: true,
        status,
        emailSent,
        emailRequired: true,
        message: emailSent
          ? "Appointment updated. Email submitted to Resend."
          : "Appointment updated, but email could not be submitted.",
      },
      200
    );
  } catch (error) {
    console.error(
      "Admin appointment API error:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return json(
      { error: "Unable to process appointment." },
      500
    );
  }
}
