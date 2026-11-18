"use client";

import { useEffect } from "react";
import "./immersive-motion.css";

export default function ImmersiveMotion() {
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    if (reducedMotion.matches) return;

    const root = document.querySelector("main");
    if (!root) return;

    const sections = Array.from(
      root.querySelectorAll("section")
    );

    const cards = Array.from(
      root.querySelectorAll(
        '[class*="serviceCard"], [class*="portfolioCard"]'
      )
    );

    const revealTargets = [...sections, ...cards];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle(
            "paola-visible",
            entry.isIntersecting
          );
        }
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -4% 0px",
      }
    );

    for (const element of revealTargets) {
      element.classList.add("paola-reveal");
      observer.observe(element);
    }

    const hero = root.querySelector('[class*="heroPhoto"]');
    const about = root.querySelector('[class*="aboutPhoto"]');

    let frame = 0;

    function updateParallax() {
      frame = 0;

      const viewportHeight = window.innerHeight;

      for (const element of [hero, about]) {
        if (!(element instanceof HTMLElement)) continue;

        const rect = element.getBoundingClientRect();

        if (
          rect.bottom < 0 ||
          rect.top > viewportHeight
        ) {
          continue;
        }

        const center = rect.top + rect.height / 2;
        const progress =
          (viewportHeight / 2 - center) /
          viewportHeight;

        const movement = Math.max(
          -32,
          Math.min(32, progress * 65)
        );

        element.style.setProperty(
          "--paola-parallax",
          `${movement.toFixed(2)}px`
        );
      }
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(updateParallax);
    }

    window.addEventListener("scroll", onScroll, {
      passive: true,
    });

    window.addEventListener("resize", onScroll);

    updateParallax();

    // Activate only after observers are initialized.
    root.classList.add("paola-motion-enabled");

    return () => {
      observer.disconnect();

      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);

      if (frame) cancelAnimationFrame(frame);

      root.classList.remove("paola-motion-enabled");

      for (const element of revealTargets) {
        element.classList.remove(
          "paola-reveal",
          "paola-visible"
        );
      }

      for (const element of [hero, about]) {
        if (element instanceof HTMLElement) {
          element.style.removeProperty(
            "--paola-parallax"
          );
        }
      }
    };
  }, []);

  return null;
}
