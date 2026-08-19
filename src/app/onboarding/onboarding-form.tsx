"use client";

import { useState, useEffect, type FormEvent } from "react";
import Image from "next/image";
import { FaCheck, FaSpinner, FaLayerGroup, FaUserGroup } from "react-icons/fa6";
import { useAuth } from "@/lib/auth-context";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { RevealText } from "@/components/motion";
import {
  FormField,
  InputError,
  Button,
  ChoiceTiles,
  SearchField,
  showToast,
  shimmerStyles,
  Username,
} from "@/components/ui";
import { completeOnboarding, fetchListedGyms } from "./actions";
import type { Gym } from "@/lib/data";
import { withTimeout } from "@/lib/async";
import styles from "./onboarding.module.scss";

type GymChoice = "unchosen" | "has-chork" | "no-chork";
type Step = "form" | "confirm";

export function OnboardingForm() {
  const { profile, refreshProfile } = useAuth();
  const usernameValidation = useUsernameValidation();

  const [step, setStep] = useState<Step>("form");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(profile?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Gym branch — climbers whose gym has Chork proceed through the
  // picker; climbers who don't can still sign up and start using
  // matches + friends without a gym. They can add one later from settings.
  const [gymChoice, setGymChoice] = useState<GymChoice>("unchosen");
  const [allGyms, setAllGyms] = useState<Gym[]>([]);
  const [gymQuery, setGymQuery] = useState("");
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  // Whether the fetch has come back, NOT whether it is in flight.
  // Derived from that, `loadingGyms` is already true on the very first
  // render after the climber picks "Yes, pick my gym" — where a
  // `setLoadingGyms(true)` inside the effect could only flip it AFTER
  // that paint, so the list rendered "No gyms available" for a frame
  // and then jumped to skeletons. That was the pop-in.
  const [gymsLoaded, setGymsLoaded] = useState(false);
  const loadingGyms = gymChoice === "has-chork" && !gymsLoaded;

  // Only fetch the gym list when the user actually needs it. Saves
  // the fetch entirely for the "no Chork at my gym" path.
  useEffect(() => {
    if (gymChoice !== "has-chork") return;
    if (gymsLoaded) return;
    let live = true;
    fetchListedGyms().then((gyms) => {
      if (!live) return;
      setAllGyms(gyms);
      setGymsLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [gymChoice, gymsLoaded]);

  // Debounced live username validation. 400ms is long enough that a
  // climber typing a name doesn't fire a request per keystroke, short
  // enough that the "Available" / "Taken" feedback feels immediate.
  // The hook itself handles out-of-order responses via a request token.
  useEffect(() => {
    if (!profile) return;
    if (!username) {
      usernameValidation.reset();
      return;
    }
    const handle = setTimeout(() => {
      usernameValidation.validate(username, profile.id);
    }, 400);
    return () => clearTimeout(handle);
    // usernameValidation is stable (useCallback/useRef inside the hook)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, profile?.id]);

  const filteredGyms = gymQuery.trim()
    ? allGyms.filter((g) =>
        g.name.toLowerCase().includes(gymQuery.toLowerCase()) ||
        (g.city?.toLowerCase().includes(gymQuery.toLowerCase()) ?? false)
      )
    : allGyms;

  const canContinue =
    !!username &&
    !usernameValidation.error &&
    usernameValidation.status !== "checking" &&
    (gymChoice === "no-chork" || (gymChoice === "has-chork" && !!selectedGym));

  async function handleReview(e: FormEvent) {
    e.preventDefault();
    if (!profile || !canContinue) return;

    const valid = await usernameValidation.validate(username, profile.id);
    if (!valid) return;

    setStep("confirm");
  }

  async function handleConfirm() {
    if (!profile) return;

    setSubmitting(true);
    try {
      const gymIdForSubmit = gymChoice === "has-chork" ? selectedGym?.id ?? null : null;
      const result = await completeOnboarding(username, displayName, gymIdForSubmit);
      if ("error" in result) {
        showToast(result.error, "error");
        setStep("form");
        return;
      }
      // Best-effort cache freshen so the reloaded home paints the
      // personalised nav immediately. Bounded + swallowed — it must
      // NEVER block the redirect: a hung getUser()/profile fetch here
      // left the form spinning forever with onboarding already saved.
      // The full reload below re-bootstraps auth from scratch anyway.
      try {
        await withTimeout(refreshProfile(), 2500, "onboarding-refresh");
      } catch {
        // ignore — the reload re-fetches the profile
      }
      // Hard nav — `router.push("/")` kept failing to redirect because
      // middleware state (the onboarded cookie) and the RSC cache
      // didn't always line up by the time the client re-navigated.
      // A full reload guarantees the middleware runs with fresh
      // cookies, the profile query reads `onboarded = true`, and
      // every cached server segment is re-fetched.
      window.location.href = "/";
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Confirmation step ────────────────────────────
  if (step === "confirm") {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <RevealText text="Looking good?" as="h1" className={styles.title} />
          <p className={styles.subtitle}>Check your details before we get started</p>

          <div className={styles.confirmDetails}>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Username</span>
              <Username username={username} className={styles.confirmValue} />
            </div>
            {displayName && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Display name</span>
                <span className={styles.confirmValue}>{displayName}</span>
              </div>
            )}
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Gym</span>
              <span className={styles.confirmValue}>
                {gymChoice === "has-chork" && selectedGym ? (
                  <>
                    {selectedGym.name}
                    {selectedGym.city && (
                      <span className={styles.confirmMeta}> · {selectedGym.city}</span>
                    )}
                  </>
                ) : (
                  <>
                    No gym for now
                    <span className={styles.confirmMeta}> · you can add one later</span>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className={styles.confirmActions}>
            <Button onClick={handleConfirm} disabled={submitting} fullWidth>
              {submitting ? "Setting up..." : "Confirm & start climbing"}
            </Button>
            <Button variant="ghost" onClick={() => setStep("form")} fullWidth>
              Go back and edit
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // ── Form step ────────────────────────────────────
  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleReview}>
        <RevealText text="Set up your profile" as="h1" className={styles.title} />
        <p className={styles.subtitle}>Choose a username and tell us about your gym</p>

        <div className={styles.usernameField}>
          <label className={styles.usernameLabel} htmlFor="username">
            Username *
          </label>
          <div
            className={`${styles.usernameInputWrap} ${usernameValidation.error ? styles.usernameInputWrapInvalid : ""}`}
          >
            <span className={styles.usernamePrefix}>@</span>
            <input
              id="username"
              type="text"
              className={styles.usernameInput}
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="your_username"
              required
              autoComplete="off"
              aria-invalid={usernameValidation.error ? true : undefined}
              aria-describedby={usernameValidation.error ? "username-error" : undefined}
            />
            {usernameValidation.status === "checking" && (
              <FaSpinner className={styles.usernameStatusSpinner} aria-label="Checking availability" />
            )}
            {usernameValidation.status === "available" && username && (
              <FaCheck className={styles.usernameStatusOk} aria-label="Username available" />
            )}
          </div>
          <InputError message={usernameValidation.error} id="username-error" />
        </div>

        <FormField
          id="displayName"
          label="Display name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          placeholder="Your Name"
        />

        {/* Gym branch — climbers pick one of two paths before the
            picker appears. Keeping the picker gated behind the
            yes-path means gymless climbers never wait on the gym
            list fetch. */}
        <div className={styles.gymSection}>
          <span id="gym-choice-label" className={styles.gymLabel}>
            Does your gym have Chork? *
          </span>
          {/*
            The first choice a climber makes, so it gets the same tile
            the rest of the app uses for a choice that matters (CLAUDE.md
            "The tile is the app's vocabulary"). It used to be a
            hand-rolled radiogroup with its own roving tabindex and a
            rAF focus dance, whose selected state was a tinted outline
            rather than the accent fill everything else means "chosen"
            with — two ways to drift from one rule.
          */}
          <ChoiceTiles<GymChoice>
            options={[
              {
                value: "has-chork",
                label: "Yes, pick my gym",
                detail: "Log sends, climb the gym leaderboard, see set history.",
                icon: <FaLayerGroup aria-hidden />,
              },
              {
                value: "no-chork",
                label: "Not yet",
                detail:
                  "Run matches with friends anywhere. Add a gym later from settings.",
                icon: <FaUserGroup aria-hidden />,
              },
            ]}
            value={gymChoice}
            onChange={(next) => {
              setGymChoice(next);
              if (next === "no-chork") setSelectedGym(null);
            }}
            ariaLabelledBy="gym-choice-label"
            required
          />
        </div>

        {gymChoice === "has-chork" && (
          <div className={styles.gymSection}>
            <label className={styles.gymLabel} htmlFor="gymSearch">
              Your gym *
            </label>
            {selectedGym ? (
              <div className={styles.gymSelected}>
                <div className={styles.gymInfo}>
                  <span className={styles.gymName}>{selectedGym.name}</span>
                  <span className={styles.gymMeta}>
                    {[selectedGym.city, selectedGym.country].filter(Boolean).join(", ")}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.gymChange}
                  onClick={() => setSelectedGym(null)}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <SearchField
                  id="gymSearch"
                  value={gymQuery}
                  onChange={(e) => setGymQuery(e.target.value)}
                  placeholder="Search for your gym"
                  ariaLabel="Search for your gym"
                />
                <ul className={styles.gymList} aria-busy={loadingGyms}>
                  {loadingGyms ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <li key={`skel-${i}`} className={styles.gymSkeleton}>
                        <div className={`${styles.gymSkeletonLogo} ${shimmerStyles.skeleton}`} />
                        <div className={`${styles.gymSkeletonText} ${shimmerStyles.skeleton}`} />
                      </li>
                    ))
                  ) : filteredGyms.length === 0 ? (
                    <li className={styles.gymStatus}>
                      {gymQuery ? "No gyms found" : "No gyms available"}
                    </li>
                  ) : (
                    filteredGyms.map((gym) => (
                      <li key={gym.id}>
                        <button
                          type="button"
                          className={styles.gymOption}
                          onClick={() => {
                            setSelectedGym(gym);
                            setGymQuery("");
                          }}
                        >
                          {gym.logo_url && (
                            <Image
                              src={gym.logo_url}
                              alt=""
                              width={36}
                              height={36}
                              className={styles.gymLogo}
                              unoptimized
                            />
                          )}
                          <div className={styles.gymInfo}>
                            <span className={styles.gymName}>{gym.name}</span>
                            <span className={styles.gymMeta}>
                              {[gym.city, gym.country].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </div>
        )}

        <Button type="submit" disabled={!canContinue} fullWidth>
          Continue
        </Button>
      </form>
    </main>
  );
}
