"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { categories, loadPhotos, loadCollections, loadCollection, loadAssignments, photoUrl,
  type Photo, type Collection, type Assignment } from "../../lib/public-portfolio";
import PhotoViewer from "./PhotoViewer";
import styles from "./[category]/page.module.css";

function framingStyle(photo: Photo) {
  const x = Math.max(0, Math.min(100, photo.image_position_x ?? 50));
  const y = Math.max(0, Math.min(100, photo.image_position_y ?? 0));
  const zoom = Math.max(100, Math.min(300, photo.image_zoom ?? 100));

  return {
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${zoom / 100})`,
    transformOrigin: `${x}% ${y}%`,
  };
}
export default function PublicPortfolio({ category, slug }: { category: string; slug?: string }) {
  const valid = Object.prototype.hasOwnProperty.call(categories, category);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [collectionLoading, setCollectionLoading] = useState(!slug);
  const [error, setError] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setCollectionLoading(!slug); setError(""); setCollectionError("");
    setPhotos([]); setCollections([]); setAssignments([]); setCollection(null); setSelected(null);
    if (!valid) { setLoading(false); setCollectionLoading(false); return; }
    const photoRequest = loadPhotos(category);
    if (slug !== undefined) {
      (async () => {
        const [found, published] = await Promise.all([loadCollection(category, slug), photoRequest]);
        const links = found ? await loadAssignments([found]) : [];
        const ids = new Set(links.map(a => a.photo_id));
        if (active) { setCollection(found); setPhotos(published.filter(p => ids.has(p.id))); }
      })().catch(() => { if (active) setError("Unable to load this collection. Please try again."); })
        .finally(() => { if (active) setLoading(false); });
    } else {
      photoRequest.then(data => { if (active) setPhotos(data); })
        .catch(() => { if (active) setError("Unable to load photos. Please try again."); })
        .finally(() => { if (active) setLoading(false); });
      (async () => {
        const list = await loadCollections(category);
        const links = await loadAssignments(list);
        if (active) { setCollections(list); setAssignments(links); }
      })().catch(() => { if (active) setCollectionError("Unable to load collections. Please try again."); })
        .finally(() => { if (active) setCollectionLoading(false); });
    }
    return () => { active = false; };
  }, [category, slug, valid, retry]);

  const missing = !valid || (slug !== undefined && !loading && !error && !collection);
  const title = missing ? "Gallery Not Found" : slug !== undefined ? collection?.name ?? "Collection Gallery" : categories[category];
  const photoMap = new Map(photos.map(p => [p.id, p]));
  const members = new Map<string, Set<string>>();
  for (const link of assignments) {
    if (!members.has(link.collection_id)) members.set(link.collection_id, new Set());
    members.get(link.collection_id)!.add(link.photo_id);
  }
  const retryButton = <button type="button" className={styles.retry} onClick={() => setRetry(r => r + 1)}>Try again</button>;
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <img src="/images/paola-logo.png" alt="Paola Makeup & Hair Styles" width={68} height={68} /><span>PAOLA</span>
      </Link>
      <nav className={styles.headerLinks} aria-label="Main navigation">
        <Link href="/#portfolio">HOME GALLERY</Link><Link href="/#services">SERVICES</Link><Link href="/book">BOOK NOW &#8599;</Link>
      </nav>
    </header>
    <section className={styles.intro}>
      <span className={styles.eyebrow}>THE BEAUTY GALLERY</span>
      <h1>{title}</h1>
      <p>{missing ? "This gallery is unavailable." : slug !== undefined
        ? collection?.description || "Explore this collection of Paola's work."
        : `Explore Paola's ${categories[category].toLowerCase()} portfolio.`}</p>
      {slug !== undefined && valid && <Link className={styles.backLink} href={`/portfolio/${category}`}>&larr; Back to {categories[category]}</Link>}
    </section>
    <nav className={styles.categories} aria-label="Portfolio categories">
      {Object.entries(categories).map(([key, label]) => <Link key={key} href={`/portfolio/${key}`}
        className={`${styles.category} ${key === category ? styles.active : ""}`}
        aria-current={key === category ? slug !== undefined ? "location" : "page" : undefined}>{label}</Link>)}
    </nav>
    {valid && slug === undefined && <section className={styles.gallerySection} aria-labelledby="collections-heading" aria-busy={collectionLoading || loading}>
      <h2 id="collections-heading" className={styles.sectionTitle}>Explore Collections</h2>
      {collectionLoading && <p className={styles.notice} role="status">Loading collections...</p>}
      {collectionError && <div className={styles.error} role="alert">{collectionError} {retryButton}</div>}
      {!collectionLoading && !collectionError && collections.length === 0 && <p className={styles.notice}>Collections are coming soon. Explore the photos below.</p>}
      <div className={styles.grid}>
        {collections.map(item => {
          const ids = members.get(item.id) ?? new Set<string>();
          const included = photos.filter(p => ids.has(p.id));
          // Admin permits a cover independent of membership; it must still be public and in this category.
          const cover = (item.cover_photo_id ? photoMap.get(item.cover_photo_id) : undefined) ?? included[0];
          return <Link key={item.id} href={`/portfolio/${category}/${encodeURIComponent(item.slug)}`}
            className={styles.card} aria-label={`View ${item.name} collection`}>
            {cover ? <img src={photoUrl(cover.image_path)} alt={cover.title} loading="lazy" style={framingStyle(cover)} /> : <span className={styles.placeholder}>PAOLA</span>}
            <span className={styles.cardCaption}><strong>{item.name}</strong>
              <span>{loading || error ? "VIEW COLLECTION" : `${included.length} ${included.length === 1 ? "PHOTO" : "PHOTOS"}`} &#8599;</span>
            </span>
          </Link>;
        })}
      </div>
    </section>}
    <section className={styles.gallerySection} aria-label={slug !== undefined ? "Collection photos" : "All category photos"} aria-busy={loading}>
      {valid && slug === undefined && <h2 className={styles.sectionTitle}>All {categories[category]} Photos</h2>}
      {loading && <p className={styles.notice} role="status">Loading photos...</p>}
      {error && <div className={styles.error} role="alert">{error} {retryButton}</div>}
      {!loading && !error && !missing && photos.length === 0 && <p className={styles.notice}>No published photos in this {slug !== undefined ? "collection" : "category"} yet.</p>}
      {missing && <p className={styles.notice}><Link href="/#portfolio">Return to the portfolio</Link></p>}
      <div className={styles.grid}>
        {photos.map((photo, index) => <button type="button" key={photo.id} className={styles.card}
          onClick={() => setSelected(index)} aria-label={`View ${photo.title} full screen`}>
          <img src={photoUrl(photo.image_path)} alt={photo.title} loading="lazy" style={framingStyle(photo)} />
          <span className={styles.cardCaption}><strong>{photo.title}</strong><span>VIEW PHOTO &#8599;</span></span>
        </button>)}
      </div>
    </section>
    <section className={styles.cta}><h2>LOVE WHAT YOU SEE?</h2><p>Book your beauty experience with Paola.</p><Link href="/book">BOOK AN APPOINTMENT &#8599;</Link></section>
    <footer className={styles.footer}><Link href="/">&larr; BACK TO HOME</Link><span>PAOLA MAKEUP & HAIR STYLES</span></footer>
    {selected !== null && photos[selected] && <PhotoViewer photos={photos} initialIndex={selected} onClose={() => setSelected(null)} />}
  </main>;
}
