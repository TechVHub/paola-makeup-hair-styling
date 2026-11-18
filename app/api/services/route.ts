import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type ServiceRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: string;
  price_is_starting_at: number;
  duration_minutes: number;
  image_path: string | null;
};

export async function GET() {
  try {
    const db = getD1();

    const result = await db
      .prepare(`
        SELECT
          id,
          name,
          category,
          description,
          price,
          price_is_starting_at,
          duration_minutes, image_path
        FROM services
        WHERE is_active = 1
        ORDER BY sort_order ASC, name ASC
      `)
      .all<ServiceRow>();

    const services = result.results.map((service) => ({
      ...service,
      price: Number(service.price),
      price_is_starting_at:
        service.price_is_starting_at === 1,
    }));

    return NextResponse.json(
      { services },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Unable to load services from D1:", error);

    return NextResponse.json(
      { error: "Unable to load services." },
      { status: 500 }
    );
  }
}
