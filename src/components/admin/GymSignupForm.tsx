"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, showToast } from "@/components/ui";
import { signupGym } from "@/app/admin/actions";
import styles from "./gymSignupForm.module.scss";

type Plan = "starter" | "pro" | "enterprise";

const PLANS: Array<{ id: Plan; title: string; blurb: string }> = [
  { id: "starter",    title: "Starter",    blurb: "One gym, one admin. Great for a local space getting started." },
  { id: "pro",        title: "Pro",        blurb: "Multi-admin, full dashboard, and comp tooling." },
  { id: "enterprise", title: "Enterprise", blurb: "Multi-gym chains and competition series." },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function GymSignupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [plan, setPlan] = useState<Plan>("starter");

  function handleNameChange(value: string) {
    setName(value);
    // Auto-derive the slug unless the admin has deliberately edited it.
    if (!slugDirty) setSlug(slugify(value));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await signupGym({ name, slug, city, country, planTier: plan });
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Gym created", "success");
      router.push("/admin");
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.label}>Gym name</span>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Yonder Climbing"
          maxLength={80}
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>URL handle</span>
        <input
          className={styles.input}
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(slugify(e.target.value));
            setSlugDirty(true);
          }}
          placeholder="yonder-climbing"
          maxLength={60}
          required
        />
        <span className={styles.hint}>
          Lowercase letters, digits, and hyphens. Used in links to this gym.
        </span>
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>City</span>
          <input
            className={styles.input}
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="London"
            maxLength={80}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Country</span>
          <input
            className={styles.input}
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="GB"
            maxLength={2}
          />
        </label>
      </div>

      <fieldset className={styles.planFieldset}>
        <legend className={styles.label}>Plan</legend>
        <div className={styles.planGrid}>
          {PLANS.map((p) => (
            <label
              key={p.id}
              className={`${styles.planCard} ${plan === p.id ? styles.planCardActive : ""}`}
            >
              <input
                type="radio"
                name="plan"
                value={p.id}
                checked={plan === p.id}
                onChange={() => setPlan(p.id)}
                className={styles.planRadio}
              />
              <span className={styles.planTitle}>{p.title}</span>
              <span className={styles.planBlurb}>{p.blurb}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Creating…" : "Create gym"}
      </Button>
    </form>
  );
}
