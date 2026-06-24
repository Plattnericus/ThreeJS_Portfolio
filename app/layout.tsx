import type { Metadata } from "next";
import "./globals.css";
import { fetchOwner, ownerLogin } from "@/lib/owner";
import { siteUrl } from "@/lib/site";

// SEO is built from the real GitHub owner — nothing hardcoded.
export async function generateMetadata(): Promise<Metadata> {
  const owner = await fetchOwner();
  const login = owner?.login ?? ownerLogin();
  const name = owner?.name ?? login;
  const base = siteUrl();

  const title = `${name} (@${login}) — Developer Portfolio`;
  const description =
    owner?.bio?.replace(/\s+/g, " ").trim() ||
    `${name}'s developer portfolio — a living GitHub Star Tree where every stargazer becomes a house on a floating low-poly island.`;
  const keywords = [
    name,
    login,
    "portfolio",
    "developer",
    "software engineer",
    "GitHub",
    "open source",
    "three.js",
    "web developer",
    owner?.location ?? "",
  ].filter(Boolean);

  return {
    metadataBase: new URL(base),
    title: { default: title, template: `%s — ${name}` },
    description,
    keywords,
    applicationName: `${name} — Portfolio`,
    authors: [{ name, url: owner?.htmlUrl ?? `https://github.com/${login}` }],
    creator: name,
    publisher: name,
    alternates: { canonical: "/" },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
    openGraph: {
      type: "website",
      url: base,
      siteName: `${name} — Portfolio`,
      title,
      description,
      images: owner?.avatarUrl
        ? [{ url: owner.avatarUrl, width: 460, height: 460, alt: name }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: owner?.twitter ? `@${owner.twitter}` : undefined,
      images: owner?.avatarUrl ? [owner.avatarUrl] : undefined,
    },
    category: "technology",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await fetchOwner();
  const login = owner?.login ?? ownerLogin();
  const base = siteUrl();

  // Structured data so search engines (and rich results) understand the person.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: owner?.name ?? login,
    alternateName: login,
    url: base,
    image: owner?.avatarUrl,
    description: owner?.bio ?? undefined,
    jobTitle: "Software Developer",
    worksFor: owner?.company ? { "@type": "Organization", name: owner.company } : undefined,
    address: owner?.location
      ? { "@type": "PostalAddress", addressLocality: owner.location }
      : undefined,
    sameAs: [
      owner?.htmlUrl ?? `https://github.com/${login}`,
      owner?.blog ? (owner.blog.startsWith("http") ? owner.blog : `https://${owner.blog}`) : null,
      owner?.twitter ? `https://x.com/${owner.twitter}` : null,
    ].filter(Boolean),
  };

  return (
    <html lang="en">
      <body className="font-sans">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
