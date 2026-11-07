
"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "../../../lib/supabase";
import styles from "./page.module.css";

type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "declined";

type Booking = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_notes: string | null;
  starts_at: string;
  ends_at: string;
  quoted_price: number;
  status: BookingStatus;
  created_at: string;
  services: {
    name: string;
    duration_minutes: number;
  } | null;
};

type Filter = "all" | BookingStatus;

type UpdateResult = {
  success?: boolean;
  error?: string;
  emailSent?: boolean;
  emailRequired?: boolean;
};

const TIMEZONE = "America/New_York";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabase();

      const { data, error: queryError } = await supabase
        .from("bookings")
        .select(`
          id,
          customer_name,
          customer_email,
          customer_phone,
          customer_notes,
          starts_at,
          ends_at,
          quoted_price,
          status,
          created_at,
          services (
            name,
            duration_minutes
          )
        `)
        .order("starts_at", { ascending: true });

      if (queryError) throw queryError;

      setBookings(
        (data ?? []) as unknown as Booking[]
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load appointments."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const supabase = getSupabase();

        const { data, error: userError } =
          await supabase.auth.getUser();

        if (userError || !data.user) {
          router.replace("/admin/login");
          return;
        }

        const { data: isAdmin, error: roleError } =
          await supabase.rpc("is_paola_admin");

        if (roleError || isAdmin !== true) {
          router.replace("/admin/login");
          return;
        }

        if (!active) return;

        setAdminEmail(data.user.email ?? "");
        setAuthorized(true);

        await loadBookings();
      } catch {
        if (active) {
          router.replace("/admin/login");
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [router, loadBookings]);

  async function updateStatus(
    booking: Booking,
    status: BookingStatus
  ) {
    if (updatingId) return;

    const approved = window.confirm(
      `Change ${booking.customer_name}'s appointment to "${status}"?`
    );

    if (!approved) return;

    setUpdatingId(booking.id);
    setError("");
    setMessage("");

    try {
      const supabase = getSupabase();

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const response = await fetch(
        "/api/admin/bookings/status",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            bookingId: booking.id,
            expectedStatus: booking.status,
            status,
          }),
        }
      );

      const result =
        (await response.json()) as UpdateResult;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to update appointment."
        );
      }

      if (
        result.emailRequired &&
        !result.emailSent
      ) {
        setMessage(
          `${booking.customer_name}'s appointment is now ${status}.`
        );

        setError(
          "The appointment was saved, but its email notification could not be sent. Check Resend before taking further action."
        );
      } else {
        setMessage(
          `${booking.customer_name}'s appointment is now ${status}.` +
            (result.emailRequired
              ? " Notification submitted to Resend."
              : "")
        );
      }

      await loadBookings();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update appointment."
      );
    } finally {
      setUpdatingId("");
    }
  }

  async function handleLogout() {
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } finally {
      router.replace("/admin/login");
    }
  }

  const filteredBookings = bookings.filter(
    (booking) =>
      filter === "all" ||
      booking.status === filter
  );

  const pending = bookings.filter(
    (booking) => booking.status === "pending"
  ).length;

  const confirmed = bookings.filter(
    (booking) => booking.status === "confirmed"
  ).length;

  const completed = bookings.filter(
    (booking) => booking.status === "completed"
  ).length;

  if (checking || !authorized) {
    return (
      <main className={styles.loadingPage}>
        Verifying admin access...
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          PAOLA
          <span>ADMIN PORTAL</span>
        </Link>

        <div className={styles.headerActions}>
          <span>{adminEmail}</span>

          <Link
            href="/"
            className={styles.siteLink}
          >
            VIEW WEBSITE ↗
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className={styles.logoutButton}
          >
            LOG OUT
          </button>
        </div>
      </header>

      <div className={styles.container}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>
              BUSINESS MANAGEMENT
            </span>

            <h1>Appointment Dashboard</h1>

            <p>
              Review and manage your customer bookings.
            </p>
          </div>

          <button
            type="button"
            onClick={loadBookings}
            className={styles.refreshButton}
            disabled={loading}
          >
            {loading ? "REFRESHING..." : "↻ REFRESH"}
          </button>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span>TOTAL BOOKINGS</span>
            <strong>{bookings.length}</strong>
          </div>

          <div className={styles.statCard}>
            <span>PENDING REQUESTS</span>
            <strong>{pending}</strong>
          </div>

          <div className={styles.statCard}>
            <span>CONFIRMED</span>
            <strong>{confirmed}</strong>
          </div>

          <div className={styles.statCard}>
            <span>COMPLETED</span>
            <strong>{completed}</strong>
          </div>
        </div>

        <section className={styles.appointments}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>
                BOOKING MANAGEMENT
              </span>

              <h2>Customer Appointments</h2>
            </div>

            <label className={styles.filterLabel}>
              <span>Filter</span>

              <select
                value={filter}
                onChange={(event) =>
                  setFilter(
                    event.target.value as Filter
                  )
                }
              >
                <option value="all">
                  All Appointments
                </option>
                <option value="pending">
                  Pending
                </option>
                <option value="confirmed">
                  Confirmed
                </option>
                <option value="completed">
                  Completed
                </option>
                <option value="cancelled">
                  Cancelled
                </option>
                <option value="declined">
                  Declined
                </option>
              </select>
            </label>
          </div>

          {error && (
            <div
              className={styles.error}
              role="alert"
            >
              {error}
            </div>
          )}

          {message && (
            <div
              className={styles.message}
              role="status"
            >
              {message}
            </div>
          )}

          {loading && (
            <p>Loading appointments...</p>
          )}

          {!loading &&
            filteredBookings.length === 0 && (
              <div className={styles.emptyState}>
                No appointments found for this filter.
              </div>
            )}

          <div className={styles.bookingList}>
            {filteredBookings.map((booking) => (
              <article
                key={booking.id}
                className={styles.bookingCard}
              >
                <div className={styles.bookingTop}>
                  <div>
                    <span
                      className={styles.bookingDate}
                    >
                      {formatDateTime(
                        booking.starts_at
                      )}
                    </span>

                    <h3>
                      {booking.services?.name ??
                        "Beauty Appointment"}
                    </h3>
                  </div>

                  <span
                    className={`${styles.status} ${
                      styles[booking.status]
                    }`}
                  >
                    {booking.status.toUpperCase()}
                  </span>
                </div>

                <div className={styles.bookingDetails}>
                  <div>
                    <span>CUSTOMER</span>
                    <strong>
                      {booking.customer_name}
                    </strong>
                  </div>

                  <div>
                    <span>EMAIL</span>
                    <strong>
                      {booking.customer_email}
                    </strong>
                  </div>

                  <div>
                    <span>PHONE</span>
                    <strong>
                      {booking.customer_phone}
                    </strong>
                  </div>

                  <div>
                    <span>PRICE</span>
                    <strong>
                      {formatMoney(
                        booking.quoted_price
                      )}
                    </strong>
                  </div>
                </div>

                {booking.customer_notes && (
                  <div className={styles.notes}>
                    <strong>
                      Customer Notes
                    </strong>

                    <p>
                      {booking.customer_notes}
                    </p>
                  </div>
                )}

                <div className={styles.bookingActions}>
                  {booking.status === "pending" && (
                    <>
                      <button
                        type="button"
                        className={
                          styles.confirmButton
                        }
                        disabled={Boolean(updatingId)}
                        onClick={() =>
                          updateStatus(
                            booking,
                            "confirmed"
                          )
                        }
                      >
                        {updatingId === booking.id
                          ? "UPDATING..."
                          : "CONFIRM"}
                      </button>

                      <button
                        type="button"
                        className={
                          styles.declineButton
                        }
                        disabled={Boolean(updatingId)}
                        onClick={() =>
                          updateStatus(
                            booking,
                            "declined"
                          )
                        }
                      >
                        DECLINE
                      </button>
                    </>
                  )}

                  {booking.status === "confirmed" && (
                    <>
                      <button
                        type="button"
                        className={
                          styles.confirmButton
                        }
                        disabled={
                          Boolean(updatingId) ||
                          new Date(
                            booking.ends_at
                          ).getTime() > Date.now()
                        }
                        onClick={() =>
                          updateStatus(
                            booking,
                            "completed"
                          )
                        }
                        title={
                          new Date(
                            booking.ends_at
                          ).getTime() > Date.now()
                            ? "You cannot complete a future appointment."
                            : "Mark appointment completed"
                        }
                      >
                        MARK COMPLETED
                      </button>

                      <button
                        type="button"
                        className={
                          styles.declineButton
                        }
                        disabled={Boolean(updatingId)}
                        onClick={() =>
                          updateStatus(
                            booking,
                            "cancelled"
                          )
                        }
                      >
                        CANCEL
                      </button>
                    </>
                  )}

                  {[
                    "completed",
                    "cancelled",
                    "declined",
                  ].includes(booking.status) && (
                    <span className={styles.finalStatus}>
                      No further actions available
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
