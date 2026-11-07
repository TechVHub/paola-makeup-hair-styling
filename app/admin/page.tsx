
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../lib/supabase";

const tools = [
  {
    title: "Appointment Dashboard",
    description:
      "View customer appointments, confirm requests, decline bookings, and mark completed services.",
    href: "/admin/dashboard",
    number: "01",
  },
  {
    title: "Business Management",
    description:
      "Edit services, pricing, appointment durations, business hours, and unavailable dates.",
    href: "/admin/business",
    number: "02",
  },
  {
    title: "Portfolio Manager",
    description:
      "Upload Paola's original photos, organize the gallery, and control which images appear publicly.",
    href: "/admin/portfolio",
    number: "03",
  },
];

export default function AdminHomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAdmin() {
      try {
        const supabase = getSupabase();
        const { data: user } = await supabase.auth.getUser();

        if (!user.user) {
          router.replace("/admin/login");
          return;
        }

        const { data: admin, error } =
          await supabase.rpc("is_paola_admin");

        if (error || admin !== true) {
          router.replace("/admin/login");
          return;
        }

        if (active) setReady(true);
      } catch {
        router.replace("/admin/login");
      }
    }

    checkAdmin();
    return () => { active = false; };
  }, [router]);

  if (!ready) {
    return (
      <main style={{
        minHeight: "100vh",
        background: "#111",
        color: "#fff",
        padding: 50,
      }}>
        Verifying admin access...
      </main>
    );
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "#111",
      color: "#fff",
      padding: "70px 24px",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{
        maxWidth: 1100,
        margin: "0 auto",
      }}>
        <Link href="/" style={{
          color: "#aaa",
          fontSize: 12,
        }}>
          ← RETURN TO WEBSITE
        </Link>

        <p style={{
          marginTop: 55,
          color: "#aaa",
          fontSize: 11,
          letterSpacing: 3,
        }}>
          PAOLA MAKEUP & HAIR STYLES
        </p>

        <h1 style={{
          fontFamily: "Georgia, serif",
          fontWeight: 400,
          fontSize: "clamp(40px, 6vw, 65px)",
        }}>
          Admin Portal
        </h1>

        <p style={{
          color: "#bbb",
          lineHeight: 1.8,
          marginBottom: 45,
        }}>
          Manage every part of your beauty business
          from one place.
        </p>

        <div style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
        }}>
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: 260,
                padding: 30,
                background: "#fff",
                color: "#111",
                textDecoration: "none",
              }}
            >
              <span style={{
                color: "#888",
                fontSize: 12,
              }}>
                {tool.number}
              </span>

              <h2 style={{
                fontFamily: "Georgia, serif",
                fontWeight: 400,
                fontSize: 28,
              }}>
                {tool.title}
              </h2>

              <p style={{
                color: "#666",
                fontSize: 13,
                lineHeight: 1.8,
                flex: 1,
              }}>
                {tool.description}
              </p>

              <strong style={{ fontSize: 12 }}>
                OPEN →
              </strong>
            </Link>
          ))}
        </div>

        <p style={{
          marginTop: 40,
          color: "#888",
          fontSize: 12,
        }}>
          Powered by Supabase authentication
          and database access policies.
        </p>
      </div>
    </main>
  );
}
