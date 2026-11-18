"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../../../lib/supabase";
import styles from "./CollectionManager.module.css";
import { portfolioAdminApi, portfolioAdminLoad } from "../../../lib/portfolio-admin-api";

type Collection = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  cover_photo_id: string | null;
  sort_order: number;
};

type Photo = {
  id: string;
  title: string;
  category: string;
  image_path: string;
};

type Assignment = {
  collection_id: string;
  photo_id: string;
};

const categories = [
  ["makeup", "Makeup"],
  ["bridal", "Bridal"],
  ["hair", "Hair Styling"],
  ["special_event", "Special Event"],
  ["other", "Other"],
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function CollectionManager() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("makeup");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const result = await portfolioAdminLoad<{
      collections: Collection[]; photos: Photo[]; assignments: Assignment[];
    }>();
    setCollections(result.collections);
    setPhotos(result.photos);
    setAssignments(result.assignments);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e.message ?? e)));
  }, [load]);

  async function perform(
    action: () => Promise<void>,
    success: string
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await action();
      await load();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createCollection(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const slug = slugify(cleanName);

    if (!slug) {
      setError("Enter a valid collection name.");
      return;
    }

    await perform(async () => {
      await portfolioAdminApi("createCollection", { collection: {
        name: cleanName, slug, category,
        sort_order: collections.filter(c => c.category === category).length,
      }});
      setName("");
    }, "Collection created.");
  }

  async function renameCollection(collection: Collection) {
    const value = window.prompt(
      "Collection name:",
      collection.name
    );

    if (value === null) return;

    const newName = value.trim();
    const newSlug = slugify(newName);

    if (!newSlug) {
      setError("Collection name cannot be empty.");
      return;
    }

    await perform(async () => {
      await portfolioAdminApi("renameCollection", { id: collection.id, name: newName, slug: newSlug });
    }, "Collection renamed.");
  }

  async function setCover(
    collection: Collection,
    photoId: string
  ) {
    await perform(async () => {
      await portfolioAdminApi("setCover", { id: collection.id, photo_id: photoId || null });
    }, "Cover photo updated.");
  }

  async function setOrder(
    collection: Collection,
    order: number
  ) {
    if (!Number.isInteger(order)) return;

    await perform(async () => {
      await portfolioAdminApi("setOrder", { id: collection.id, sort_order: order });
    }, "Collection order updated.");
  }

  async function togglePhoto(
    collection: Collection,
    photo: Photo,
    checked: boolean
  ) {
    await perform(async () => {
      await portfolioAdminApi("assignPhoto", {
        collection_id: collection.id, photo_id: photo.id, checked,
      });
    }, "Photo assignment updated.");
  }

  async function removeCollection(collection: Collection) {
    if (!window.confirm(
      `Delete "${collection.name}"? The photos will be kept.`
    )) return;

    await perform(async () => {
      await portfolioAdminApi("deleteCollection", { id: collection.id });
      if (selected === collection.id) setSelected(null);
    }, "Collection deleted. Photos were preserved.");
  }

  const active = collections.find((c) => c.id === selected);
  const availablePhotos = active
    ? photos.filter((p) => p.category === active.category)
    : [];

  return (
    <section className={styles.manager}>
      <h2>Portfolio Collections</h2>
      <p>
        Create collections and organize photos without uploading
        duplicates.
      </p>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {message && <div className={styles.success} role="status">{message}</div>}

      <form onSubmit={createCollection} className={styles.form}>
        <label>
          Main Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label>
          New Collection Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bridal Makeup"
            maxLength={100}
            required
          />
        </label>

        <button disabled={busy || !name.trim()} type="submit">
          CREATE COLLECTION
        </button>
      </form>

      <div className={styles.list}>
        {collections.map((collection) => (
          <div key={collection.id} className={styles.card}>
            <div>
              <strong>{collection.name}</strong>
              <small>{collection.category.replaceAll("_", " ")}</small>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelected(
                  selected === collection.id ? null : collection.id
                )}
              >
                {selected === collection.id ? "CLOSE" : "MANAGE"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => renameCollection(collection)}
              >
                RENAME
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => removeCollection(collection)}
              >
                DELETE
              </button>
            </div>

            <label className={styles.order}>
              Display Order
              <input
                type="number"
                key={`${collection.id}-${collection.sort_order}`}
                defaultValue={collection.sort_order}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (next !== collection.sort_order) {
                    setOrder(collection, next);
                  }
                }}
              />
            </label>
          </div>
        ))}
      </div>

      {active && (
        <div className={styles.editor}>
          <h3>Manage: {active.name}</h3>

          <label className={styles.cover}>
            Collection Cover Photo
            <select
              value={active.cover_photo_id ?? ""}
              disabled={busy}
              onChange={(e) => setCover(active, e.target.value)}
            >
              <option value="">No cover selected</option>
              {availablePhotos.map((photo) => (
                <option key={photo.id} value={photo.id}>
                  {photo.title}
                </option>
              ))}
            </select>
          </label>

          <h4>Photos in this collection</h4>

          {availablePhotos.length === 0 && (
            <p>Upload photos in this main category first.</p>
          )}

          <div className={styles.photos}>
            {availablePhotos.map((photo) => {
              const checked = assignments.some(
                (a) => a.collection_id === active.id &&
                  a.photo_id === photo.id
              );

              const url = getSupabase()
                .storage.from("paola-portfolio")
                .getPublicUrl(photo.image_path).data.publicUrl;

              return (
                <label key={photo.id} className={styles.photo}>
                  <img src={url} alt={photo.title} loading="lazy" />
                  <span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={(e) =>
                        togglePhoto(active, photo, e.target.checked)
                      }
                    />
                    {photo.title}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
