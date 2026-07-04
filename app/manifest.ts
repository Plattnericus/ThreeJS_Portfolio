import type { MetadataRoute } from "next";
import { fetchOwner, ownerLogin } from "@/lib/owner";

// Web app manifest — install prompt metadata + brand colors for SEO/PWA audits.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const owner = await fetchOwner();
  const name = owner?.name ?? ownerLogin();
  return {
    name: `${name} — Star Tree Portfolio`,
    short_name: "Star Tree",
    description:
      "A living GitHub Star Tree: every stargazer becomes a house on a floating island with real-time Alpine weather.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1320",
    theme_color: "#3a2712",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
