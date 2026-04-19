"use client";

import { useEffect, useRef, useState } from "react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  FaChartColumn,
  FaDesktop,
  FaDollarSign,
  FaGlobe,
  FaLock,
  FaMobileScreen,
  FaScaleBalanced,
  FaTabletScreenButton,
  FaTrophy,
  FaUsers,
} from "react-icons/fa6";
import styles from "./gymsFeatureGrid.module.scss";

// ═══════════════════════════════════════════════════════
// Shared wrapper — same IntersectionObserver pattern as the
// landing FeatureGrid so the tile entrance staggers on scroll.
// ═══════════════════════════════════════════════════════

function TileGrid({ children }: { children: React.ReactNode }) {
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
// Tile components
// ═══════════════════════════════════════════════════════

// ── Dashboard (hero 2×2) ───────────────────────────────
// Mini-dashboard composition: big headline number with a cycling
// sub-label, grade pyramid bars growing, stat chips at the bottom.

const PYRAMID_BARS = [
  { grade: "V2", h: 30 },
  { grade: "V3", h: 58 },
  { grade: "V4", h: 92 },
  { grade: "V5", h: 78 },
  { grade: "V6", h: 48 },
  { grade: "V7", h: 22 },
];

const DASHBOARD_METRICS = [
  { value: "68%", label: "FLASH RATE" },
  { value: "142", label: "CLIMBERS TODAY" },
  { value: "+18%", label: "THIS WEEK" },
];

export function DashboardTile() {
  return (
    <article className={`${styles.tile} ${styles.tileDashboard}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.dashboard}>
          <span className={styles.dashboardEyebrow}>YOUR WALL</span>
          <div className={styles.dashboardHeadline}>
            <span className={styles.dashboardBigValueTrack}>
              {DASHBOARD_METRICS.map((m, i) => (
                <span
                  key={m.label}
                  className={styles.dashboardBigValue}
                  style={{ "--i": i } as React.CSSProperties}
                >
                  {m.value}
                </span>
              ))}
            </span>
            <span className={styles.dashboardBigLabelTrack}>
              {DASHBOARD_METRICS.map((m, i) => (
                <span
                  key={m.label}
                  className={styles.dashboardBigLabel}
                  style={{ "--i": i } as React.CSSProperties}
                >
                  {m.label}
                </span>
              ))}
            </span>
          </div>
          <div className={styles.pyramid}>
            {PYRAMID_BARS.map((bar, i) => (
              <div
                key={bar.grade}
                className={styles.pyramidCol}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span
                  className={styles.pyramidBar}
                  style={{ "--h": `${bar.h}%` } as React.CSSProperties}
                />
                <span className={styles.pyramidLabel}>{bar.grade}</span>
              </div>
            ))}
          </div>
          <div className={styles.dashboardChips}>
            <span className={styles.dashboardChip}>SET #5 · LIVE</span>
            <span className={styles.dashboardChip}>12 DAYS</span>
          </div>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaChartColumn /></span>
          <h3 className={styles.title}>Real numbers on your wall</h3>
        </div>
        <p className={styles.description}>
          See which routes are getting flashed, which are gathering
          dust, and how your setters&rsquo; grades hold up against
          climber votes.
        </p>
      </div>
    </article>
  );
}

// ── Competitions (2×1 wide) ───────────────────────────

export function CompetitionsTile() {
  return (
    <article className={`${styles.tile} ${styles.tileCompetitions}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.compCard}>
          <FaTrophy className={styles.compTrophy} />
          <div className={styles.compBody}>
            <span className={styles.compTitle}>SPRING THROWDOWN</span>
            <div className={styles.compStats}>
              <span className={styles.compStat}>3 GYMS</span>
              <span className={styles.compStat}>127 CLIMBERS</span>
            </div>
            <div className={styles.compBar}>
              <span className={styles.compBarFill} />
              <span className={styles.compBarLabel}>4d LEFT</span>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaTrophy /></span>
          <h3 className={styles.title}>Competitions built in</h3>
        </div>
        <p className={styles.description}>
          Weekly sprints. Seasonal ladders. Multi-gym events. Chork
          keeps score; you run the event.
        </p>
      </div>
    </article>
  );
}

// ── Crews (2×1 wide) ──────────────────────────────────
// Reuses the landing-Crews pattern — cycling crew-name pills + an
// avatar cluster with dashed halo + a live activity chip.

const CREW_MEMBERS = [
  { initial: "R", tone: "accent" as const },
  { initial: "M", tone: "mono" as const },
  { initial: "J", tone: "flash" as const },
  { initial: "S", tone: "accent" as const },
  { initial: "T", tone: "mono" as const },
];

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
          <h3 className={styles.title}>Crews keep regulars coming</h3>
        </div>
        <p className={styles.description}>
          Climbers form small private groups with their own
          leaderboard. Mates chase each other up the board all week.
        </p>
      </div>
    </article>
  );
}

