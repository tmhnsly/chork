import { ImageResponse } from "next/og";
import { OG } from "@/lib/og-colors";
import { loadOgFont } from "@/lib/og-fonts";
import { getSharedResult } from "@/lib/data/shared-result";
import { countOf } from "@/lib/plural";

/**
 * The thing that actually gets pasted into the group chat.
 *
 * WhatsApp/iMessage/Slack fetch this with no cookies, so it reads the
 * result through the token like the page does. It renders only what
 * the public page already shows — winner, placements, points — and
 * never attempts (see `shared-result.ts`).
 *
 * Design goal: legible as a thumbnail. Someone glancing at a chat
 * should get "X won, N climbers" without opening anything; the top
 * three are the payload, the rest is chrome.
 */

export const alt = "Chork match result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResultOgImage({ params }: Props) {
  const { token } = await params;
  const result = await getSharedResult(token);

  const title = result?.name?.trim() || "Match result";
  const podium = result?.players.slice(0, 3) ?? [];
  const others = result ? result.playerCount - podium.length : 0;

  // Full faces, read from disk. This route especially wanted it: the
  // old glyph union had to include every climber's display name, so a
  // name with an unusual character rendered in a fallback face.
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
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: OG.bg,
          fontFamily: "Outfit",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 900px 700px at 88% 10%, rgba(189, 238, 99, 0.22), transparent 60%)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: OG.accent,
            }}
          >
            Match result
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 900,
              color: OG.fg,
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>
        </div>

        {/* Podium — the payload. Winner is oversized so the image
            reads at thumbnail size without being opened. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {podium.map((p, i) => (
            <div
              key={p.rank + p.username}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                fontSize: i === 0 ? 52 : 36,
                fontWeight: i === 0 ? 900 : 600,
                color: i === 0 ? OG.accent : OG.muted,
              }}
            >
              <div style={{ display: "flex", width: 60 }}>{p.rank}</div>
              <div style={{ display: "flex", flex: 1 }}>{p.displayName}</div>
              <div style={{ display: "flex" }}>{p.points} pts</div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 28,
            fontWeight: 600,
            color: OG.low,
          }}
        >
          {/* Left slot is the overflow count, and empty when there
              isn't one — it used to fall back to the wordmark, which
              put "chork.app" at both ends of a two-player card. */}
          <div style={{ display: "flex" }}>
            {others > 0 ? `+${countOf(others, "more climber")}` : ""}
          </div>
          <div style={{ display: "flex", color: OG.accent }}>chork.app</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Outfit", data: outfitBlack, weight: 900, style: "normal" },
        { name: "Outfit", data: outfitSemi, weight: 600, style: "normal" },
      ],
    },
  );
}
