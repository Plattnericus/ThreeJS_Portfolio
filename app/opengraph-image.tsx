import { ImageResponse } from "next/og";
import { fetchOwner, fetchRepoStars, ownerLogin } from "@/lib/owner";

// Dynamic 1200×630 social card, wood/tree themed to match the HUD — a real
// share image instead of the bare GitHub avatar. Regenerated hourly.
export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "A living GitHub Star Tree portfolio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  const [owner, stars] = await Promise.all([fetchOwner(), fetchRepoStars()]);
  const login = owner?.login ?? ownerLogin();
  const name = owner?.name ?? login;
  const avatar = owner?.avatarUrl;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "radial-gradient(circle at 30% 25%, #6b4a26 0%, #4a3118 42%, #3a2712 74%, #241708 100%)",
          color: "#f4e8d0",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* warm inner frame reminiscent of cut wood */}
        <div
          style={{
            position: "absolute",
            inset: 24,
            borderRadius: 28,
            border: "3px solid rgba(201,168,110,0.35)",
            boxShadow: "inset 0 0 0 6px rgba(36,23,8,0.6)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              width={132}
              height={132}
              alt=""
              style={{ borderRadius: "50%", border: "4px solid rgba(224,178,92,0.7)" }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, display: "flex" }}>
              {name}
            </div>
            <div style={{ fontSize: 34, color: "rgba(244,232,208,0.72)", display: "flex" }}>
              {`@${login}`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#e0b25c", display: "flex" }}>
            {stars != null
              ? `${stars.toLocaleString("en-US")} stars — a living GitHub Star Tree`
              : "A living GitHub Star Tree"}
          </div>
          <div style={{ fontSize: 30, color: "rgba(244,232,208,0.82)", maxWidth: 900, display: "flex" }}>
            Every stargazer becomes a house on a floating low-poly island — real
            Alpine weather, a real sun and moon, and seasons.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
