"use client";

import { useEffect, useRef, useState } from "react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  FaBolt,
  FaClipboardCheck,
  FaCrown,
  FaEye,
  FaEyeSlash,
  FaFire,
  FaFlag,
  FaMedal,
  FaRankingStar,
  FaStar,
  FaUsers,
} from "react-icons/fa6";
import styles from "./featureGrid.module.scss";

// ═══════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════

type CellState = "empty" | "attempted" | "completed" | "flash";

const SENDS_CELLS: CellState[] = [
  "completed", "flash",     "completed", "attempted", "completed", "empty",
  "attempted", "completed", "flash",     "completed", "empty",     "completed",
];

const CELL_CLASS: Record<CellState, string> = {
  empty: styles.cellEmpty,
  attempted: styles.cellAttempted,
  completed: styles.cellCompleted,
  flash: styles.cellFlash,
};

interface GridVisibleProps {
  children: React.ReactNode;
}

function TileGrid({ children }: GridVisibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.grid} ${visible ? styles.gridVisible : ""}`}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Tile components — each is self-contained with a visual
// specific to the feature it represents.
// ═══════════════════════════════════════════════════════

// ── Chorkboard ──────────────────────────────────────────
// Medium-bento podium scene: three plinths + an animated "@YOU"
// avatar that climbs the ranks on a loop — starts rank 3 (right),
// moves to rank 2 (left), lands on rank 1 (centre) with crown +
// celebration sparkles.

export function ChorkboardTile() {
  return (
    <article className={`${styles.tile} ${styles.tileChorkboard}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.podium}>
          <div className={`${styles.slot} ${styles.slotSecond}`}>
            <div className={`${styles.plinth} ${styles.plinthSilver}`}>
              <span className={styles.plinthNum}>2</span>
            </div>
          </div>
          <div className={`${styles.slot} ${styles.slotFirst}`}>
            <div className={`${styles.plinth} ${styles.plinthGold}`}>
              <span className={styles.plinthNum}>1</span>
            </div>
          </div>
          <div className={`${styles.slot} ${styles.slotThird}`}>
            <div className={`${styles.plinth} ${styles.plinthBronze}`}>
              <span className={styles.plinthNum}>3</span>
            </div>
          </div>

          {/* Climbing avatar — absolute-positioned, transitions
              between the three plinths on a 12s loop. Crown +
              sparkles fire when it reaches rank 1. */}
          <div className={styles.youRiser}>
            <FaCrown className={styles.youCrown} />
            <span className={`${styles.youSpark} ${styles.youSparkA}`}>
              <FaStar />
            </span>
            <span className={`${styles.youSpark} ${styles.youSparkB}`}>
              <FaStar />
            </span>
            <div className={styles.youAvatar}>YOU</div>
          </div>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaRankingStar /></span>
          <h3 className={styles.title}>Chorkboard</h3>
        </div>
        <p className={styles.description}>
          Your gym&rsquo;s live leaderboard. Climb the ranks, hit
          the podium, wear the crown.
        </p>
      </div>
    </article>
  );
}

// ── The Wall ────────────────────────────────────────────
// Mini punch card — 6×2 tile grid cycling through send states on
// a staggered loop so it reads as a live session unfolding.

