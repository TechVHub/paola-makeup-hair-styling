
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";
import styles from "./page.module.css";

type Photo = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  image_path: string;
  is_featured: boolean;
  sort_order: number;
};

const bucket = "paola-portfolio";

function photoUrl(path: string) {
  return getSupabase()
    .storage.from(bucket)
    .getPublicUrl(path).data.publicUrl;
}

export default function PortfolioAdminPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("makeup");
  const [description, setDescription] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPhotos = useCallback(async () => {
    const { data, error: queryError } = await getSupabase()
      .from("portfolio_photos")
      .select("*")
      .order("sort_order")
      .order("created_at", { ascending: false });

    if (queryError) throw queryError;

    setPhotos((data ?? []) as Photo[]);
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const supabase = getSupabase();

        const { data: userData } =
          await supabase.auth.getUser();

        if (!userData.user) {
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

        setAuthorized(true);
        await loadPhotos();
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load portfolio."
          );
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [router, loadPhotos]);

  async function uploadPhoto(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!file || !title.trim() || busy) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        file.type
      )
    ) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5 MB or smaller.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const supabase = getSupabase();

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
        ? "webp"
        : "jpg";

    const path = `${crypto.randomUUID()}.${extension}`;
    let uploaded = false;

    try {
      const { error: uploadError } =
        await supabase.storage
          .from(bucket)
          .upload(path, file, {
            contentType: file.type,
            upsert: false,
          });

      if (uploadError) throw uploadError;

      uploaded = true;

      const { error: insertError } =
        await supabase
          .from("portfolio_photos")
          .insert({
            title: title.trim(),
            category,
            description: description.trim() || null,
            image_path: path,
            is_featured: true,
            sort_order: photos.length + 1,
          });

      if (insertError) throw insertError;

      setTitle("");
      setDescription("");
      setFile(null);

      const input = document.getElementById(
        "portfolio-file"
      ) as HTMLInputElement | null;

      if (input) input.value = "";

      await loadPhotos();

      setMessage("Photo uploaded successfully.");
    } catch (err) {
      if (uploaded) {
        await supabase.storage
          .from(bucket)
          .remove([path]);
      }

      setError(
        err instanceof Error
          ? err.message
          : "Unable to upload photo."
      );
    } finally {
      setBusy(false);
    }
  }

  async function updatePhoto(
    photo: Photo,
    changes: Partial<Photo>
  ) {
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { error: updateError } =
        await getSupabase()
          .from("portfolio_photos")
          .update(changes)
          .eq("id", photo.id);

      if (updateError) throw updateError;

      await loadPhotos();
      setMessage("Portfolio updated.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update photo."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(photo: Photo) {
    if (
      busy ||
      !window.confirm(
        `Permanently delete "${photo.title}"?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const supabase = getSupabase();

      const { error: deleteError } =
        await supabase
          .from("portfolio_photos")
          .delete()
          .eq("id", photo.id);

      if (deleteError) throw deleteError;

      const { error: storageError } =
        await supabase.storage
          .from(bucket)
          .remove([photo.image_path]);

      await loadPhotos();

      if (storageError) {
        setMessage(
          "Gallery entry deleted. Storage cleanup needs attention."
        );
      } else {
        setMessage("Photo deleted.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete photo."
      );
    } finally {
      setBusy(false);
    }
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
          <span>PORTFOLIO ADMINISTRATION</span>
        </Link>

        <nav className={styles.headerNav}>
          <Link href="/admin">ADMIN HOME</Link>
          <Link href="/admin/dashboard">
            APPOINTMENTS
          </Link>
          <Link href="/admin/business">
            BUSINESS
          </Link>
          <Link href="/">VIEW SITE</Link>
        </nav>
      </header>

      <div className={styles.container}>
        <span className={styles.eyebrow}>
          BUSINESS ADMINISTRATION
        </span>

        <h1 className={styles.pageTitle}>
          Portfolio Manager
        </h1>

        <p className={styles.intro}>
          Upload Paola&apos;s original beauty photographs.
          Featured images appear in the public gallery.
        </p>

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

        <section className={styles.uploadPanel}>
          <h2 className={styles.sectionTitle}>
            Upload New Photo
          </h2>

          <form
            onSubmit={uploadPhoto}
            className={styles.uploadForm}
          >
            <label className={styles.field}>
              <span>
                Photo (JPEG, PNG, WebP — max 5 MB)
              </span>

              <input
                id="portfolio-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(e) =>
                  setFile(e.target.files?.[0] ?? null)
                }
              />
            </label>

            <label className={styles.field}>
              <span>Photo Title</span>

              <input
                value={title}
                maxLength={120}
                required
                onChange={(e) =>
                  setTitle(e.target.value)
                }
                placeholder="Bridal Glam"
              />
            </label>

            <label className={styles.field}>
              <span>Category</span>

              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value)
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
              <span>Description (Optional)</span>

              <textarea
                rows={3}
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
              />
            </label>

            <button
              type="submit"
              disabled={
                busy || !file || !title.trim()
              }
              className={styles.primaryButton}
            >
              {busy
                ? "UPLOADING..."
                : "UPLOAD PHOTO"}
            </button>
          </form>
        </section>

        <div className={styles.galleryHeading}>
          <h2>Your Portfolio ({photos.length})</h2>
        </div>

        {photos.length === 0 && (
          <div className={styles.emptyState}>
            No photos yet. Upload your first photo above.
          </div>
        )}

        <div className={styles.galleryGrid}>
          {photos.map((photo) => (
            <article
              key={photo.id}
              className={styles.photoCard}
            >
              <img
                src={photoUrl(photo.image_path)}
                alt={photo.title}
                loading="lazy"
                className={styles.photoImage}
              />

              <div className={styles.photoContent}>
                <strong className={styles.photoTitle}>
                  {photo.title}
                </strong>

                <span className={styles.photoCategory}>
                  {photo.category.replaceAll("_", " ")}
                </span>

                <label className={styles.checkField}>
                  <input
                    type="checkbox"
                    checked={photo.is_featured}
                    disabled={busy}
                    onChange={(e) =>
                      updatePhoto(photo, {
                        is_featured: e.target.checked,
                      })
                    }
                  />
                  Show on public website
                </label>

                <label className={styles.orderField}>
                  Display Order

                  <input
                    type="number"
                    defaultValue={photo.sort_order}
                    key={`${photo.id}-${photo.sort_order}`}
                    onBlur={(e) => {
                      const order = Number(
                        e.target.value
                      );

                      if (
                        Number.isInteger(order) &&
                        order !== photo.sort_order
                      ) {
                        updatePhoto(photo, {
                          sort_order: order,
                        });
                      }
                    }}
                  />
                </label>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removePhoto(photo)}
                  className={styles.deleteButton}
                >
                  DELETE PHOTO
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
