import { ImageResponse } from "next/og";

export const alt =
  "Chork — Climb it. Log it. Top it. Join for free at chork.app.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Fetch a single weight of a Google Font, subsetted to the exact glyphs we
// render. Subsetting keeps each request tiny (~2-3kb per weight) so the OG
// image builds fast even on a cold Vercel edge invocation.
async function loadGoogleFont(
  family: string,
  weight: number,
  italic: boolean,
  text: string,
): Promise<ArrayBuffer> {
  const ital = italic ? "1" : "0";
  const spec = `${family}:ital,wght@${ital},${weight}`;
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
        spec,
      )}&text=${encodeURIComponent(text)}`,
    )
  ).text();
  const match = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!match) throw new Error(`font fetch failed: ${family} ${weight}`);
  const res = await fetch(match[1]);
  return res.arrayBuffer();
}

export default async function OpengraphImage() {
  const displayText = "chork.CLIMB IT.LOG TOP";
  const bodyText = "chork.appJoin for free→";

  const [outfitBlackItalic, outfitSemi] = await Promise.all([
    loadGoogleFont("Outfit", 900, true, displayText),
    loadGoogleFont("Outfit", 600, false, bodyText),
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
          background: "#111210",
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
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 160,
                fontWeight: 900,
                fontStyle: "italic",
                color: "#ecedeb",
                letterSpacing: "-0.05em",
                lineHeight: 1,
              }}
            >
              chork
            </span>
            {/* Lime dot replaces the full stop — matches the favicon */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: "#bdee63",
                marginTop: 100,
                marginLeft: 8,
                boxShadow: "0 0 40px rgba(189, 238, 99, 0.45)",
              }}
            />
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              gap: 28,
              fontSize: 56,
              fontWeight: 900,
              fontStyle: "italic",
              textTransform: "uppercase",
              letterSpacing: "-0.015em",
              color: "#ecedeb",
              lineHeight: 1,
            }}
          >
            <span>Climb it.</span>
            <span style={{ color: "#bdee63" }}>Log it.</span>
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
              background: "#bdee63",
              color: "#111210",
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
          data: outfitBlackItalic,
          weight: 900,
          style: "italic",
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
