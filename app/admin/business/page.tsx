
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";
import styles from "./page.module.css";

type Service = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  price_is_starting_at: boolean;
  duration_minutes: number;
  is_active: boolean;
  sort_order: number;
  image_path: string | null;
};

type BusinessHour = {
  id: string;
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

type TimeBlock = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

type Settings = {
  id: number;
  booking_enabled: boolean;
  minimum_notice_hours: number;
  booking_window_days: number;
};

type ServiceForm = {
  name: string;
  category: string;
  description: string;
  price: string;
  price_is_starting_at: boolean;
  duration_minutes: string;
  is_active: boolean;
  sort_order: string;
};

type Tab = "services" | "hours" | "blocks" | "settings";

const BUCKET = "paola-services";
const TIMEZONE = "America/New_York";

const DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

const EMPTY_SERVICE: ServiceForm = {
  name: "",
  category: "makeup",
  description: "",
  price: "0",
  price_is_starting_at: false,
  duration_minutes: "60",
  is_active: true,
  sort_order: "10",
};

const TIMES = Array.from({ length: 96 }, (_, i) => {
  const hours = Math.floor(i / 4);
  const minutes = (i % 4) * 15;
  return `${String(hours).padStart(2, "0")}:${String(
    minutes
  ).padStart(2, "0")}`;
}).concat("23:59");

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function servicePhotoUrl(path: string | null) {
  if (!path) return "";
  return getSupabase()
    .storage.from(BUCKET)
    .getPublicUrl(path).data.publicUrl;
}

// Interpret a date entered in Eastern Time, including DST.
function nyLocalToISO(value: string): string {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );

  if (!match) throw new Error("Invalid date or time.");

  const [, y, m, d, h, minute] = match;

  const base = Date.UTC(
    Number(y), Number(m) - 1, Number(d),
    Number(h), Number(minute)
  );

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const target = `${y}-${m}-${d} ${h}:${minute}`;
  const matches: Date[] = [];

  for (let offset = -12; offset <= 14; offset++) {
    const candidate = new Date(
      base + offset * 60 * 60 * 1000
    );

    const parts = formatter.formatToParts(candidate);
    const part = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";

    const local =
      `${part("year")}-${part("month")}-${part("day")} ` +
      `${part("hour")}:${part("minute")}`;

    if (local === target) matches.push(candidate);
  }

  if (matches.length !== 1) {
    throw new Error(
      "This time is invalid or ambiguous because of daylight saving time."
    );
  }

  return matches[0].toISOString();
}

