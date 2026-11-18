"use client";
import { useParams } from "next/navigation";
import PublicPortfolio from "../../PublicPortfolio";
export default function CollectionGalleryPage() {
  const params = useParams();
  const category = typeof params?.category === "string" ? params.category : "";
  const slug = typeof params?.slug === "string" ? params.slug : "";
  return <PublicPortfolio key={`${category}/${slug}`} category={category} slug={slug} />;
}
