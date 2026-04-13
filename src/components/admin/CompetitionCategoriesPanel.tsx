"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaLayerGroup, FaPlus, FaXmark } from "react-icons/fa6";
import { Button, showToast } from "@/components/ui";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  addCompetitionCategory,
  removeCompetitionCategory,
} from "@/app/admin/actions";
import type { CompetitionCategory } from "@/lib/data/competition-queries";
import styles from "./competitionCategoriesPanel.module.scss";

interface Props {
  competitionId: string;
  categories: CompetitionCategory[];
}

export function CompetitionCategoriesPanel({ competitionId, categories }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await addCompetitionCategory({
        competitionId,
        name,
        displayOrder: categories.length,
      });
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      setName("");
      showToast("Category added", "success");
      router.refresh();
    });
  }

  function handleRemove(categoryId: string) {
    startTransition(async () => {
      const res = await removeCompetitionCategory(categoryId);
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      showToast("Category removed", "success");
      router.refresh();
    });
  }

  return (
    <SectionCard
      title="Categories"
      icon={<FaLayerGroup />}
      subtitle="Optional — climbers self-select a category when they join. Leave this empty for a single open-category competition."
    >
      {categories.length > 0 && (
        <ul className={styles.list}>
          {categories.map((c) => (
            <li key={c.id} className={styles.row}>
              <span className={styles.rowName}>{c.name}</span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => handleRemove(c.id)}
                disabled={pending}
                aria-label={`Remove ${c.name}`}
              >
                <FaXmark aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.addRow} onSubmit={handleAdd}>
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Female, Open, Youth"
          maxLength={60}
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          <FaPlus aria-hidden /> Add
        </Button>
      </form>
    </SectionCard>
  );
}