export default function BusinessManagementPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("services");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [settings, setSettings] = useState<Settings | null>(
    null
  );

  const [editingId, setEditingId] = useState<string | null>(
    null
  );
  const [form, setForm] = useState<ServiceForm>({
    ...EMPTY_SERVICE,
  });
  const [selectedPhoto, setSelectedPhoto] =
    useState<File | null>(null);

  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const editingService = services.find(
    (service) => service.id === editingId
  );

  const loadData = useCallback(async () => {
    const supabase = getSupabase();

    const [s, h, b, cfg] = await Promise.all([
      supabase
        .from("services")
        .select("*")
        .order("sort_order"),
      supabase
        .from("business_hours")
        .select("*")
        .order("day_of_week"),
      supabase
        .from("availability_blocks")
        .select("*")
        .order("starts_at"),
      supabase
        .from("business_settings")
        .select(
          "id,booking_enabled,minimum_notice_hours,booking_window_days"
        )
        .eq("id", 1)
        .single(),
    ]);

    for (const result of [s, h, b, cfg]) {
      if (result.error) throw result.error;
    }

    setServices((s.data ?? []) as Service[]);
    setHours((h.data ?? []) as BusinessHour[]);
    setBlocks((b.data ?? []) as TimeBlock[]);
    setSettings(cfg.data as Settings);
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const supabase = getSupabase();

        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          router.replace("/admin/login");
          return;
        }

        const { data: admin, error: roleError } =
          await supabase.rpc("is_paola_admin");

        if (roleError || admin !== true) {
          router.replace("/admin/login");
          return;
        }

        if (!active) return;

        setAuthorized(true);
        await loadData();
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load business data."
          );
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    initialize();
    return () => { active = false; };
  }, [router, loadData]);

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  async function runAction(
    action: () => Promise<void>,
    success: string
  ) {
    if (busy) return;
    setBusy(true);
    clearFeedback();

    try {
      await action();
      await loadData();
      setMessage(success);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save changes."
      );
    } finally {
      setBusy(false);
    }
  }

  function resetService() {
    setEditingId(null);
    setForm({ ...EMPTY_SERVICE });
    setSelectedPhoto(null);
  }

  function editService(service: Service) {
    clearFeedback();
    setEditingId(service.id);
    setSelectedPhoto(null);
    setForm({
      name: service.name,
      category: service.category,
      description: service.description ?? "",
      price: String(service.price),
      price_is_starting_at: service.price_is_starting_at,
      duration_minutes: String(service.duration_minutes),
      is_active: service.is_active,
      sort_order: String(service.sort_order),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validatePhoto(file: File) {
    const types = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!types.includes(file.type)) {
      throw new Error(
        "Photo must be JPEG, PNG, or WebP."
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error(
        "Photo must be 5 MB or smaller."
      );
    }
  }

  async function uploadPhoto(file: File): Promise<string> {
    validatePhoto(file);

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
        ? "webp"
        : "jpg";

    const path = `${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await getSupabase()
      .storage.from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    return path;
  }

  async function saveService(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const price = Number(form.price);
    const duration = Number(form.duration_minutes);
    const order = Number(form.sort_order);

    if (
      !form.name.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(duration) ||
      duration < 15 ||
      duration > 480 ||
      duration % 15 !== 0 ||
      !Number.isInteger(order)
    ) {
      setError(
        "Check the service name, price, duration, and order."
      );
      return;
    }

    if (selectedPhoto) {
      try {
        validatePhoto(selectedPhoto);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Invalid photo."
        );
        return;
      }
    }

    await runAction(async () => {
      const supabase = getSupabase();
      let newPath: string | null = null;

      try {
        if (selectedPhoto) {
          newPath = await uploadPhoto(selectedPhoto);
        }

        const payload = {
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim() || null,
          price,
          price_is_starting_at: form.price_is_starting_at,
          duration_minutes: duration,
          is_active: form.is_active,
          sort_order: order,
          ...(newPath ? { image_path: newPath } : {}),
        };

        if (editingId) {
          const { data, error: updateError } =
            await supabase
              .from("services")
              .update(payload)
              .eq("id", editingId)
              .select("id");

          if (updateError) throw updateError;
          if (!data?.length) {
            throw new Error("Service update was not saved.");
          }
        } else {
          const { data, error: insertError } =
            await supabase
              .from("services")
              .insert(payload)
              .select("id");

          if (insertError) throw insertError;
          if (!data?.length) {
            throw new Error("Service was not created.");
          }
        }

        // Keep old files for now rather than risk deleting
        // an image referenced by another record.
        resetService();
      } catch (err) {
        if (newPath) {
          await supabase.storage
            .from(BUCKET)
            .remove([newPath]);
        }
        throw err;
      }
    }, "Service and photo saved successfully.");
  }

  async function toggleService(service: Service) {
    await runAction(async () => {
      const { data, error: updateError } =
        await getSupabase()
          .from("services")
          .update({ is_active: !service.is_active })
          .eq("id", service.id)
          .select("id");

      if (updateError) throw updateError;
      if (!data?.length) {
        throw new Error("Service was not updated.");
      }
    }, "Service availability updated.");
  }

  function updateHour(
    day: number,
    field: "is_open" | "open_time" | "close_time",
    value: boolean | string
  ) {
    setHours((current) =>
      current.map((hour) =>
        hour.day_of_week === day
          ? { ...hour, [field]: value }
          : hour
      )
    );
  }

  async function saveHours() {
    if (
      hours.some(
        (hour) =>
          hour.is_open &&
          hour.close_time <= hour.open_time
      )
    ) {
      setError(
        "Closing time must be later than opening time."
      );
      return;
    }

    await runAction(async () => {
      const payload = hours.map((hour) => ({
        day_of_week: hour.day_of_week,
        is_open: hour.is_open,
        open_time: hour.open_time,
        close_time: hour.close_time,
      }));

      const { error: updateError } =
        await getSupabase()
          .from("business_hours")
          .upsert(payload, {
            onConflict: "day_of_week",
          });

      if (updateError) throw updateError;
    }, "Business hours saved.");
  }

  async function addBlock(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    let start: string;
    let end: string;

    try {
      start = nyLocalToISO(blockStart);
      end = nyLocalToISO(blockEnd);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid date."
      );
      return;
    }

    if (new Date(end) <= new Date(start)) {
      setError("End time must be after start time.");
      return;
    }

    await runAction(async () => {
      const { error: insertError } =
        await getSupabase()
          .from("availability_blocks")
          .insert({
            starts_at: start,
            ends_at: end,
            reason: blockReason.trim() || null,
          });

      if (insertError) throw insertError;

      setBlockStart("");
      setBlockEnd("");
      setBlockReason("");
    }, "Unavailable time added.");
  }

  async function removeBlock(block: TimeBlock) {
    if (
      !window.confirm(
        "Remove this unavailable period?"
      )
    ) return;

    await runAction(async () => {
      const { error: deleteError } =
        await getSupabase()
          .from("availability_blocks")
          .delete()
          .eq("id", block.id);

      if (deleteError) throw deleteError;
    }, "Unavailable period removed.");
  }

  async function saveSettings() {
    if (!settings) return;

    if (
      !Number.isInteger(settings.minimum_notice_hours) ||
      settings.minimum_notice_hours < 0 ||
      !Number.isInteger(settings.booking_window_days) ||
      settings.booking_window_days < 1 ||
      settings.booking_window_days > 365
    ) {
      setError("Check booking settings.");
      return;
    }

    await runAction(async () => {
      const { error: updateError } =
        await getSupabase()
          .from("business_settings")
          .update({
            booking_enabled: settings.booking_enabled,
            minimum_notice_hours:
              settings.minimum_notice_hours,
            booking_window_days:
              settings.booking_window_days,
          })
          .eq("id", 1);

      if (updateError) throw updateError;
    }, "Booking settings saved.");
  }

  if (checking || !authorized) {
    return (
      <main className={styles.loading}>
        Verifying admin access...
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin" className={styles.brand}>
          PAOLA
          <span>BUSINESS ADMINISTRATION</span>
        </Link>

        <nav className={styles.headerNav}>
          <Link href="/admin">ADMIN HOME</Link>
          <Link href="/admin/dashboard">APPOINTMENTS</Link>
          <Link href="/admin/portfolio">PORTFOLIO</Link>
          <Link href="/">VIEW SITE ↗</Link>
        </nav>
      </header>

      <div className={styles.container}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>
            PAOLA MAKEUP & HAIR STYLES
          </span>
          <h1>Business Management</h1>
          <p>
            Manage services, photos, pricing, hours,
            unavailable dates, and online booking.
          </p>
        </div>

        <div className={styles.tabs}>
          {(
            [
              ["services", "SERVICES & PHOTOS"],
              ["hours", "BUSINESS HOURS"],
              ["blocks", "UNAVAILABLE DATES"],
              ["settings", "BOOKING SETTINGS"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                tab === value
                  ? styles.activeTab
                  : styles.tab
              }
              onClick={() => {
                setTab(value);
                clearFeedback();
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className={styles.message} role="status">
            {message}
          </div>
        )}

        {tab === "services" && (
          <div className={styles.columns}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>Current Services</h2>
                <span>{services.length} services</span>
              </div>

              <div className={styles.serviceList}>
                {services.map((service) => (
                  <article
                    key={service.id}
                    className={styles.serviceCard}
                  >
                    <div className={styles.serviceCardContent}>
                      {service.image_path ? (
                        <img
                          src={servicePhotoUrl(
                            service.image_path
                          )}
                          alt={service.name}
                          className={styles.serviceThumb}
                        />
                      ) : (
                        <div className={styles.photoPlaceholder}>
                          NO PHOTO
                        </div>
                      )}

                      <div>
                        <span className={styles.category}>
                          {service.category}
                        </span>
                        <h3>{service.name}</h3>
                        <p>
                          {service.price_is_starting_at
                            ? "From "
                            : ""}
                          {money(service.price)}
                          {" · "}
                          {service.duration_minutes} min
                        </p>
                        <span className={styles.status}>
                          {service.is_active
                            ? "ACTIVE"
                            : "INACTIVE"}
                        </span>
                      </div>
                    </div>

                    <div className={styles.actions}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => editService(service)}
                      >
                        EDIT / PHOTO
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggleService(service)}
                      >
                        {service.is_active
                          ? "DEACTIVATE"
                          : "ACTIVATE"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <h2>
                {editingId
                  ? "Edit Service & Photo"
                  : "Add New Service"}
              </h2>

              {editingService?.image_path && (
                <div className={styles.currentPhoto}>
                  <img
                    src={servicePhotoUrl(
                      editingService.image_path
                    )}
                    alt={editingService.name}
                  />
                  <p>Current service photo</p>
                </div>
              )}

              <form
                onSubmit={saveService}
                className={styles.form}
              >
                <label className={styles.field}>
                  <span>Service Photo</span>
                  <input
                    key={editingId ?? "new"}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      setSelectedPhoto(
                        event.target.files?.[0] ?? null
                      )
                    }
                  />
                  <small>
                    JPEG, PNG, or WebP. Maximum 5 MB.
                    Selecting a new image replaces the
                    picture displayed for this service.
                  </small>
                </label>

                {selectedPhoto && (
                  <p className={styles.help}>
                    New photo: {selectedPhoto.name}
                  </p>
                )}

                <label className={styles.field}>
                  <span>Service Name</span>
                  <input
                    required
                    maxLength={120}
                    value={form.name}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        name: e.target.value,
                      })
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Category</span>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        category: e.target.value,
                      })
                    }
                  >
                    <option value="makeup">Makeup</option>
                    <option value="bridal">Bridal</option>
                    <option value="hair">Hair Styling</option>
                    <option value="special_event">
                      Special Event
                    </option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        description: e.target.value,
                      })
                    }
                  />
                </label>

                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Price ($)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={form.price}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          price: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Duration</span>
                    <select
                      value={form.duration_minutes}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          duration_minutes: e.target.value,
                        })
                      }
                    >
                      {Array.from(
                        { length: 32 },
                        (_, i) => (i + 1) * 15
                      ).map((minutes) => (
                        <option
                          key={minutes}
                          value={minutes}
                        >
                          {minutes} minutes
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Display Order</span>
                  <input
                    type="number"
                    step="1"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sort_order: e.target.value,
                      })
                    }
                  />
                </label>

                <label className={styles.checkField}>
                  <input
                    type="checkbox"
                    checked={form.price_is_starting_at}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        price_is_starting_at:
                          e.target.checked,
                      })
                    }
                  />
                  Show price as "From $..."
                </label>

                <label className={styles.checkField}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        is_active: e.target.checked,
                      })
                    }
                  />
                  Available for customer booking
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  className={styles.primaryButton}
                >
                  {busy
                    ? "SAVING..."
                    : editingId
                    ? "SAVE SERVICE & PHOTO"
                    : "ADD SERVICE"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={resetService}
                    disabled={busy}
                  >
                    CANCEL EDIT
                  </button>
                )}
              </form>
            </section>
          </div>
        )}

        {tab === "hours" && (
          <section className={styles.panel}>
            <h2>Weekly Business Hours</h2>
            <p className={styles.help}>
              Times are Eastern Time. Changing business
              hours does not cancel existing bookings.
            </p>

            <div className={styles.hoursList}>
              {hours.map((hour) => (
                <div
                  key={hour.id}
                  className={styles.hoursRow}
                >
                  <strong>
                    {DAYS[hour.day_of_week]}
                  </strong>

                  <label className={styles.checkField}>
                    <input
                      type="checkbox"
                      checked={hour.is_open}
                      onChange={(e) =>
                        updateHour(
                          hour.day_of_week,
                          "is_open",
                          e.target.checked
                        )
                      }
                    />
                    Open
                  </label>

                  <select
                    disabled={!hour.is_open}
                    value={hour.open_time.slice(0, 5)}
                    onChange={(e) =>
                      updateHour(
                        hour.day_of_week,
                        "open_time",
                        e.target.value
                      )
                    }
                  >
                    {TIMES.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>

                  <span>to</span>

                  <select
                    disabled={!hour.is_open}
                    value={hour.close_time.slice(0, 5)}
                    onChange={(e) =>
                      updateHour(
                        hour.day_of_week,
                        "close_time",
                        e.target.value
                      )
                    }
                  >
                    {TIMES.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={busy}
              className={styles.primaryButton}
              onClick={saveHours}
            >
              SAVE BUSINESS HOURS
            </button>
          </section>
        )}

        {tab === "blocks" && (
          <div className={styles.columns}>
            <section className={styles.panel}>
              <h2>Unavailable Periods</h2>
              <p className={styles.help}>
                Blocked times are excluded from new
                customer bookings.
              </p>

              <div className={styles.serviceList}>
                {blocks.length === 0 && (
                  <p>No unavailable dates added yet.</p>
                )}

                {blocks.map((block) => (
                  <article
                    key={block.id}
                    className={styles.blockCard}
                  >
                    <div>
                      <strong>
                        {block.reason || "Unavailable"}
                      </strong>
                      <p>
                        {formatDate(block.starts_at)}
                        <br />
                        through
                        <br />
                        {formatDate(block.ends_at)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      className={styles.secondaryButton}
                      onClick={() => removeBlock(block)}
                    >
                      REMOVE
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <h2>Block Time</h2>

              <form
                onSubmit={addBlock}
                className={styles.form}
              >
                <label className={styles.field}>
                  <span>Start Date & Time (Eastern)</span>
                  <input
                    type="datetime-local"
                    required
                    value={blockStart}
                    onChange={(e) =>
                      setBlockStart(e.target.value)
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>End Date & Time (Eastern)</span>
                  <input
                    type="datetime-local"
                    required
                    value={blockEnd}
                    onChange={(e) =>
                      setBlockEnd(e.target.value)
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Reason (Optional)</span>
                  <input
                    maxLength={200}
                    value={blockReason}
                    onChange={(e) =>
                      setBlockReason(e.target.value)
                    }
                    placeholder="Vacation, personal day..."
                  />
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  className={styles.primaryButton}
                >
                  BLOCK THIS TIME
                </button>
              </form>

              <p className={styles.help}>
                For a full day, choose midnight through
                midnight the following day. Existing active
                bookings must be resolved before blocking.
              </p>
            </section>
          </div>
        )}

        {tab === "settings" && settings && (
          <section className={styles.panel}>
            <h2>Online Booking Settings</h2>

            <div className={styles.form}>
              <label className={styles.checkField}>
                <input
                  type="checkbox"
                  checked={settings.booking_enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      booking_enabled: e.target.checked,
                    })
                  }
                />
                Accept new online bookings
              </label>

              <label className={styles.field}>
                <span>Minimum Advance Notice (Hours)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={settings.minimum_notice_hours}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minimum_notice_hours:
                        Number(e.target.value),
                    })
                  }
                />
              </label>

              <label className={styles.field}>
                <span>Booking Window (Days)</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  step="1"
                  value={settings.booking_window_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      booking_window_days:
                        Number(e.target.value),
                    })
                  }
                />
              </label>

              <button
                type="button"
                disabled={busy}
                onClick={saveSettings}
                className={styles.primaryButton}
              >
                SAVE BOOKING SETTINGS
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
