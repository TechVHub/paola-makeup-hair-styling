import { getD1 } from "@/lib/d1";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type FeaturedPhoto = {
  id: string;
  title: string;
  category: string;
  image_path: string;
};

export async function GET() {
  try {
    const db = getD1();

    const result = await db
      .prepare(`
        SELECT id, title, category, image_path
        FROM portfolio_photos
        WHERE is_featured = 1
        ORDER BY sort_order ASC, id ASC
        LIMIT 12
      `)
      .all<FeaturedPhoto>();

    return Response.json(
      { photos: result.results },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Featured portfolio D1 error:", error);

    return Response.json(
      { error: "Unable to load featured portfolio." },
      { status: 500 }
    );
  }
}