import { ImageResponse } from "next/og";
import { OG } from "@/lib/og-colors";
import { loadOgFont } from "@/lib/og-fonts";

export const alt =
  "Chork — Climb it. Log it. Top it. Join for free at chork.app.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // Full faces, read from disk — no subsetting to keep in sync with
  // the JSX any more, which is one fewer thing to get quietly wrong
  // when the copy changes.
  const [outfitBlack, outfitSemi] = await Promise.all([
    loadOgFont("Outfit", 900),
    loadOgFont("Outfit", 600),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: OG.bg,
          fontFamily: "Outfit",
        }}
      >
        {/* Lime radial glow — top-right corner */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 900px 700px at 88% 10%, rgba(189, 238, 99, 0.22), transparent 60%)",
          }}
        />
        {/* Secondary warm glow — bottom-left, adds depth */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 700px 500px at 10% 95%, rgba(189, 238, 99, 0.06), transparent 60%)",
          }}
        />

        {/* Glass card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 56,
            width: 1040,
            height: 510,
            padding: "72px 80px",
            borderRadius: 40,
            background:
              "linear-gradient(145deg, rgba(236, 237, 235, 0.055), rgba(236, 237, 235, 0.015))",
            border: "1px solid rgba(236, 237, 235, 0.09)",
            boxShadow:
              "inset 0 1px 0 0 rgba(236, 237, 235, 0.08), 0 40px 80px -20px rgba(0, 0, 0, 0.6)",
          }}
        >
          {/* Logomark + wordmark */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 12,
            }}
          >
            <span
              style={{
                fontSize: 180,
                fontWeight: 900,
                color: OG.fg,
                letterSpacing: "-0.055em",
                lineHeight: 1,
                // Faux italic — Outfit has no italic variant so we
                // skew the glyphs manually. Satori supports skewX on
                // transform; the result is close enough to the brand
                // display preset used across the app.
                transform: "skewX(-8deg)",
              }}
            >
              chork
            </span>
            {/* Lime dot replaces the full stop — matches the favicon */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: OG.accent,
                marginBottom: 18,
                boxShadow: "0 0 40px rgba(189, 238, 99, 0.5)",
              }}
            />
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              gap: 28,
              fontSize: 60,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              color: OG.fg,
              lineHeight: 1,
              transform: "skewX(-8deg)",
            }}
          >
            <span>Climb it.</span>
            <span style={{ color: OG.accent }}>Log it.</span>
            <span>Top it.</span>
          </div>

          {/* CTA pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: "22px 44px",
              borderRadius: 999,
              background: OG.accent,
              color: OG.onAccent,
              fontSize: 34,
              fontWeight: 600,
              fontFamily: "OutfitBody",
              letterSpacing: "-0.01em",
              boxShadow: "0 10px 30px -8px rgba(189, 238, 99, 0.5)",
            }}
          >
            <span>Join for free</span>
            <span style={{ fontSize: 34 }}>→</span>
          </div>
        </div>

        {/* Domain mark — bottom-right of canvas, off-card */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            right: 48,
            fontSize: 22,
            fontWeight: 600,
            fontFamily: "OutfitBody",
            color: "rgba(236, 237, 235, 0.5)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          chork.app
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Outfit",
          data: outfitBlack,
          weight: 900,
          style: "normal",
        },
        {
          name: "OutfitBody",
          data: outfitSemi,
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}
