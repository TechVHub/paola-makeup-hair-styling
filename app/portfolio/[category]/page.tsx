"use client";
import { useParams } from "next/navigation";
import PublicPortfolio from "../PublicPortfolio";
export default function CategoryGalleryPage() {
  const params = useParams();
  const category = typeof params?.category === "string" ? params.category : "";
  return <PublicPortfolio key={category} category={category} />;
}