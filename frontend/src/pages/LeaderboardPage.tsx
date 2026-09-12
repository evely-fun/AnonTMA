import { m } from "motion/react";
import { useEffect, useState } from "react";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { request } from "@/shared/lib/api";
import { compactNumber, durationLabel } from "@/shared/lib/format";
import { listStagger, rise } from "@/shared/lib/motion";
import type { LeaderboardEntry } from "@/shared/lib/types";
import { Avatar, ScreenHeader, Segmented, Skeleton } from "@/shared/ui";
import { CrownIcon } from "@/shared/ui/icons";

type Metric = "xp" | "rating" | "voice" | "games";

const METRICS: { value: Metric; label: string }[] = [
  { value: "xp", label: "XP" },
  { value: "rating", label: "Rating" },
  { value: "voice", label: "Voice" },
  { value: "games", label: "Wins" },
];

const format = (metric: Metric, value: number): string =>
  metric === "voice" ? durationLabel(value) : compactNumber(value);

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
    <div className="flex h-full flex-col">
      <ScreenHeader title="Leaderboard" subtitle="top of the week" onBack={() => history.back()} />

      <div className="flex-1 overflow-y-auto pb-[calc(24px+env(safe-area-inset-bottom))] pt-4">
        <div className="px-4">
          <Segmented id="metric" value={metric} onChange={setMetric} options={METRICS} />
        </div>

        {loading ? (
          <div className="mt-4 space-y-2 px-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-[62px]" />
            ))}
          </div>
        ) : (
          <m.div
            className="mt-4 space-y-2 px-4"
            variants={listStagger}
            initial="initial"
            animate="animate"
          >
            {entries.map((entry) => (
              <m.div
                key={entry.userId}
                variants={rise}
                className={`flex items-center gap-3.5 rounded-[18px] px-4 py-3 ${
                  entry.isMe ? "bg-accent-quiet" : "panel"
                }`}
              >
                <span className="flex w-6 justify-center">
                  {entry.rank <= 3 ? (
                    <CrownIcon
                      size={17}
                      className={
                        entry.rank === 1
                          ? "text-warn"
                          : entry.rank === 2
                            ? "text-secondary"
                            : "text-hint"
                      }
                    />
                  ) : (
                    <span className="font-display text-[12.5px] font-extrabold text-hint tabular">
                      {entry.rank}
                    </span>
                  )}
                </span>
                <Avatar seed={entry.avatarSeed} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[14.5px] font-bold tracking-[-0.01em]">
                    {entry.anonName}
                  </span>
                  <span className="font-display text-[11px] font-bold uppercase tracking-[0.1em] text-hint">
                    level {entry.level}
                  </span>
                </span>
                <span className="font-display text-[15px] font-extrabold tabular">
                  {format(metric, entry.value)}
                </span>
              </m.div>
            ))}
          </m.div>
        )}
      </div>
    </div>
  );
};
