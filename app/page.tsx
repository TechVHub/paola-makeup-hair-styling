
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../lib/supabase";
import styles from "./page.module.css";

type Service = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  price_is_starting_at: boolean;
  duration_minutes: number;
  image_path: string | null;
};

type PortfolioPhoto = {
  id: string;
  title: string;
  category: string;
  image_path: string;
};

const SERVICE_BUCKET = "paola-services";
const PORTFOLIO_BUCKET = "paola-portfolio";

const fallbackImages: Record<string, string> = {
  makeup:
    "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=85",
  bridal:
    "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=85",
  hair:
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=85",
  special_event:
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85",
};

const navigation = [
  { label: "HOME", href: "#home" },
  { label: "SERVICES", href: "#services" },
  { label: "PORTFOLIO", href: "#portfolio" },
  { label: "ABOUT", href: "#about" },
  { label: "CONTACT", href: "#contact" },
];

function serviceImage(service: Service) {
  if (service.image_path) {
    return getSupabase()
      .storage.from(SERVICE_BUCKET)
      .getPublicUrl(service.image_path).data.publicUrl;
  }

  return fallbackImages[service.category] ??
    fallbackImages.makeup;
}

function portfolioImage(path: string) {
  return getSupabase()
    .storage.from(PORTFOLIO_BUCKET)
    .getPublicUrl(path).data.publicUrl;
}

function formatPrice(service: Service) {
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(service.price));

  return service.price_is_starting_at
    ? `From ${price}`
    : price;
}

