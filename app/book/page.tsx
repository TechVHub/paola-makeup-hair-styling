
"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Turnstile } from "@marsidev/react-turnstile";
import { getSupabase } from "../../lib/supabase";
import styles from "./page.module.css";

type Service = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  price_is_starting_at: boolean;
  duration_minutes: number;
};

type AvailableSlot = {
  starts_at: string;
};

type BookingSuccess = {
  bookingId: string;
  serviceName: string;
  startsAt: string;
  customerEmail: string;
};

const TIMEZONE = "America/New_York";

function formatPrice(service: Service): string {
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(service.price));

  return service.price_is_starting_at
    ? `From ${price}`
    : price;
}

function formatAppointment(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function BookingContent() {
  const searchParams = useSearchParams();
  const requestedService = searchParams.get("service");

  const turnstileRef =
    useRef<React.ElementRef<typeof Turnstile>>(null);

  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] =
    useState(true);

  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");

  const [success, setSuccess] =
    useState<BookingSuccess | null>(null);

  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  const selectedService = services.find(
    (service) => service.id === serviceId
  );

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // ----------------------------------------------------------
  // LOAD SERVICES
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;

    async function loadServices() {
      try {
        const { data, error: queryError } =
          await getSupabase()
            .from("services")
            .select(
              "id,name,category,description,price," +
                "price_is_starting_at,duration_minutes"
            )
            .eq("is_active", true)
            .order("sort_order");

        if (queryError) throw queryError;

        if (!active) return;

        const availableServices = (data ?? []) as Service[];
        setServices(availableServices);

        const requested = availableServices.find(
          (service) => service.id === requestedService
        );

        setServiceId(
          requested?.id ?? availableServices[0]?.id ?? ""
        );
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load services."
          );
        }
      } finally {
        if (active) setLoadingServices(false);
      }
    }

    loadServices();

    return () => {
      active = false;
    };
  }, [requestedService]);

  // ----------------------------------------------------------
  // LOAD AVAILABLE SLOTS
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;

    setSlots([]);
    setSelectedSlot("");
    setError("");

    if (!serviceId || !date) {
      setLoadingSlots(false);
      return;
    }

    async function loadSlots() {
      setLoadingSlots(true);

      try {
        const { data, error: queryError } =
          await getSupabase().rpc(
            "get_available_slots",
            {
              p_service_id: serviceId,
              p_date: date,
            }
          );

        if (queryError) throw queryError;

        if (active) {
          setSlots((data ?? []) as AvailableSlot[]);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load available times."
          );
        }
      } finally {
        if (active) setLoadingSlots(false);
      }
    }

    loadSlots();

    return () => {
      active = false;
    };
  }, [serviceId, date]);

  // ----------------------------------------------------------
  // SUBMIT BOOKING TO SECURE API
  // ----------------------------------------------------------

  async function submitBooking(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (submitting) return;

    setError("");

    if (!serviceId || !selectedSlot) {
      setError("Please select a service, date, and time.");
      return;
    }

    if (!turnstileToken) {
      setError(
        "Please complete the security verification."
      );
      return;
    }

    if (!selectedService) {
      setError("Please select a valid service.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceId,
          startsAt: selectedSlot,
          customerName,
          customerEmail,
          customerPhone,
          customerNotes,
          turnstileToken,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        bookingId?: string;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to complete your appointment request."
        );
      }

      setSuccess({
        bookingId: result.bookingId ?? "",
        serviceName: selectedService.name,
        startsAt: selectedSlot,
        customerEmail,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to complete booking."
      );

      // Turnstile tokens are single-use.
      setTurnstileToken("");
      turnstileRef.current?.reset();

      // Refresh availability after an unsuccessful attempt.
      if (serviceId && date) {
        const { data } = await getSupabase().rpc(
          "get_available_slots",
          {
            p_service_id: serviceId,
            p_date: date,
          }
        );

        setSlots((data ?? []) as AvailableSlot[]);
        setSelectedSlot("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ----------------------------------------------------------
  // SUCCESS PAGE
  // ----------------------------------------------------------

  if (success) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.successCard}>
            <span className={styles.eyebrow}>
              APPOINTMENT REQUEST RECEIVED
            </span>

            <h1>Thank You!</h1>

            <p>
              Your appointment request has been received
              successfully. Paola will review your request
              and confirm availability.
            </p>

            <div className={styles.successDetails}>
              <p>
                <strong>Service:</strong>{" "}
                {success.serviceName}
              </p>

              <p>
                <strong>Date & Time:</strong>{" "}
                {formatAppointment(success.startsAt)}
              </p>

              <p>
                <strong>Email:</strong>{" "}
                {success.customerEmail}
              </p>

              <p>
                <strong>Status:</strong> Pending confirmation
              </p>
            </div>

            <p className={styles.note}>
              Please note: Your appointment is not confirmed
              until Paola approves it.
            </p>

            <Link
              href="/"
              className={styles.primaryButton}
            >
              RETURN TO HOMEPAGE
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ----------------------------------------------------------
  // BOOKING FORM
  // ----------------------------------------------------------

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          PAOLA
          <span>MAKEUP & HAIR STYLES</span>
        </Link>

        <Link href="/" className={styles.backLink}>
          ← BACK TO WEBSITE
        </Link>
      </header>

      <div className={styles.container}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>
            THE PAOLA EXPERIENCE
          </span>

          <h1>Book Your Appointment</h1>

          <p>
            Choose your beauty service, select an available
            appointment, and submit your request.
          </p>
        </div>

        <div className={styles.bookingLayout}>
          <section className={styles.formPanel}>
            <form
              onSubmit={submitBooking}
              className={styles.form}
            >
              <div className={styles.sectionTitle}>
                <span>01</span>
                <h2>Choose Your Service</h2>
              </div>

              <label className={styles.field}>
                <span>Beauty Service</span>

                <select
                  required
                  disabled={loadingServices || submitting}
                  value={serviceId}
                  onChange={(event) => {
                    setServiceId(event.target.value);
                    setSelectedSlot("");
                  }}
                >
                  <option value="">
                    {loadingServices
                      ? "Loading services..."
                      : "Select a service"}
                  </option>

                  {services.map((service) => (
                    <option
                      key={service.id}
                      value={service.id}
                    >
                      {service.name} — {formatPrice(service)}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.sectionTitle}>
                <span>02</span>
                <h2>Select Date & Time</h2>
              </div>

              <label className={styles.field}>
                <span>Preferred Appointment Date</span>

                <input
                  type="date"
                  required
                  min={today}
                  value={date}
                  disabled={submitting}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setSelectedSlot("");
                  }}
                />
              </label>

              <div className={styles.timeSection}>
                <span className={styles.fieldLabel}>
                  Available Times (Eastern Time)
                </span>

                {!date && (
                  <p className={styles.helperText}>
                    Select a date to view available times.
                  </p>
                )}

                {loadingSlots && (
                  <p className={styles.helperText}>
                    Checking availability...
                  </p>
                )}

                {!loadingSlots &&
                  date &&
                  slots.length === 0 && (
                    <p className={styles.helperText}>
                      No available appointments on this
                      date. Please select another day.
                    </p>
                  )}

                <div className={styles.timeGrid}>
                  {slots.map((slot) => (
                    <button
                      key={slot.starts_at}
                      type="button"
                      disabled={submitting}
                      className={
                        selectedSlot === slot.starts_at
                          ? styles.selectedTime
                          : styles.timeButton
                      }
                      onClick={() =>
                        setSelectedSlot(slot.starts_at)
                      }
                    >
                      {formatTime(slot.starts_at)}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.sectionTitle}>
                <span>03</span>
                <h2>Your Information</h2>
              </div>

              <label className={styles.field}>
                <span>Full Name</span>

                <input
                  required
                  minLength={2}
                  maxLength={150}
                  value={customerName}
                  disabled={submitting}
                  onChange={(event) =>
                    setCustomerName(event.target.value)
                  }
                  placeholder="Enter your full name"
                />
              </label>

              <label className={styles.field}>
                <span>Email Address</span>

                <input
                  type="email"
                  required
                  maxLength={254}
                  value={customerEmail}
                  disabled={submitting}
                  onChange={(event) =>
                    setCustomerEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                />
              </label>

              <label className={styles.field}>
                <span>Phone Number</span>

                <input
                  type="tel"
                  required
                  minLength={7}
                  maxLength={30}
                  value={customerPhone}
                  disabled={submitting}
                  onChange={(event) =>
                    setCustomerPhone(event.target.value)
                  }
                  placeholder="(555) 555-5555"
                />
              </label>

              <label className={styles.field}>
                <span>Additional Notes (Optional)</span>

                <textarea
                  rows={4}
                  maxLength={1000}
                  value={customerNotes}
                  disabled={submitting}
                  onChange={(event) =>
                    setCustomerNotes(event.target.value)
                  }
                  placeholder="Tell us about your desired look..."
                />
              </label>

              <div className={styles.securitySection}>
                <span className={styles.fieldLabel}>
                  Security Verification
                </span>

                {siteKey ? (
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={siteKey}
                    onSuccess={(token) =>
                      setTurnstileToken(token)
                    }
                    onExpire={() =>
                      setTurnstileToken("")
                    }
                    onError={() =>
                      setTurnstileToken("")
                    }
                    options={{
                      theme: "light",
                    }}
                  />
                ) : (
                  <p className={styles.error}>
                    Turnstile is not configured.
                  </p>
                )}
              </div>

              {error && (
                <div
                  className={styles.error}
                  role="alert"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={
                  submitting ||
                  !selectedSlot ||
                  !turnstileToken ||
                  !siteKey
                }
              >
                {submitting
                  ? "SUBMITTING REQUEST..."
                  : "REQUEST APPOINTMENT →"}
              </button>

              <p className={styles.note}>
                Appointments are subject to Paola's
                confirmation. No payment is collected
                through this form.
              </p>
            </form>
          </section>

          <aside className={styles.summaryPanel}>
            <span className={styles.eyebrow}>
              YOUR BEAUTY EXPERIENCE
            </span>

            <h2>Appointment Summary</h2>

            <div className={styles.summaryItem}>
              <span>SELECTED SERVICE</span>

              <strong>
                {selectedService?.name ??
                  "No service selected"}
              </strong>
            </div>

            <div className={styles.summaryItem}>
              <span>SERVICE PRICE</span>

              <strong>
                {selectedService
                  ? formatPrice(selectedService)
                  : "—"}
              </strong>
            </div>

            <div className={styles.summaryItem}>
              <span>DURATION</span>

              <strong>
                {selectedService
                  ? `${selectedService.duration_minutes} minutes`
                  : "—"}
              </strong>
            </div>

            <div className={styles.summaryItem}>
              <span>APPOINTMENT</span>

              <strong>
                {selectedSlot
                  ? formatAppointment(selectedSlot)
                  : "Not selected"}
              </strong>
            </div>

            <div className={styles.summaryNotice}>
              <strong>
                A PERSONALIZED BEAUTY EXPERIENCE
              </strong>

              <p>
                Your request will be reviewed before
                your appointment is confirmed.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <div className={styles.container}>
            Loading booking page...
          </div>
        </main>
      }
    >
      <BookingContent />
    </Suspense>
  );
}
