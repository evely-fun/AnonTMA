import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { request } from "@/shared/lib/api";
import { compactNumber, durationLabel } from "@/shared/lib/format";
import { itemVariants, listVariants } from "@/shared/lib/motion";
import type { LeaderboardEntry } from "@/shared/lib/types";
import { Avatar, Screen, Segmented } from "@/shared/ui";

import styles from "./LeaderboardPage.module.css";

type Metric = "xp" | "rating" | "voice" | "games" | "streak";

const METRICS: { value: Metric; label: string }[] = [
  { value: "xp", label: "XP" },
  { value: "rating", label: "Rating" },
  { value: "voice", label: "Voice" },
  { value: "games", label: "Wins" },
];

const formatValue = (metric: Metric, value: number): string => {
  if (metric === "voice") {
    return durationLabel(value);
  }
  return compactNumber(value);
};

export const LeaderboardPage = () => {
  const [metric, setMetric] = useState<Metric>("xp");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useBackButton("/");

  useEffect(() => {
    setLoading(true);
    void request<LeaderboardEntry[]>(`/users/leaderboard?metric=${metric}&limit=50`)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [metric]);

  return (
    <Screen title="Leaderboard" subtitle="top of the week">
      <Segmented id="metric" value={metric} onChange={setMetric} options={METRICS} size="sm" />

      {loading ? (
        <div className={styles.list}>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className={[styles.skeleton, "skeleton"].join(" ")} />
          ))}
        </div>
      ) : (
        <motion.div className={styles.list} variants={listVariants} initial="initial" animate="animate">
          {entries.map((entry) => (
            <motion.div
              key={entry.userId}
              variants={itemVariants}
              className={[
                styles.row,
                entry.isMe ? styles.me : "",
                entry.rank <= 3 ? styles.podium : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className={styles.rank}>
                {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
              </span>
              <Avatar seed={entry.avatarSeed} size={38} level={entry.level} />
              <span className={styles.name}>{entry.anonName}</span>
              <span className={styles.value}>{formatValue(metric, entry.value)}</span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </Screen>
  );
};