export function WallTile() {
  return (
    <article className={`${styles.tile} ${styles.tileWall}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.wallGrid}>
          {SENDS_CELLS.map((state, i) => (
            <span
              key={i}
              className={`${styles.cell} ${CELL_CLASS[state]}`}
              style={{ "--i": i } as React.CSSProperties}
            >
              {state === "flash" && <FaBolt className={styles.cellBolt} />}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaClipboardCheck /></span>
          <h3 className={styles.title}>The Wall</h3>
        </div>
        <p className={styles.description}>
          Every route in your gym&rsquo;s current set, as a punch
          card. Tap a tile, log attempts, mark the top.
        </p>
      </div>
    </article>
  );
}

// ── Jams ────────────────────────────────────────────────
// Collaborative route list — JAM badge + roster + three routes,
// each attributed to the crew member who added it. Staggered row
// entry reads as players taking turns.

const JAM_ROUTES = [
  { grade: "V4", name: "Arête",    by: "R", tone: "accent" as const },
  { grade: "V3", name: "Slab",     by: "M", tone: "mono" as const },
  { grade: "V5", name: "Overhang", by: "S", tone: "flash" as const },
];

export function JamsTile() {
  return (
    <article className={`${styles.tile} ${styles.tileJams}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.jamGame}>
          <div className={styles.jamHead}>
            <span className={styles.jamBadge}>JAM</span>
            <div className={styles.jamPlayers}>
              <span className={`${styles.jamPlayer} ${styles.jamPlayeraccent}`}>R</span>
              <span className={`${styles.jamPlayer} ${styles.jamPlayermono}`}>M</span>
              <span className={`${styles.jamPlayer} ${styles.jamPlayerflash}`}>S</span>
            </div>
          </div>
          <ul className={styles.jamBuild}>
            {JAM_ROUTES.map((r, i) => (
              <li
                key={r.name}
                className={styles.jamCardRow}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className={styles.jamGrade}>{r.grade}</span>
                <span className={styles.jamRouteName}>{r.name}</span>
                <span
                  className={`${styles.jamTag} ${styles[`jamTag${r.tone}`]}`}
                  aria-label={`Added by ${r.by}`}
                >
                  {r.by}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaFire /></span>
          <h3 className={styles.title}>Jams</h3>
        </div>
        <p className={styles.description}>
          A climbing game you play anywhere. Build the set with your
          crew as you climb, scores update live.
        </p>
      </div>
    </article>
  );
}

// ── Crews ───────────────────────────────────────────────
// Crew name + overlapping avatar cluster (with dashed halo) + a
// live-activity chip. Reads as a private climbing group with its
// own feed.

const CREW_MEMBERS = [
  { initial: "R", tone: "accent" as const },
  { initial: "M", tone: "mono" as const },
  { initial: "J", tone: "flash" as const },
  { initial: "S", tone: "accent" as const },
  { initial: "T", tone: "mono" as const },
];

// Four crew names that cycle with a reveal effect — each holds for
// ~3s of the 12s loop, fades up + out on entry/exit.
const CREW_NAMES = [
  "STREAK DEMONS",
  "THE CRIMPERS",
  "JUG LIFE",
  "BETA BROS",
];

export function CrewsTile() {
  return (
    <article className={`${styles.tile} ${styles.tileCrews}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.crewPanel}>
          <div className={styles.crewNameTrack}>
            {CREW_NAMES.map((name, i) => (
              <span
                key={name}
                className={styles.crewName}
                style={{ "--i": i } as React.CSSProperties}
              >
                {name}
              </span>
            ))}
          </div>
          <div className={styles.crewClusterWrap}>
            <span className={styles.crewPulse} />
            <div className={styles.crewCluster}>
              {CREW_MEMBERS.map((m, i) => (
                <span
                  key={i}
                  className={`${styles.crewDot} ${styles[`crewDot${m.tone}`]}`}
                  style={{ "--i": i } as React.CSSProperties}
                >
                  {m.initial}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.crewActivity}>
            <span className={styles.crewActivityDot} />
            <span className={styles.crewActivityText}>
              <strong>@rory</strong> flashed V5
            </span>
          </div>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaUsers /></span>
          <h3 className={styles.title}>Crews</h3>
        </div>
        <p className={styles.description}>
          Build a private group. Your own leaderboard, your own
          activity feed, just the climbers you know.
        </p>
      </div>
    </article>
  );
}

// ── Flash ───────────────────────────────────────────────
// Bolt icon pulsing with two expanding rings and a "4 pts" chip.
// The loved pattern — kept as-is.

export function FlashTile() {
  return (
    <article className={`${styles.tile} ${styles.tileFlash}`}>
      <div className={styles.visual} aria-hidden="true">
        <span className={`${styles.flashRing} ${styles.flashRing1}`} />
        <span className={`${styles.flashRing} ${styles.flashRing2}`} />
        <div className={styles.flashCore}>
          <FaBolt className={styles.flashBolt} />
          <span className={styles.flashPts}>4 pts</span>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaBolt /></span>
          <h3 className={styles.title}>Flash it</h3>
        </div>
        <p className={styles.description}>
          First-try sends earn max points and a badge your crew
          can see.
        </p>
      </div>
    </article>
  );
}

// ── Achievements ────────────────────────────────────────
// Gently-bobbing medal with three star satellites popping in
// sequence. The original loved pattern — kept as-is.

export function AchievementsTile() {
  return (
    <article className={`${styles.tile} ${styles.tileAchievements}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.badgeCore}>
          <FaMedal className={styles.badgeIcon} />
          <span className={`${styles.badgeStar} ${styles.badgeStarA}`}>
            <FaStar />
          </span>
          <span className={`${styles.badgeStar} ${styles.badgeStarB}`}>
            <FaStar />
          </span>
          <span className={`${styles.badgeStar} ${styles.badgeStarC}`}>
            <FaStar />
          </span>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaMedal /></span>
          <h3 className={styles.title}>Achievements</h3>
        </div>
        <p className={styles.description}>
          Earn badges for streaks, flashes, podium finishes. Every
          one is permanent.
        </p>
      </div>
    </article>
  );
}

// ── Zone ────────────────────────────────────────────────
// Flag + +1 PT chip. Flag waves gently, chip pops in periodically.

export function ZoneTile() {
  return (
    <article className={`${styles.tile} ${styles.tileZone}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.zoneScene}>
          <FaFlag className={styles.zoneFlag} />
          <span className={styles.zonePts}>
            <span className={styles.zonePtsMain}>+1</span>
            <span className={styles.zonePtsUnit}>PT</span>
          </span>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaFlag /></span>
          <h3 className={styles.title}>Hit the zone</h3>
        </div>
        <p className={styles.description}>
          Reach the bonus hold for a point, even without topping out.
        </p>
      </div>
    </article>
  );
}

// ── Beta spray ──────────────────────────────────────────
// Two chat bubbles — one blurred with eye-slash icon, one revealed —
// cycling through a blur/unblur loop. Matches the app's beta toggle.

export function BetaTile() {
  return (
    <article className={`${styles.tile} ${styles.tileBeta}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={`${styles.betaBubble} ${styles.betaBubbleA}`}>
          <span className={styles.betaMask}>heel hook the big volume</span>
          <FaEyeSlash className={styles.betaLockIcon} />
        </div>
        <div className={`${styles.betaBubble} ${styles.betaBubbleB}`}>
          <span className={styles.betaMask}>match, then cross to the jug</span>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaEye /></span>
          <h3 className={styles.title}>Beta spray</h3>
        </div>
        <p className={styles.description}>
          Send a route to unlock its beta. Until then the hints stay
          blurred. Nobody gets a spoiler.
        </p>
      </div>
    </article>
  );
}

// ═══════════════════════════════════════════════════════
// Main bento — 8 tiles across a 4×3 desktop grid.
//   Row 1: Chorkboard (medium 2×1) + Wall (1×1) + Flash (1×1)
//   Row 2: Jams (2×1) + Zone (1×1) + Achievements (1×1)
//   Row 3: Crews (2×1) + Beta (2×1)
// ═══════════════════════════════════════════════════════

export function FeatureGrid() {
  return (
    <section className={styles.section} aria-labelledby="feature-grid-heading">
      <VisuallyHidden.Root asChild>
        <h2 id="feature-grid-heading">What Chork does</h2>
      </VisuallyHidden.Root>
      <TileGrid>
        <ChorkboardTile />
        <WallTile />
        <FlashTile />
        <JamsTile />
        <ZoneTile />
        <AchievementsTile />
        <CrewsTile />
        <BetaTile />
      </TileGrid>
    </section>
  );
}
