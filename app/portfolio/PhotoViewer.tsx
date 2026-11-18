"use client";
import { useEffect, useRef, useState } from "react";
import { type Photo, photoUrl } from "../../lib/public-portfolio";
import styles from "./[category]/page.module.css";

export default function PhotoViewer({ photos, initialIndex, onClose }: {
  photos: Photo[]; initialIndex: number; onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const dialog = useRef<HTMLDialogElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const move = (step: number) => setIndex(i => (i + step + photos.length) % photos.length);
  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const photo = photos[index];
  return <dialog ref={dialog} className={styles.lightbox}
    aria-label={`Photo viewer: ${photo.title}`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    }}>
    <button type="button" className={styles.close} onClick={onClose} aria-label="Close photo viewer" autoFocus>&times;</button>
    {photos.length > 1 && <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => move(-1)} aria-label="Previous photo">&lsaquo;</button>}
    <figure className={styles.viewer}
      onTouchStart={event => {
        const point = event.touches[0];
        touch.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
      }}
      onTouchCancel={() => { touch.current = null; }}
      onTouchEnd={event => {
        const start = touch.current;
        touch.current = null;
        if (!start || event.touches.length) return;
        const point = event.changedTouches[0];
        const dx = point.clientX - start.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(point.clientY - start.y) * 1.5) move(dx < 0 ? 1 : -1);
      }}>
      <img src={photoUrl(photo.image_path)} alt={photo.title} />
      <figcaption aria-live="polite">
        <strong>{photo.title}</strong>
        {photo.description && <p>{photo.description}</p>}
        <span>{index + 1} / {photos.length}</span>
      </figcaption>
    </figure>
    {photos.length > 1 && <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => move(1)} aria-label="Next photo">&rsaquo;</button>}
  </dialog>;
}
