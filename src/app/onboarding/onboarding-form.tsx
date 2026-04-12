"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { RevealText } from "@/components/motion";
import { FormField, InputError, Button, showToast, shimmerStyles } from "@/components/ui";
import { completeOnboarding, fetchListedGyms } from "./actions";
import type { Gym } from "@/lib/data";
import styles from "./onboarding.module.scss";

type Step = "form" | "confirm";

export function OnboardingForm() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const usernameValidation = useUsernameValidation();

  const [step, setStep] = useState<Step>("form");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(profile?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Gym picker
  const [allGyms, setAllGyms] = useState<Gym[]>([]);
  const [gymQuery, setGymQuery] = useState("");
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [loadingGyms, setLoadingGyms] = useState(true);

  useEffect(() => {
    fetchListedGyms().then((gyms) => {
      setAllGyms(gyms);
      setLoadingGyms(false);
    });
  }, []);

  const filteredGyms = gymQuery.trim()
    ? allGyms.filter((g) =>
        g.name.toLowerCase().includes(gymQuery.toLowerCase()) ||
        (g.city?.toLowerCase().includes(gymQuery.toLowerCase()) ?? false)
      )
    : allGyms;

  async function handleReview(e: FormEvent) {
    e.preventDefault();
    if (!profile || !selectedGym) return;

    const valid = await usernameValidation.validate(username, profile.id);
    if (!valid) return;

    setStep("confirm");
  }

  async function handleConfirm() {
    if (!profile || !selectedGym) return;

    setSubmitting(true);
    try {
      const result = await completeOnboarding(username, displayName, selectedGym.id);
      if ("error" in result) {
        showToast(result.error, "error");
        setStep("form");
        return;
      }
      await refreshProfile();
      router.push("/");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Confirmation step ────────────────────────────
  if (step === "confirm" && selectedGym) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <RevealText text="Looking good?" as="h1" className={styles.title} />
          <p className={styles.subtitle}>Check your details before we get started</p>

          <div className={styles.confirmDetails}>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Username</span>
              <span className={styles.confirmValue}>@{username}</span>
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
                {selectedGym.name}
                {selectedGym.city && (
                  <span className={styles.confirmMeta}> · {selectedGym.city}</span>
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
        <p className={styles.subtitle}>Choose a username and pick your gym</p>

        <div className={styles.usernameField}>
          <label className={styles.usernameLabel} htmlFor="username">
            Username *
          </label>
          <div className={styles.usernameInputWrap}>
            <span className={styles.usernamePrefix}>@</span>
            <input
              id="username"
              type="text"
              className={styles.usernameInput}
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              onBlur={() => profile && usernameValidation.validate(username, profile.id)}
              placeholder="your_username"
              required
              autoComplete="off"
            />
          </div>
          <InputError message={usernameValidation.error} />
        </div>

        <FormField
          id="displayName"
          label="Display name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          placeholder="Your Name"
        />

        {/* Gym picker */}
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
              <input
                id="gymSearch"
                type="text"
                className={styles.gymInput}
                value={gymQuery}
                onChange={(e) => setGymQuery(e.target.value)}
                placeholder="Search for your gym..."
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

        <Button
          type="submit"
          disabled={!username || !selectedGym || !!usernameValidation.error}
          fullWidth
        >
          Continue
        </Button>
      </form>
    </main>
  );
}
