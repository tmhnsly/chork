"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(profile?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Gym search
  const [gymQuery, setGymQuery] = useState("");
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [searchingGyms, setSearchingGyms] = useState(false);

  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (!gymQuery.trim()) {
      setGyms([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchingGyms(true);
      const { data } = await supabase
        .from("gyms")
        .select("*")
        .eq("is_listed", true)
        .ilike("name", `%${gymQuery}%`)
        .order("name")
        .limit(10);
      setGyms(data ?? []);
      setSearchingGyms(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [gymQuery, supabase]);

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

        <FormField
          id="username"
          label="Username *"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          onBlur={() => profile && usernameValidation.validate(username, profile.id)}
          placeholder="your_username"
          required
          error={usernameValidation.error}
        />

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
              <span className={styles.gymName}>{selectedGym.name}</span>
              {selectedGym.city && (
                <span className={styles.gymCity}>{selectedGym.city}</span>
              )}
              <button
                type="button"
                className={styles.gymChange}
                onClick={() => {
                  setSelectedGym(null);
                  setGymQuery("");
                }}
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
              {gyms.length > 0 && (
                <ul className={styles.gymList}>
                  {gyms.map((gym) => (
                    <li key={gym.id}>
                      <button
                        type="button"
                        className={styles.gymOption}
                        onClick={() => {
                          setSelectedGym(gym);
                          setGymQuery("");
                          setGyms([]);
                        }}
                      >
                        <span className={styles.gymName}>{gym.name}</span>
                        {gym.city && (
                          <span className={styles.gymCity}>{gym.city}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searchingGyms && (
                <p className={styles.gymSearching}>Searching...</p>
              )}
              {gymQuery && !searchingGyms && gyms.length === 0 && (
                <p className={styles.gymEmpty}>No gyms found</p>
              )}
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
