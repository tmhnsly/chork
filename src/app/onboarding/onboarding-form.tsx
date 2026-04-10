"use client";

import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { FormField, Button, showToast } from "@/components/ui";
import { completeOnboarding } from "./actions";
import type { Gym } from "@/lib/data";
import styles from "./onboarding.module.scss";

export function OnboardingForm() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const usernameValidation = useUsernameValidation();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(profile?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Gym picker
  const [allGyms, setAllGyms] = useState<Gym[]>([]);
  const [gymQuery, setGymQuery] = useState("");
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [loadingGyms, setLoadingGyms] = useState(true);

  // Load all listed gyms on mount
  useEffect(() => {
    supabase
      .from("gyms")
      .select("*")
      .eq("is_listed", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) console.warn("[chork] gym fetch failed:", error);
        setAllGyms(data ?? []);
        setLoadingGyms(false);
      });
  }, [supabase]);

  // Filter gyms by search query
  const filteredGyms = gymQuery.trim()
    ? allGyms.filter((g) =>
        g.name.toLowerCase().includes(gymQuery.toLowerCase()) ||
        (g.city?.toLowerCase().includes(gymQuery.toLowerCase()) ?? false)
      )
    : allGyms;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !selectedGym) return;

    const valid = await usernameValidation.validate(username, profile.id);
    if (!valid) return;

    setSubmitting(true);
    try {
      const result = await completeOnboarding(username, displayName, selectedGym.id);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      await refreshProfile();
      router.push("/");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Set up your profile</h1>
        <p className={styles.subtitle}>
          Choose a username and pick your gym
        </p>

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
          {usernameValidation.error && (
            <p className={styles.fieldError}>{usernameValidation.error}</p>
          )}
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
              <ul className={styles.gymList}>
                {loadingGyms ? (
                  <li className={styles.gymStatus}>Loading gyms...</li>
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
          disabled={submitting || !username || !selectedGym || !!usernameValidation.error}
          fullWidth
        >
          {submitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </main>
  );
}