// ── Grading scales (1×1 sq) ───────────────────────────
// Big grade display cycles V6 → 7A → 45 PT. Three scale chips below,
// one highlighted per stage.

const GRADE_STAGES = [
  { value: "V6",   label: "V scale",   i: 0 },
  { value: "7A",   label: "Font",      i: 1 },
  { value: "45",   label: "Points",    i: 2 },
];

export function GradingTile() {
  return (
    <article className={`${styles.tile} ${styles.tileGrading}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.gradingCore}>
          <span className={styles.gradingDisplayTrack}>
            {GRADE_STAGES.map((g) => (
              <span
                key={g.label}
                className={styles.gradingDisplay}
                style={{ "--i": g.i } as React.CSSProperties}
              >
                {g.value}
              </span>
            ))}
          </span>
          <div className={styles.gradingChips}>
            {GRADE_STAGES.map((g) => (
              <span
                key={g.label}
                className={styles.gradingChip}
                style={{ "--i": g.i } as React.CSSProperties}
              >
                {g.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaScaleBalanced /></span>
          <h3 className={styles.title}>Any grading scale</h3>
        </div>
        <p className={styles.description}>
          V, Font or points. Each set picks its own. Grades settle as
          climbers vote.
        </p>
      </div>
    </article>
  );
}

// ── Free for climbers (1×1 sq) ────────────────────────

export function FreeTile() {
  return (
    <article className={`${styles.tile} ${styles.tileFree}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.freeCore}>
          <span className={styles.freePrice}>
            <span className={styles.freeCurrency}>£</span>
            <span className={styles.freeNumber}>0</span>
          </span>
          <span className={styles.freeLabel}>PER CLIMBER</span>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaDollarSign /></span>
          <h3 className={styles.title}>Free for climbers</h3>
        </div>
        <p className={styles.description}>
          Every climber who walks through the door gets full access. No
          subscription, no trial, no upsell.
        </p>
      </div>
    </article>
  );
}

// ── No install (2×1 wide) ─────────────────────────────
// Browser URL bar mockup + a row of device icons with a rotating
// highlight cycling across phone / tablet / laptop.

const DEVICES = [
  { Icon: FaMobileScreen, i: 0 },
  { Icon: FaTabletScreenButton, i: 1 },
  { Icon: FaDesktop, i: 2 },
];

export function NoInstallTile() {
  return (
    <article className={`${styles.tile} ${styles.tileNoInstall}`}>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.installCard}>
          <div className={styles.urlBar}>
            <FaLock className={styles.urlLock} />
            <span className={styles.urlText}>chork.app</span>
          </div>
          <div className={styles.deviceRow}>
            {DEVICES.map(({ Icon, i }) => (
              <span
                key={i}
                className={styles.deviceChip}
                style={{ "--i": i } as React.CSSProperties}
              >
                <Icon />
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaHead}>
          <span className={styles.icon}><FaGlobe /></span>
          <h3 className={styles.title}>Nothing to install</h3>
        </div>
        <p className={styles.description}>
          Chork lives on the web. One URL, any device. Home-screen
          icon on Android and iOS in two taps.
        </p>
      </div>
    </article>
  );
}

// ═══════════════════════════════════════════════════════
// Main bento — six gym-owner-facing tiles.
//   Dashboard (2×2 hero) · Competitions (2×1) · Crews (2×1)
//   Grading (1×1) · Free (1×1) · NoInstall (2×1)
// ═══════════════════════════════════════════════════════

export function GymsFeatureGrid() {
  return (
    <section className={styles.section} aria-labelledby="gyms-features-heading">
      <VisuallyHidden.Root asChild>
        <h2 id="gyms-features-heading">What gym owners get</h2>
      </VisuallyHidden.Root>
      <TileGrid>
        <DashboardTile />
        <CompetitionsTile />
        <CrewsTile />
        <GradingTile />
        <FreeTile />
        <NoInstallTile />
      </TileGrid>
    </section>
  );
}
