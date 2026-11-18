
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../../lib/supabase";
import styles from "./page.module.css";
import CollectionManager from "./CollectionManager";
import { portfolioAdminApi, portfolioAdminLoad } from "../../../lib/portfolio-admin-api";

type Photo = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  image_path: string;
  image_position_y: number;
  image_position_x: number;
  image_zoom: number;
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

  const [editing, setEditing] = useState<Photo | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editImagePositionY, setEditImagePositionY] = useState(0);
  const [editImagePositionX, setEditImagePositionX] = useState(50);
  const [editImageZoom, setEditImageZoom] = useState(100);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPhotos = useCallback(async () => {
    const result = await portfolioAdminLoad<{ photos: Photo[] }>();
    setPhotos(result.photos);
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

      await portfolioAdminApi("createPhoto", { photo: {
        title: title.trim(), category, description: description.trim() || null,
        image_path: path, is_featured: true, sort_order: photos.length + 1,
      }});

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
      await portfolioAdminApi("updatePhoto", { id: photo.id, changes });

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

  function beginEdit(photo: Photo) {
    setEditing(photo);
    setEditTitle(photo.title);
    setEditCategory(photo.category);
    setEditDescription(photo.description ?? "");
    setEditImagePositionY(photo.image_position_y ?? 0);
    setEditImagePositionX(photo.image_position_x ?? 50);
    setEditImageZoom(photo.image_zoom ?? 100);
    setReplacementFile(null);
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    if (busy) return;
    setEditing(null);
    setReplacementFile(null);
  }

  async function saveEditedPhoto(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!editing || busy) return;

    if (!editTitle.trim()) {
      setError("Photo title is required.");
      return;
    }

    const newFile = replacementFile;

    if (newFile) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(
          newFile.type
        )
      ) {
        setError("Use a JPEG, PNG, or WebP image.");
        return;
      }

      if (newFile.size > 5 * 1024 * 1024) {
        setError("Image must be 5 MB or smaller.");
        return;
      }
    }

    setBusy(true);
    setError("");
    setMessage("");

    const supabase = getSupabase();
    let newPath: string | null = null;
    let databaseUpdated = false;

    try {
      if (newFile) {
        const extension =
          newFile.type === "image/png"
            ? "png"
            : newFile.type === "image/webp"
            ? "webp"
            : "jpg";

        newPath = `${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } =
          await supabase.storage
            .from(bucket)
            .upload(newPath, newFile, {
              contentType: newFile.type,
              upsert: false,
            });

        if (uploadError) throw uploadError;
      }

      const changes = {
        title: editTitle.trim(),
        category: editCategory,
        description: editDescription.trim() || null,
        image_position_y: editImagePositionY,
        image_position_x: editImagePositionX,
        image_zoom: editImageZoom,
        ...(newPath ? { image_path: newPath } : {}),
      };

      await portfolioAdminApi("updatePhoto", { id: editing.id, changes });
      databaseUpdated = true;
      // Keep old Storage image until an audited reference-safe cleanup.
      const cleanupWarning = newPath !== null;
      await loadPhotos();

      setEditing(null);
      setReplacementFile(null);

      setMessage(
        cleanupWarning
          ? "Photo updated. Previous image retained safely in Storage."
          : "Portfolio photo updated successfully."
      );
    } catch (err) {
      if (newPath && !databaseUpdated) {
        await supabase.storage
          .from(bucket)
          .remove([newPath]);
      }

      setError(
        err instanceof Error
          ? err.message
          : "Unable to save portfolio changes."
      );

      if (databaseUpdated) {
        setEditing(null);
        setReplacementFile(null);
        try {
          await loadPhotos();
        } catch {
          // Update succeeded; refresh can reload the gallery.
        }
      }
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
      await portfolioAdminApi("deletePhoto", { id: photo.id });
      await loadPhotos();
      setMessage("Photo removed from gallery. Image file retained in Storage for safety.");
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

        <CollectionManager />
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
                Photo (JPEG, PNG, WebP - max 5 MB)
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

        {editing && (
          <section className={styles.editPanel} id="portfolio-editor">
            <div className={styles.editHeader}>
              <h2 className={styles.sectionTitle}>
                Edit Portfolio Photo
              </h2>
              <button
                type="button"
                className={styles.cancelButton}
                disabled={busy}
                onClick={cancelEdit}
              >
                CANCEL
              </button>
            </div>

            <div className={styles.editLayout}>
              <img
                src={photoUrl(editing.image_path)}
                alt={editing.title}
                className={styles.editPreview}
              />

              <form
                className={styles.uploadForm}
                onSubmit={saveEditedPhoto}
              >
                <label className={styles.field}>
                  <span>Photo Title</span>
                  <input
                    value={editTitle}
                    maxLength={120}
                    required
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </label>

                <label className={styles.field}>
                  <span>Category</span>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                  >
                    <option value="makeup">Makeup</option>
                    <option value="bridal">Bridal</option>
                    <option value="hair">Hair Styling</option>
                    <option value="special_event">Special Event</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Description (Optional)</span>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </label>

                                <div className={styles.framingPanel}>
                  <h3>Photo Framing</h3>
                  <p>
                    Zoom and reposition the image for gallery cards.
                    The original photograph stays unchanged.
                  </p>

                  <div className={styles.framingPreview}>
                    {/* PAOLA_ZOOMOUT_ADMIN_V3 */}
                    <img
                      className={styles.framingBlur}
                      src={photoUrl(editing.image_path)}
                      alt=""
                      aria-hidden="true"
                    />
                    <img
                      className={styles.framingMain}
                      src={photoUrl(editing.image_path)}
                      alt={`Framing preview: ${editing.title}`}
                      style={{
                        objectFit: editImageZoom < 100 ? "contain" : "cover",
                        objectPosition: `${editImagePositionX}% ${editImagePositionY}%`,
                        transform: `scale(${editImageZoom / 100})`,
                        transformOrigin: `${editImagePositionX}% ${editImagePositionY}%`,
                      }}
                    />
                  </div>

                  <div className={styles.framingControls}>
                    <label className={styles.framingSlider}>
                      <span>Zoom: {editImageZoom}%</span>
                      <input
                        type="range"
                        min={50}
                        max={300}
                        step={5}
                        value={editImageZoom}
                        disabled={busy}
                        onChange={(e) =>
                          setEditImageZoom(Number(e.target.value))
                        }
                      />
                    </label>

                    <label className={styles.framingSlider}>
                      <span>Horizontal: {editImagePositionX}%</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={editImagePositionX}
                        disabled={busy}
                        onChange={(e) =>
                          setEditImagePositionX(Number(e.target.value))
                        }
                      />
                    </label>

                    <label className={styles.framingSlider}>
                      <span>Vertical: {editImagePositionY}%</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={editImagePositionY}
                        disabled={busy}
                        onChange={(e) =>
                          setEditImagePositionY(Number(e.target.value))
                        }
                      />
                    </label>
                  </div>

                  <div className={styles.framingDirection}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditImagePositionY(v => Math.min(100, v + 5))}
                    >
                      UP
                    </button>
                    <div className={styles.framingDirectionRow}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditImagePositionX(v => Math.min(100, v + 5))}
                      >
                        LEFT
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditImagePositionX(v => Math.max(0, v - 5))}
                      >
                        RIGHT
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditImagePositionY(v => Math.max(0, v - 5))}
                    >
                      DOWN
                    </button>
                  </div>

                  <div className={styles.framingPresets}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditImagePositionX(50);
                        setEditImagePositionY(0);
                      }}
                    >
                      TOP
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditImagePositionX(50);
                        setEditImagePositionY(50);
                      }}
                    >
                      CENTER
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditImagePositionX(50);
                        setEditImagePositionY(0);
                        setEditImageZoom(100);
                      }}
                    >
                      RESET
                    </button>
                  </div>

                  <p className={styles.framingHint}>
                    Adjust the preview, then select SAVE CHANGES.
                    Direction buttons move the visible image in
                    five-percent steps.
                  </p>
                </div>
<label className={styles.field}>
                  <span>Replace Picture (Optional, max 5 MB)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) =>
                      setReplacementFile(e.target.files?.[0] ?? null)
                    }
                  />
                </label>

                <p className={styles.editHint}>
                  Leave the picture field empty to keep the current image.
                </p>

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={busy || !editTitle.trim()}
                >
                  {busy ? "SAVING..." : "SAVE CHANGES"}
                </button>
              </form>
            </div>
          </section>
        )}
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
                style={{
                  objectPosition: `${photo.image_position_x ?? 50}% ${photo.image_position_y ?? 0}%`,
                  transform: `scale(${(photo.image_zoom ?? 100) / 100})`,
                  transformOrigin: `${photo.image_position_x ?? 50}% ${photo.image_position_y ?? 0}%`,
                }}
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
  onClick={() => {
    beginEdit(photo);
    window.setTimeout(() => {
      document.getElementById("portfolio-editor")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }}
  className={styles.editButton}
>
  EDIT PHOTO
</button>
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
