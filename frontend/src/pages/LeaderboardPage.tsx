import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { compactNumber, durationLabel } from "@/shared/lib/format";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import type { LeaderboardEntry } from "@/shared/lib/types";
import { Avatar, Panel, PushScreen, ScreenHeader, Segmented, Skeleton } from "@/shared/ui";
import { MedalMark } from "@/shared/ui/marks";

type Metric = "xp" | "rating" | "voice" | "games";

const METRICS: Metric[] = ["xp", "rating", "voice", "games"];

const format = (metric: Metric, value: number): string =>
  metric === "voice" ? durationLabel(value) : compactNumber(value);

/** Second, first, third, so the tallest column sits in the middle. */
const PODIUM_ORDER = [1, 0, 2];

const STEP = ["h-[74px]", "h-[54px]", "h-[42px]"];

export const LeaderboardPage = () => {
  const { t } = useT();
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

  const top = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);
  const mine = entries.find((entry) => entry.isMe);

  return (
    <PushScreen>
      <ScreenHeader
        title={t("leaderboard.title")}
        subtitle={t("leaderboard.subtitle")}
        onBack={() => history.back()}
      />

      <div className="flex-1 overflow-y-auto pb-[calc(24px+env(safe-area-inset-bottom))] pt-4">
        <div className="px-4">
          <Segmented
            id="metric"
            value={metric}
            onChange={setMetric}
            options={METRICS.map((value) => ({
              value,
              label: t(`leaderboard.${value === "games" ? "wins" : value}`),
            }))}
          />
        </div>

        {loading ? (
          <div className="mt-5 space-y-3 px-4">
            <Skeleton className="h-[188px]" />
            <Skeleton className="h-[220px]" />
          </div>
        ) : (
          <m.div variants={listStagger} initial="initial" animate="animate">
            {/* First place is not a row with a crown glyph on it. It stands on
                the tallest step, larger than the other two, and the shape of
                the group says the ranking before a single number is read. */}
            {top.length > 0 && (
              <m.div variants={rise} className="mt-5 flex items-end justify-center gap-1.5 px-4">
                {PODIUM_ORDER.map((slot) => {
                  const entry = top[slot];
                  if (!entry) {
                    return <span key={slot} className="w-[30%]" />;
                  }
                  const first = slot === 0;
                  return (
                    <m.div
                      key={entry.userId}
                      className="flex w-[30%] flex-col items-center"
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...spring.ui, delay: 0.06 * slot }}
                    >
                      <Avatar
                        seed={entry.avatarSeed}
                        style={entry.avatarStyle}
                        frame={entry.frame}
                        size={first ? 64 : 48}
                      />
                      <span className="mt-2 line-clamp-2 w-full text-center font-display text-[12px] font-bold leading-tight">
                        {entry.anonName}
                      </span>
                      <span
                        className={`mt-1.5 flex w-full flex-col items-center justify-center gap-0.5 rounded-t-[16px] ${
                          entry.isMe ? "bg-accent-quiet" : "bg-elevated"
                        } ${STEP[slot]}`}
                      >
                        <span
                          className={`font-display font-extrabold tabular ${
                            first ? "text-[22px]" : "text-[17px]"
                          }`}
                        >
                          {format(metric, entry.value)}
                        </span>
                        <MedalMark place={slot} size={first ? 24 : 20} />
                      </span>
                    </m.div>
                  );
                })}
              </m.div>
            )}

            {rest.length > 0 && (
              <m.div variants={rise} className="mt-6">
                <Panel divided>
                  {rest.map((entry) => (
                    <div
                      key={entry.userId}
                      className={`flex items-center gap-3 px-4 py-2.5 ${
                        entry.isMe ? "bg-accent-quiet" : ""
                      }`}
                    >
                      <span className="w-6 shrink-0 text-right font-display text-[12.5px] font-bold text-hint tabular">
                        {entry.rank}
                      </span>
                      <Avatar
                        seed={entry.avatarSeed}
                        style={entry.avatarStyle}
                        frame={entry.frame}
                        size={32}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">
                        {entry.anonName}
                      </span>
                      <span className="shrink-0 font-display text-[14px] font-extrabold tabular">
                        {format(metric, entry.value)}
                      </span>
                    </div>
                  ))}
                </Panel>
              </m.div>
            )}

            {/* Your own line follows you down the list, so the answer to the
                only question you came with is never scrolled off screen. */}
            {mine && (
              <div className="sticky bottom-3 z-10 mt-3 px-4">
                <div className="panel flex items-center gap-3 rounded-[18px] px-4 py-2.5">
                  <span className="w-6 shrink-0 text-right font-display text-[12.5px] font-bold text-accent tabular">
                    {mine.rank}
                  </span>
                  <Avatar
                    seed={mine.avatarSeed}
                    style={mine.avatarStyle}
                    frame={mine.frame}
                    size={32}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                    {t("leaderboard.you")}
                  </span>
                  <span className="shrink-0 font-display text-[14px] font-extrabold tabular">
                    {format(metric, mine.value)}
                  </span>
                </div>
              </div>
            )}
          </m.div>
        )}
      </div>
    </PushScreen>
  );
};