export default function HomePage() {
  const [services, setServices] = useState<Service[]>([]);
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadContent() {
      try {
        const supabase = getSupabase();

        const [serviceResult, photoResult] =
          await Promise.all([
            supabase
              .from("services")
              .select(
                "id,name,category,description,price," +
                "price_is_starting_at,duration_minutes,image_path"
              )
              .eq("is_active", true)
              .order("sort_order"),
            supabase
              .from("portfolio_photos")
              .select("id,title,category,image_path")
              .eq("is_featured", true)
              .order("sort_order")
              .limit(12),
          ]);

        if (serviceResult.error) {
          throw serviceResult.error;
        }

        if (photoResult.error) {
          throw photoResult.error;
        }

        if (!active) return;

        setServices((serviceResult.data ?? []) as Service[]);
        setPhotos(
          (photoResult.data ?? []) as PortfolioPhoto[]
        );
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load website content."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadContent();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <main className={styles.site}>
      <div className={styles.topBar}>
        MAKEUP <span>✦</span> HAIR STYLING
        <span>✦</span> BRIDAL BEAUTY
        <span>✦</span> SPECIAL EVENTS
      </div>

      <header className={styles.header}>
        <Link
          href="/"
          className={styles.brand}
          onClick={closeMenu}
        >
          <span className={styles.brandName}>PAOLA</span>
          <span className={styles.brandSubtitle}>
            MAKEUP & HAIR STYLES
          </span>
        </Link>

        <nav
          className={styles.nav}
          aria-label="Main navigation"
        >
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/book"
          className={styles.headerButton}
        >
          BOOK NOW <span>↗</span>
        </Link>

        <button
          type="button"
          className={styles.menuToggle}
          aria-label={
            menuOpen
              ? "Close navigation menu"
              : "Open navigation menu"
          }
          aria-expanded={menuOpen}
          aria-controls="paola-mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={styles.menuToggleText}>
            {menuOpen ? "CLOSE" : "MENU"}
          </span>

          <span
            className={`${styles.menuIcon} ${
              menuOpen ? styles.menuIconOpen : ""
            }`}
            aria-hidden="true"
          >
            <span />
            <span />
          </span>
        </button>

        <nav
          id="paola-mobile-navigation"
          className={`${styles.mobileNav} ${
            menuOpen ? styles.mobileNavOpen : ""
          }`}
          aria-label="Mobile navigation"
          aria-hidden={!menuOpen}
          inert={!menuOpen}
        >
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={closeMenu}
            >
              {item.label}
            </a>
          ))}

          <Link
            href="/book"
            className={styles.mobileBookButton}
            onClick={closeMenu}
          >
            BOOK AN APPOINTMENT <span>↗</span>
          </Link>
        </nav>
      </header>

      <section id="home" className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>
            <span className={styles.smallLine} />
            PROFESSIONAL MAKEUP & HAIR STYLING
          </div>

          <h1>
            BEAUTY
            <br />
            THAT FEELS
            <br />
            LIKE <em>YOU.</em>
          </h1>

          <p>
            Enhancing your natural beauty with flawless
            makeup, stunning hairstyles, and personalized
            looks for every occasion.
          </p>

          <div className={styles.heroButtons}>
            <Link
              href="/book"
              className={styles.whiteButton}
            >
              BOOK AN APPOINTMENT <span>↗</span>
            </Link>

            <a
              href="#portfolio"
              className={styles.outlineButton}
            >
              VIEW OUR WORK
            </a>
          </div>

          <div className={styles.heroBottom}>
            <span className={styles.heroBottomLine} />
            YOUR BEAUTY IS OUR PASSION
          </div>
        </div>

        <div
          className={styles.heroPhoto}
          role="img"
          aria-label="Paola, professional makeup and hairstyling artist"
        >
          <div className={styles.photoBadge}>
            THE ART OF BEAUTY
            <span>BY PAOLA</span>
          </div>
        </div>
      </section>

      <section
        id="services"
        className={styles.servicesSection}
      >
        <div className={styles.sectionIntro}>
          <span className={styles.sectionLabel}>
            THE PAOLA EXPERIENCE
          </span>

          <h2>OUR SERVICES</h2>
          <div className={styles.headingLine} />

          <p>
            Expert beauty services designed to make
            every moment unforgettable.
          </p>
        </div>

        {loading && (
          <p style={{ textAlign: "center" }}>
            Loading services...
          </p>
        )}

        {error && (
          <p
            role="alert"
            style={{
              textAlign: "center",
              color: "#a33",
              padding: 20,
            }}
          >
            {error}
          </p>
        )}

        {!loading && !error && services.length === 0 && (
          <p style={{ textAlign: "center" }}>
            Services will be available soon.
          </p>
        )}

        <div className={styles.serviceGrid}>
          {services.map((service, index) => (
            <article
              key={service.id}
              className={styles.serviceCard}
            >
              <div className={styles.servicePhoto}>
                <img
                  src={serviceImage(service)}
                  alt={service.name}
                  loading="lazy"
                />

                <span className={styles.serviceNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>

              <div className={styles.serviceDetails}>
                <span className={styles.serviceCategory}>
                  {service.category.replaceAll("_", " ")}
                </span>

                <div className={styles.serviceHeading}>
                  <h3>{service.name}</h3>
                  <strong>{formatPrice(service)}</strong>
                </div>

                <p>
                  {service.description ||
                    "A personalized beauty experience."}
                </p>

                <Link
                  href={`/book?service=${encodeURIComponent(
                    service.id
                  )}`}
                  className={styles.serviceAction}
                >
                  BOOK THIS SERVICE <span>↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="about" className={styles.aboutSection}>
        <div className={styles.aboutPhoto}>
          <img
            src="/images/paola-hero.jpeg"
            alt="Paola, professional beauty artist"
            loading="lazy"
          />
        </div>

        <div className={styles.aboutText}>
          <span className={styles.sectionLabel}>
            MEET YOUR BEAUTY ARTIST
          </span>

          <h2>
            THE BEAUTY
            <br />
            BEHIND
            <br />
            <em>PAOLA.</em>
          </h2>

          <div className={styles.aboutLine} />

          <p>
            At Paola Makeup & Hair Styles, beauty is more
            than an appointment. It is a personalized
            experience designed to make you feel confident,
            radiant, and unforgettable.
          </p>

          <p>
            From flawless makeup applications to beautiful
            hairstyling, every detail is handled with
            creativity, passion, and care.
          </p>

          <Link
            href="/book"
            className={styles.blackButton}
          >
            BOOK WITH PAOLA <span>↗</span>
          </Link>
        </div>
      </section>

      <section
        id="portfolio"
        className={styles.portfolioSection}
      >
        <div className={styles.sectionIntro}>
          <span className={styles.sectionLabel}>
            OUR ARTISTRY
          </span>

          <h2>THE BEAUTY GALLERY</h2>
          <div className={styles.headingLine} />

          <p>
            Explore Paola&apos;s professional makeup and
            hairstyling portfolio.
          </p>
        </div>

        {loading && (
          <p style={{ textAlign: "center" }}>
            Loading gallery...
          </p>
        )}

        {!loading && !error && photos.length === 0 && (
          <p
            style={{
              textAlign: "center",
              color: "#777",
            }}
          >
            Our gallery is coming soon.
          </p>
        )}

        <div className={styles.portfolioGrid}>
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={styles.portfolioCard}
            >
              <img
                src={portfolioImage(photo.image_path)}
                alt={photo.title}
                loading="lazy"
              />

              <div className={styles.portfolioOverlay}>
                <h3>{photo.title}</h3>
                <span>
                  {photo.category
                    .replaceAll("_", " ")
                    .toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        id="contact"
        className={styles.bookingSection}
      >
        <span className={styles.bookingLabel}>
          YOUR NEXT BEAUTY MOMENT AWAITS
        </span>

        <h2>
          READY FOR
          <br />
          YOUR NEXT <em>LOOK?</em>
        </h2>

        <p>
          Let&apos;s create something beautiful together.
          Your perfect glam experience starts here.
        </p>

        <Link
          href="/book"
          className={styles.whiteButton}
        >
          BOOK YOUR APPOINTMENT <span>↗</span>
        </Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogo}>
            PAOLA
          </span>
          <span>MAKEUP & HAIR STYLES</span>
        </div>

        <div className={styles.footerMessage}>
          <strong>YOUR BEAUTY IS OUR PASSION</strong>
          <span>MAKEUP • HAIR • BRIDAL • EVENTS</span>
        </div>

        <div className={styles.footerCopyright}>
          <span>
            © {new Date().getFullYear()} PAOLA
          </span>
          <span>ALL RIGHTS RESERVED</span>
        </div>
      </footer>
    </main>
  );
}
