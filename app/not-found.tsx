import type { Metadata } from "next";
import NotFound from "@/components/NotFound";

export const metadata: Metadata = {
  title: "404 — Lost in the canopy",
  robots: { index: false, follow: false },
};

// Custom 404 for any unmatched route. The wood-themed motion diorama lives in the
// client component; this server file just names the page and drops indexing.
export default function NotFoundPage() {
  return <NotFound />;
}
