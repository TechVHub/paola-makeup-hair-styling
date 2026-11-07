
"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabase";

type Service = {
  id: string;
  name: string;
  category: string;
  price: number;
  duration_minutes: number;
};

export default function TestDatabasePage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        const supabase = getSupabase();

        const { data, error: queryError } = await supabase
          .from("services")
          .select(
            "id, name, category, price, duration_minutes"
          )
          .eq("is_active", true)
          .order("sort_order");

        if (queryError) {
          throw queryError;
        }

        setServices((data ?? []) as Service[]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unknown database connection error"
        );
      } finally {
        setLoading(false);
      }
    }

    testConnection();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "70px 24px",
        background: "#0b0b0b",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 850,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            letterSpacing: 4,
            fontSize: 12,
            color: "#aaaaaa",
          }}
        >
          PAOLA MAKEUP & HAIR STYLES
        </p>

        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 44,
            fontWeight: 400,
          }}
        >
          Supabase Connection Test
        </h1>

        {loading && <p>Connecting to Supabase...</p>}

        {error && (
          <div
            style={{
              padding: 24,
              border: "1px solid #aa4444",
              marginTop: 30,
            }}
          >
            <h2>Connection failed</h2>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <p
              style={{
                color: "#8ce0aa",
                marginTop: 30,
              }}
            >
              ✓ Successfully connected to Supabase!
            </p>

            <h2>
              Services found: {services.length}
            </h2>

            <div
              style={{
                display: "grid",
                gap: 15,
                marginTop: 25,
              }}
            >
              {services.map((service) => (
                <div
                  key={service.id}
                  style={{
                    border: "1px solid #444444",
                    padding: 25,
                    background: "#181818",
                  }}
                >
                  <h3>{service.name}</h3>

                  <p>
                    Category: {service.category}
                  </p>

                  <p>
                    Price: ${Number(service.price).toFixed(2)}
                  </p>

                  <p>
                    Duration: {service.duration_minutes} minutes
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
